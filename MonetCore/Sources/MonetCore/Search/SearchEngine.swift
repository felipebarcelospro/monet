import Foundation

/// A single search result.
public struct SearchResult: Sendable, Hashable, Identifiable {
  /// The id of the matching note.
  public var id: String { noteID }
  /// The id of the matching note.
  public var noteID: String
  /// The display title of the note.
  public var title: String
  /// The vault-relative path of the note.
  public var path: String
  /// The score produced by the ranking function; higher is better.
  public var score: Double
  /// A short excerpt around the match, when the match was in the body.
  public var excerpt: String?
  /// The matched body range, when the match was in the body.
  public var matchRange: Range<String.Index>?

  public init(
    noteID: String,
    title: String,
    path: String,
    score: Double,
    excerpt: String? = nil,
    matchRange: Range<String.Index>? = nil
  ) {
    self.noteID = noteID
    self.title = title
    self.path = path
    self.score = score
    self.excerpt = excerpt
    self.matchRange = matchRange
  }
}

/// A full-text, fuzzy search engine over a `VaultIndex`.
///
/// Ranking is deterministic and documented so the results are reproducible
/// between the Swift app and the TypeScript CLI:
///
/// 1. Exact title match — 1000
/// 2. Title prefix — 700
/// 3. Title contains — 500
/// 4. Alias match — 450 / 380
/// 5. Tag match — 300
/// 6. Fuzzy title match — 250 scaled by similarity
/// 7. Body substring — 200 scaled by match density
///
/// Ties are broken by title, then by path.
public struct SearchEngine: Sendable {
  /// The index that is searched.
  public let index: VaultIndex
  /// The pre-computed lowercased body of every note.
  private let bodies: [String: String]

  public init(index: VaultIndex) {
    self.index = index
    var bodies: [String: String] = [:]
    for note in index.notes {
      bodies[note.id] = note.body.lowercased()
    }
    self.bodies = bodies
  }

  /// Runs a search and returns the best matches.
  ///
  /// - Parameters:
  ///   - query: The raw search string.
  ///   - limit: The maximum number of results to return.
  ///   - tagFilter: When set, only notes carrying this tag are considered.
  public func search(_ query: String, limit: Int = 50, tagFilter: String? = nil) -> [SearchResult] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let candidates = tagFilter.map { index.notes(tagged: $0) } ?? index.notes

    guard !trimmed.isEmpty else {
      return candidates
        .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        .prefix(limit)
        .map { SearchResult(noteID: $0.id, title: $0.title, path: $0.relativePath, score: 1) }
    }

    let needle = trimmed.lowercased()
    var results: [SearchResult] = []

    for note in candidates {
      let lowerTitle = note.title.lowercased()
      var score = 0.0
      var excerpt: String?
      var matchRange: Range<String.Index>?

      if lowerTitle == needle {
        score = 1000
      } else if lowerTitle.hasPrefix(needle) {
        score = 700
      } else if lowerTitle.contains(needle) {
        score = 500
      } else if note.aliases.contains(where: { $0.lowercased() == needle }) {
        score = 450
      } else if note.aliases.contains(where: { $0.lowercased().contains(needle) }) {
        score = 380
      } else if note.tags.contains(where: { $0.lowercased().contains(needle) }) {
        score = 300
      } else if let similarity = fuzzySimilarity(needle: needle, haystack: lowerTitle), similarity > 0.55 {
        score = 250 * similarity
      } else if let body = bodies[note.id], let range = body.range(of: needle) {
        let density = Double(needle.count) / Double(max(1, body.count))
        score = 200 + density * 100
        excerpt = makeExcerpt(body: note.body, range: range)
        matchRange = range
      }

      if score > 0 {
        results.append(
          SearchResult(
            noteID: note.id,
            title: note.title,
            path: note.relativePath,
            score: score,
            excerpt: excerpt,
            matchRange: matchRange
          )
        )
      }
    }

    return results
      .sorted { lhs, rhs in
        if lhs.score != rhs.score { return lhs.score > rhs.score }
        if lhs.title != rhs.title { return lhs.title < rhs.title }
        return lhs.path < rhs.path
      }
      .prefix(limit)
      .map { $0 }
  }

  /// Scores how well `needle` fuzzily matches `haystack`.
  ///
  /// A subsequence match is required. The score rewards early matches, long
  /// matches and contiguous runs.
  public func fuzzySimilarity(needle: String, haystack: String) -> Double? {
    guard !needle.isEmpty, !haystack.isEmpty else { return nil }

    var needleIndex = needle.startIndex
    var haystackIndex = haystack.startIndex
    var matches = 0
    var contiguous = 0
    var bestContiguous = 0
    var firstMatchOffset = 0
    var didFindFirst = false

    while needleIndex < needle.endIndex, haystackIndex < haystack.endIndex {
      if needle[needleIndex] == haystack[haystackIndex] {
        matches += 1
        if !didFindFirst {
          firstMatchOffset = haystack.distance(from: haystack.startIndex, to: haystackIndex)
          didFindFirst = true
          contiguous = 1
        } else {
          contiguous += 1
        }
        bestContiguous = max(bestContiguous, contiguous)
        needleIndex = needle.index(after: needleIndex)
      } else {
        contiguous = 0
      }
      haystackIndex = haystack.index(after: haystackIndex)
    }

    guard matches == needle.count else { return nil }

    let coverage = Double(matches) / Double(needle.count)
    let contiguity = Double(bestContiguous) / Double(needle.count)
    let positionPenalty = 1.0 - (Double(firstMatchOffset) / Double(max(1, haystack.count))) * 0.2
    return min(1.0, (coverage * 0.5 + contiguity * 0.5) * positionPenalty)
  }

  /// Builds a short excerpt centred on a match.
  func makeExcerpt(body: String, range: Range<String.Index>) -> String {
    let context = 60
    let lower = body.index(range.lowerBound, offsetBy: -context, limitedBy: body.startIndex) ?? body.startIndex
    let upper = body.index(range.upperBound, offsetBy: context, limitedBy: body.endIndex) ?? body.endIndex

    var excerpt = String(body[lower..<upper])
    excerpt = excerpt.replacingOccurrences(of: "\n", with: " ")
    if lower != body.startIndex { excerpt = "…" + excerpt }
    if upper != body.endIndex { excerpt += "…" }
    return excerpt.trimmingCharacters(in: .whitespaces)
  }
}
