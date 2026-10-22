import Foundation

/// Resolves wikilink targets to concrete notes, the way Obsidian does.
///
/// Resolution order:
/// 1. Exact vault-relative path match (`Folder/Note`), with or without `.md`.
/// 2. File-name match, case-insensitive, when the target has no folder part.
/// 3. Alias match, case-insensitive.
/// 4. Heading-only links (`[[#Section]]`) resolve to the note they appear in.
///
/// When several notes share a file name the resolver picks a deterministic
/// winner: the closest folder to the linking note first, then the shortest
/// path, then the lexicographically smallest path.
public struct LinkResolver: Sendable {
  /// A note reduced to the fields the resolver needs.
  public struct Candidate: Sendable, Hashable {
    public var id: String
    public var relativePath: String
    public var title: String
    public var aliases: [String]
    public var folder: String

    public init(id: String, relativePath: String, title: String, aliases: [String], folder: String) {
      self.id = id
      self.relativePath = relativePath
      self.title = title
      self.aliases = aliases
      self.folder = folder
    }
  }

  /// All notes in the vault, keyed by note id.
  private let notesByID: [String: Candidate]
  /// Notes indexed by their lowercased vault-relative path (with `.md`).
  private let byPath: [String: Candidate]
  /// Notes indexed by their lowercased file name (without extension).
  private let byFileName: [String: [Candidate]]
  /// Notes indexed by their lowercased aliases.
  private let byAlias: [String: [Candidate]]

  public init(notes: [Candidate]) {
    var notesByID: [String: Candidate] = [:]
    var byPath: [String: Candidate] = [:]
    var byFileName: [String: [Candidate]] = [:]
    var byAlias: [String: [Candidate]] = [:]

    for note in notes {
      notesByID[note.id] = note
      byPath[note.relativePath.lowercased()] = note

      let fileName = ((note.relativePath as NSString).lastPathComponent as NSString)
        .deletingPathExtension
        .lowercased()
      byFileName[fileName, default: []].append(note)

      for alias in note.aliases {
        let key = alias.trimmingCharacters(in: .whitespaces).lowercased()
        guard !key.isEmpty else { continue }
        byAlias[key, default: []].append(note)
      }
    }

    self.notesByID = notesByID
    self.byPath = byPath
    self.byFileName = byFileName
    self.byAlias = byAlias
  }

  /// Resolves a wikilink target to a note id.
  ///
  /// - Parameters:
  ///   - target: The raw target text, e.g. `Note`, `Folder/Note` or `Note.md`.
  ///   - sourceFolder: The folder of the note containing the link. Used to
  ///     break ties between notes that share a file name.
  /// - sourceID: The id of the note containing the link. Heading-only links
  ///     resolve to this note.
  public func resolve(target: String, sourceFolder: String = "", sourceID: String? = nil) -> String? {
    let trimmed = target.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return sourceID }

    // Heading-only link: `[[#Section]]`.
    if trimmed.hasPrefix("#") {
      return sourceID
    }

    let withoutExtension = stripMarkdownExtension(trimmed)
    let lowercased = withoutExtension.lowercased()

    // 1. Exact path match, with and without the `.md` suffix.
    if let match = byPath[lowercased + ".md"] { return match.id }
    if let match = byPath[lowercased] { return match.id }
    if let match = notesByID[lowercased] { return match.id }

    // 2. File name match (only when the target has no folder component).
    if !lowercased.contains("/") {
      if let candidates = byFileName[lowercased], !candidates.isEmpty {
        return pickBest(candidates, sourceFolder: sourceFolder)?.id
      }
    } else {
      // A folder-qualified target may still match by trailing path segments.
      let segments = lowercased.split(separator: "/").map(String.init)
      if let tail = segments.last {
        if let candidates = byFileName[tail], !candidates.isEmpty {
          let filtered = candidates.filter { candidate in
            candidate.relativePath.lowercased().hasSuffix(lowercased + ".md")
          }
          if let match = pickBest(filtered.isEmpty ? candidates : filtered, sourceFolder: sourceFolder) {
            return match.id
          }
        }
      }
    }

    // 3. Alias match.
    if let candidates = byAlias[lowercased], !candidates.isEmpty {
      return pickBest(candidates, sourceFolder: sourceFolder)?.id
    }

    // 4. Title match — a note titled exactly like the target.
    let titleMatches = notesByID.values.filter { $0.title.lowercased() == lowercased }
    if let match = pickBest(Array(titleMatches), sourceFolder: sourceFolder) {
      return match.id
    }

    return nil
  }

  /// Resolves a link relative to a specific source note.
  public func resolve(link: Wikilink, source: Note) -> String? {
    resolve(target: link.target, sourceFolder: source.folder, sourceID: source.id)
  }

  /// Removes a trailing Markdown extension from a target.
  public func stripMarkdownExtension(_ target: String) -> String {
    let lowered = target.lowercased()
    for ext in [".md", ".markdown", ".canvas"] where lowered.hasSuffix(ext) {
      return String(target.dropLast(ext.count))
    }
    return target
  }

  /// Picks the most plausible candidate when several notes match.
  ///
  /// Preference order: same folder, then a folder-prefix match, then the
  /// shortest path, then the lexicographically smallest path.
  func pickBest(_ candidates: [Candidate], sourceFolder: String) -> Candidate? {
    guard !candidates.isEmpty else { return nil }
    if candidates.count == 1 { return candidates[0] }

    let sourcePrefix = sourceFolder.isEmpty ? "" : sourceFolder.lowercased() + "/"

    let scored = candidates.map { candidate -> (Candidate, Int, Int, String) in
      let path = candidate.relativePath.lowercased()
      var score = 0
      if !sourceFolder.isEmpty && candidate.folder.lowercased() == sourceFolder.lowercased() { score += 100 }
      if !sourcePrefix.isEmpty && path.hasPrefix(sourcePrefix) { score += 50 }
      if candidate.folder.isEmpty { score += 10 }
      return (candidate, score, candidate.relativePath.count, path)
    }

    return scored.sorted { lhs, rhs in
      if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
      if lhs.2 != rhs.2 { return lhs.2 < rhs.2 }
      return lhs.3 < rhs.3
    }.first?.0
  }
}
