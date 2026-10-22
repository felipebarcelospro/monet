import Foundation

/// Errors raised while decoding a Markdown document.
public enum FrontmatterError: Error, Sendable, Equatable {
  /// The document started with `---` but never closed the frontmatter block.
  case unterminatedFrontmatter
  /// A line inside the frontmatter block was not a key/value pair.
  case malformedLine(line: Int, content: String)
}

/// A parsed Markdown document split into frontmatter and body.
public struct MarkdownDocument: Sendable, Equatable {
  /// The decoded frontmatter keys.
  public var frontmatter: [String: YAMLValue]
  /// The Markdown body with the frontmatter block removed.
  public var body: String
  /// The original, unmodified file contents.
  public var raw: String

  public init(frontmatter: [String: YAMLValue], body: String, raw: String) {
    self.frontmatter = frontmatter
    self.body = body
    self.raw = raw
  }

  /// Splits raw Markdown into frontmatter and body.
  ///
  /// A frontmatter block must be the very first thing in the file, delimited
  /// by `---` lines. Anything else is treated as body content, which matches
  /// Obsidian's behaviour of ignoring horizontal rules at the top of a file.
  public static func parse(_ raw: String) throws -> MarkdownDocument {
    let normalized = raw.replacingOccurrences(of: "\r\n", with: "\n")
    let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false)

    guard let first = lines.first, first.trimmingCharacters(in: .whitespaces) == "---" else {
      return MarkdownDocument(frontmatter: [:], body: normalized, raw: raw)
    }

    var closing: Int?
    for index in 1..<max(1, lines.count) where lines[index].trimmingCharacters(in: .whitespaces) == "---" {
      closing = index
      break
    }

    guard let closingIndex = closing else {
      throw FrontmatterError.unterminatedFrontmatter
    }

    let frontmatterLines = lines[1..<closingIndex].map(String.init)
    let body = lines[(closingIndex + 1)...].joined(separator: "\n")

    return MarkdownDocument(
      frontmatter: try parseFrontmatterBlock(frontmatterLines),
      body: body,
      raw: raw
    )
  }

  /// A significant line inside a frontmatter block.
  private struct FrontmatterLine {
    let indent: Int
    let text: String
    let number: Int
  }

  /// Parses a YAML subset: scalars, inline sequences, block sequences and
  /// nested mappings expressed with indentation.
  static func parseFrontmatterBlock(_ lines: [String]) throws -> [String: YAMLValue] {
    var significant: [FrontmatterLine] = []
    for (offset, raw) in lines.enumerated() {
      let withoutComment = stripComment(raw)
      let trimmed = withoutComment.trimmingCharacters(in: .whitespaces)
      if trimmed.isEmpty { continue }
      let indent = raw.prefix { $0 == " " }.count
      significant.append(FrontmatterLine(indent: indent, text: trimmed, number: offset + 1))
    }

    var index = 0
    guard !significant.isEmpty else { return [:] }
    return try parseMappingBlock(significant, index: &index, indent: significant[0].indent)
  }

  /// Parses a block of `key: value` pairs at a given indentation level.
  private static func parseMappingBlock(
    _ lines: [FrontmatterLine],
    index: inout Int,
    indent: Int
  ) throws -> [String: YAMLValue] {
    var mapping: [String: YAMLValue] = [:]

    while index < lines.count {
      let line = lines[index]

      if line.indent < indent { break }
      if line.indent > indent {
        // A stray deeper-indented line: consume it so parsing always advances.
        index += 1
        continue
      }
      if line.text.hasPrefix("- ") || line.text == "-" { break }

      guard let separator = line.text.firstIndex(of: ":") else {
        throw FrontmatterError.malformedLine(line: line.number, content: line.text)
      }

      let key = String(line.text[line.text.startIndex..<separator]).trimmingCharacters(in: .whitespaces)
      let rest = String(line.text[line.text.index(after: separator)...]).trimmingCharacters(in: .whitespaces)
      index += 1

      guard rest.isEmpty else {
        mapping[key] = parseScalarOrSequence(rest)
        continue
      }

      // The value is a nested block. Decide between a sequence and a mapping
      // by looking at the next significant line.
      guard index < lines.count else {
        mapping[key] = .null
        continue
      }
      let next = lines[index]
      guard next.indent > line.indent else {
        mapping[key] = .null
        continue
      }

      if next.text.hasPrefix("- ") || next.text == "-" {
        var items: [YAMLValue] = []
        let sequenceIndent = next.indent
        while index < lines.count,
              lines[index].indent == sequenceIndent,
              lines[index].text.hasPrefix("- ") || lines[index].text == "-" {
          let item = String(lines[index].text.dropFirst()).trimmingCharacters(in: .whitespaces)
          index += 1
          items.append(parseScalarOrSequence(item))
        }
        mapping[key] = .array(items)
      } else {
        mapping[key] = .mapping(try parseMappingBlock(lines, index: &index, indent: next.indent))
      }
    }

    return mapping
  }

  /// Removes a trailing `#` comment that is not inside a quoted scalar.
  static func stripComment(_ raw: String) -> String {
    var quote: Character?
    for (offset, character) in raw.enumerated() {
      if let active = quote {
        if character == active { quote = nil }
        continue
      }
      if character == "\"" || character == "'" {
        quote = character
        continue
      }
      if character == "#", offset == 0 || raw[raw.index(raw.startIndex, offsetBy: offset - 1)] == " " {
        return String(raw[raw.startIndex..<raw.index(raw.startIndex, offsetBy: offset)])
      }
    }
    return raw
  }

  /// Parses a scalar or an inline `[a, b]` sequence.
  static func parseScalarOrSequence(_ raw: String) -> YAMLValue {
    let value = raw.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("[") && value.hasSuffix("]") {
      let inner = String(value.dropFirst().dropLast())
      return .array(splitInlineSequence(inner).map { parseScalarOrSequence($0) })
    }
    return parseScalar(value)
  }

  /// Splits an inline sequence body on commas that are not nested or quoted.
  static func splitInlineSequence(_ body: String) -> [String] {
    var items: [String] = []
    var current = ""
    var depth = 0
    var quote: Character?
    for character in body {
      if let active = quote {
        current.append(character)
        if character == active { quote = nil }
        continue
      }
      switch character {
      case "\"": quote = character; current.append(character)
      case "[": depth += 1; current.append(character)
      case "]": depth -= 1; current.append(character)
      case "," where depth == 0:
        items.append(current.trimmingCharacters(in: .whitespaces))
        current = ""
      default: current.append(character)
      }
    }
    if !current.trimmingCharacters(in: .whitespaces).isEmpty {
      items.append(current.trimmingCharacters(in: .whitespaces))
    }
    return items.filter { !$0.isEmpty }
  }

  /// Parses a scalar into the most specific YAML value.
  static func parseScalar(_ raw: String) -> YAMLValue {
    let value = raw.trimmingCharacters(in: .whitespaces)
    if value.isEmpty { return .null }
    if value.hasPrefix("\"") && value.hasSuffix("\"") && value.count >= 2 {
      return .string(unquote(value))
    }
    if value.hasPrefix("'") && value.hasSuffix("'") && value.count >= 2 {
      return .string(String(value.dropFirst().dropLast()))
    }
    switch value.lowercased() {
    case "true", "yes": return .bool(true)
    case "false", "no": return .bool(false)
    case "null", "~": return .null
    default: break
    }
    if let intValue = Int(value) { return .int(intValue) }
    if let doubleValue = Double(value), value.contains(where: { $0 == "." || $0 == "e" || $0 == "E" }) {
      return .double(doubleValue)
    }
    return .string(value)
  }

  /// Removes surrounding quotes from a scalar.
  static func unquote(_ raw: String) -> String {
    let value = raw.trimmingCharacters(in: .whitespaces)
    if value.count >= 2, value.hasPrefix("\""), value.hasSuffix("\"") {
      return String(value.dropFirst().dropLast())
    }
    if value.count >= 2, value.hasPrefix("'"), value.hasSuffix("'") {
      return String(value.dropFirst().dropLast())
    }
    return value
  }
}
