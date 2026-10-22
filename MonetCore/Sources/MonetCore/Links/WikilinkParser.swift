import Foundation

/// Extracts `[[wikilinks]]`, `![[embeds]]`, `#tags` and headings from Markdown.
///
/// The parser is deliberately lexical rather than a full Markdown AST: the
/// vault format only needs inline constructs, and a lexical scanner keeps the
/// Swift and TypeScript implementations byte-compatible.
public enum WikilinkParser {
  /// Parses every wikilink and embed in a Markdown body.
  ///
  /// Links inside fenced code blocks and inline code spans are ignored, which
  /// matches Obsidian's behaviour.
  public static func parseLinks(in body: String) -> [Wikilink] {
    var links: [Wikilink] = []
    for segment in codeMaskedSegments(in: body) {
      for link in parseLinksInSegment(segment.text, baseOffset: segment.offset) {
        links.append(link)
      }
    }
    return links
  }

  /// Parses every heading in a Markdown body.
  public static func parseHeadings(in body: String) -> [Heading] {
    var headings: [Heading] = []
    var inFence = false
    var activeFence = ""

    for (offset, rawLine) in lineRanges(in: body) {
      let line = body[rawLine]
      let trimmed = line.trimmingCharacters(in: .whitespaces)

      if let marker = fenceMarker(trimmed) {
        if inFence, marker == activeFence { inFence = false; activeFence = "" }
        else if !inFence { inFence = true; activeFence = marker }
        continue
      }
      if inFence { continue }

      guard trimmed.hasPrefix("#") else { continue }
      let hashes = trimmed.prefix { $0 == "#" }
      guard hashes.count <= 6 else { continue }
      let afterHashes = trimmed.dropFirst(hashes.count)
      guard afterHashes.hasPrefix(" ") else { continue }

      let title = afterHashes.trimmingCharacters(in: .whitespaces)
      headings.append(
        Heading(title: title, level: hashes.count, range: offset..<(offset + line.count))
      )
    }
    return headings
  }

  /// Extracts inline `#tags` from a Markdown body.
  ///
  /// A tag must start at a word boundary, contain no whitespace and must not
  /// be a Markdown heading. Tags may be nested with `/` (`#project/monet`).
  public static func parseTags(in body: String) -> [String] {
    var tags: [String] = []
    var seen: Set<String> = []

    for segment in codeMaskedSegments(in: body) {
      let text = segment.text
      var index = text.startIndex
      while index < text.endIndex {
        let character = text[index]
        let previous = index == text.startIndex ? " " : String(text[text.index(before: index)])
        let isBoundary = previous == " " || previous == "\n" || previous == "\t"
          || previous == "(" || previous == "[" || previous == "{"
          || previous == ">" || previous == ","

        if character == "#", isBoundary {
          // The scan always advances by at least one character, so a `#`
          // that is not followed by a tag name cannot loop forever.
          var end = text.index(after: index)
          while end < text.endIndex {
            let candidate = text[end]
            if candidate.isWhitespace || candidate == "#" { break }
            end = text.index(after: end)
          }
          let raw = String(text[index..<end])
          // The leading `#` is the marker, not part of the name.
          let name = String(raw.dropFirst()).trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!?)"))
          if !name.isEmpty, !name.contains(where: { $0.isWhitespace }) {
            let normalized = name.lowercased()
            if seen.insert(normalized).inserted { tags.append(name) }
          }
          index = end
          continue
        }
        index = text.index(after: index)
      }
    }
    return tags
  }

  // MARK: - Internals

  /// A run of text that is not inside a code block or inline code span.
  private struct MaskedSegment {
    let text: String
    let offset: Int
  }

  /// Splits the body into segments that are safe to scan for links.
  private static func codeMaskedSegments(in body: String) -> [MaskedSegment] {
    var segments: [MaskedSegment] = []
    var current = ""
    var currentOffset = 0
    var cursor = body.startIndex
    var inFence = false
    var activeFence = ""

    while cursor < body.endIndex {
      let newlineIndex = body[cursor...].firstIndex(of: "\n") ?? body.endIndex
      let line = String(body[cursor..<newlineIndex])
      let trimmed = line.trimmingCharacters(in: .whitespaces)

      if let marker = fenceMarker(trimmed) {
        if inFence {
          if marker == activeFence {
            inFence = false
            activeFence = ""
            if !current.isEmpty {
              segments.append(MaskedSegment(text: current, offset: currentOffset))
              current = ""
            }
          }
        } else {
          inFence = true
          activeFence = marker
          if !current.isEmpty {
            segments.append(MaskedSegment(text: current, offset: currentOffset))
            current = ""
          }
          currentOffset = body[body.startIndex..<cursor].utf8.count
        }
        cursor = newlineIndex < body.endIndex ? body.index(after: newlineIndex) : body.endIndex
        continue
      }

      if inFence {
        cursor = newlineIndex < body.endIndex ? body.index(after: newlineIndex) : body.endIndex
        continue
      }

      // Inline code spans are blanked out, keeping the surrounding text intact.
      let withoutInlineCode = removingInlineCode(line)

      if current.isEmpty { currentOffset = body[body.startIndex..<cursor].utf8.count }
      current += withoutInlineCode

      cursor = newlineIndex < body.endIndex ? body.index(after: newlineIndex) : body.endIndex
    }

    if !current.isEmpty { segments.append(MaskedSegment(text: current, offset: currentOffset)) }
    return segments
  }

  /// Removes `` `code` `` spans from a single line, preserving offsets of the
  /// remaining text by replacing the span with spaces.
  static func removingInlineCode(_ line: String) -> String {
    guard line.contains("`") else { return line }
    var output = ""
    var index = line.startIndex
    while index < line.endIndex {
      if line[index] == "`" {
        let close = line[line.index(after: index)...].firstIndex(of: "`")
        if let close {
          let span = line[index...close]
          output += String(repeating: " ", count: span.count)
          index = line.index(after: close)
          continue
        }
      }
      output.append(line[index])
      index = line.index(after: index)
    }
    return output
  }

  /// Detects a fenced code block marker, returning the marker character.
  static func fenceMarker(_ trimmedLine: String) -> String? {
    for marker in ["```", "~~~"] where trimmedLine.hasPrefix(marker) {
      return marker
    }
    return nil
  }

  /// Yields the byte range of every line in the body.
  static func lineRanges(in body: String) -> [(Int, Range<String.Index>)] {
    var result: [(Int, Range<String.Index>)] = []
    var offset = 0
    var index = body.startIndex
    while index <= body.endIndex {
      let next = body[index...].firstIndex(of: "\n") ?? body.endIndex
      result.append((offset, index..<next))
      if next == body.endIndex { break }
      offset += body[index...next].utf8.count
      index = body.index(after: next)
    }
    return result
  }

  /// Parses wikilinks in a single code-free segment.
  static func parseLinksInSegment(_ text: String, baseOffset: Int) -> [Wikilink] {
    var links: [Wikilink] = []
    var index = text.startIndex

    while index < text.endIndex {
      let character = text[index]
      let isEmbed = character == "!" && text[text.index(after: index)...].first == "["
      let bracketIndex = isEmbed ? text.index(after: index) : index

      guard bracketIndex < text.endIndex, text[bracketIndex] == "[" else {
        index = text.index(after: index)
        continue
      }

      // The opening `[[` needs two characters; a lone `[` is not a link.
      let afterBracket = text.index(after: bracketIndex)
      guard afterBracket < text.endIndex, text[afterBracket] == "[" else {
        index = text.index(after: index)
        continue
      }

      let closing = text[afterBracket...].firstIndex(of: "]")
      guard let closing, text.index(closing, offsetBy: 1, limitedBy: text.endIndex) != nil,
            text[text.index(after: closing)] == "]" else {
        index = text.index(after: index)
        continue
      }

      let contentStart = text.index(after: text.index(after: bracketIndex))
      let content = String(text[contentStart..<closing])

      guard !content.isEmpty else {
        index = text.index(after: closing)
        continue
      }

      let parsed = splitContent(content)
      let startOffset = baseOffset + text[..<bracketIndex].utf8.count
      let endOffset = startOffset + (text[bracketIndex...closing].utf8.count + 1)

      links.append(
        Wikilink(
          target: parsed.target,
          display: parsed.display,
          anchor: parsed.anchor,
          isEmbed: isEmbed,
          range: startOffset..<endOffset
        )
      )

      index = text.index(after: closing)
      index = text.index(after: index)
    }

    return links
  }

  /// Splits `Target|Display#Anchor` into its three parts.
  static func splitContent(_ content: String) -> (target: String, display: String?, anchor: String?) {
    var target = content
    var display: String?
    var anchor: String?

    if let pipe = target.firstIndex(of: "|") {
      display = String(target[target.index(after: pipe)...]).trimmingCharacters(in: .whitespaces)
      target = String(target[target.startIndex..<pipe])
    }

    if let hash = target.firstIndex(of: "#") {
      anchor = String(target[target.index(after: hash)...]).trimmingCharacters(in: .whitespaces)
      target = String(target[target.startIndex..<hash])
    }

    return (target.trimmingCharacters(in: .whitespaces), display, anchor)
  }
}
