import Foundation

/// A `[[wikilink]]` or `![[embed]]` found inside a note.
public struct Wikilink: Sendable, Hashable, Codable {
  /// The literal target text between the brackets, before any `|` or `#`.
  public var target: String
  /// The optional display text after a pipe (`[[Note|shown]]`).
  public var display: String?
  /// The optional heading or block reference after a hash (`[[Note#Section]]`).
  public var anchor: String?
  /// Whether the link was written as an embed (`![[Note]]`).
  public var isEmbed: Bool
  /// The character offset in the source text where the link starts.
  public var range: Range<Int>

  public init(
    target: String,
    display: String? = nil,
    anchor: String? = nil,
    isEmbed: Bool = false,
    range: Range<Int> = 0..<0
  ) {
    self.target = target
    self.display = display
    self.anchor = anchor
    self.isEmbed = isEmbed
    self.range = range
  }

  /// The target without a trailing Markdown extension.
  public var targetWithoutExtension: String {
    let lowered = target.lowercased()
    for ext in [".md", ".markdown", ".canvas", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf"] where lowered.hasSuffix(ext) {
      return String(target.dropLast(ext.count))
    }
    return target
  }

  /// The target with a `.md` extension appended when it has no extension yet.
  public var normalizedTarget: String {
    let base = targetWithoutExtension
    return base.lowercased().hasSuffix(".md") ? base : base + ".md"
  }

  /// The text shown to the reader.
  public var label: String {
    if let display, !display.isEmpty { return display }
    if !target.isEmpty { return target }
    return anchor ?? ""
  }
}

/// A Markdown heading found in a note.
public struct Heading: Sendable, Hashable, Codable {
  /// The heading text without the leading `#` markers.
  public var title: String
  /// The heading level (1 for `#`, 2 for `##`, ...).
  public var level: Int
  /// The character offset in the body where the heading starts.
  public var range: Range<Int>

  public init(title: String, level: Int, range: Range<Int> = 0..<0) {
    self.title = title
    self.level = level
    self.range = range
  }
}
