import AppKit
import Foundation

/// Applies Markdown syntax colours to an attributed string.
///
/// The highlighter is deliberately regex based: it runs on every keystroke,
/// so it has to be fast and it must never change the text content, only the
/// attributes.
@MainActor
enum MarkdownHighlighter {
  /// The base font applied to the whole text.
  static var baseFont: NSFont {
    NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)
  }

  /// The paragraph style of the body text.
  static var bodyParagraph: NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.lineHeightMultiple = 1.28
    style.paragraphSpacing = 0
    return style
  }

  /// The paragraph style of a heading.
  static func headingParagraph(level: Int) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.lineHeightMultiple = 1.12
    style.paragraphSpacingBefore = level == 1 ? 4 : 12
    style.paragraphSpacing = 2
    return style
  }

  /// Re-colours an attributed string in place.
  ///
  /// - Parameters:
  ///   - text: The attributed string to update.
  ///   - theme: The colours to use.
  static func highlight(_ text: NSMutableAttributedString, theme: EditorTheme) {
    let full = NSRange(location: 0, length: text.length)

    // Reset to the base appearance.
    text.setAttributes(
      [
        .font: baseFont,
        .foregroundColor: theme.body,
        .backgroundColor: NSColor.clear,
        .paragraphStyle: bodyParagraph,
      ],
      range: full
    )

    guard text.length > 0 else { return }

    apply(pattern: #"(?m)^(#{1,6})\s+(.*)$"#, to: text) { match in
      let level = match.numberOfRanges > 1 ? match.range(at: 1).length : 1
      let size = 21.0 - Double(level - 1) * 1.5
      return [
        .font: NSFont.monospacedSystemFont(ofSize: size, weight: .bold),
        .foregroundColor: theme.heading,
        .paragraphStyle: headingParagraph(level: level),
      ]
    }

    apply(pattern: #"(?m)^\s*>\s?"#, to: text) { _ in
      [.foregroundColor: theme.quote]
    }

    apply(pattern: #"(?m)^\s*([-+*]|\d+\.)\s"#, to: text) { _ in
      [.foregroundColor: theme.marker]
    }

    apply(pattern: #"`[^`\n]+`"#, to: text) { _ in
      [
        .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular),
        .foregroundColor: theme.code,
      ]
    }

    apply(pattern: #"!?\[\[[^\]\n]*\]\]"#, to: text) { _ in
      [
        .foregroundColor: theme.link,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
        .underlineColor: theme.link.withAlphaComponent(0.4),
      ]
    }

    apply(pattern: #"(?<![\w/])#[\w\-/]+"#, to: text) { _ in
      [.foregroundColor: theme.tag]
    }

    apply(pattern: #"\*\*[^*\n]+\*\*"#, to: text) { _ in
      [
        .font: NSFont.monospacedSystemFont(ofSize: 14, weight: .bold),
        .foregroundColor: theme.emphasis,
      ]
    }

    apply(pattern: #"(?<![*\w])\*[^*\n]+\*(?!\*)"#, to: text) { _ in
      [
        .font: baseFont.italicized,
        .foregroundColor: theme.emphasis,
      ]
    }

    apply(pattern: #"(?<![_\w])_[^_\n]+_(?!_)"#, to: text) { _ in
      [
        .font: baseFont.italicized,
        .foregroundColor: theme.emphasis,
      ]
    }

    // Fenced code blocks are coloured last so they win over inline rules.
    applyFencedCodeBlocks(to: text, theme: theme)
  }

  /// Applies an attribute to every match of a regular expression.
  private static func apply(
    pattern: String,
    to text: NSMutableAttributedString,
    attributes: (NSTextCheckingResult) -> [NSAttributedString.Key: Any]
  ) {
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
    let range = NSRange(location: 0, length: text.length)
    let matches = regex.matches(in: text.string, options: [], range: range)
    for match in matches {
      let attributes = attributes(match)
      guard !attributes.isEmpty else { continue }
      text.addAttributes(attributes, range: match.range)
    }
  }

  /// Colours the contents of fenced code blocks.
  private static func applyFencedCodeBlocks(to text: NSMutableAttributedString, theme: EditorTheme) {
    let source = text.string as NSString
    var searchStart = 0
    var blockStart: Int?

    while searchStart < source.length {
      let fence = source.range(
        of: "```",
        options: [],
        range: NSRange(location: searchStart, length: source.length - searchStart)
      )
      guard fence.location != NSNotFound else { break }

      if let start = blockStart {
        let end = fence.location + fence.length
        let range = NSRange(location: start, length: max(0, end - start))
        guard NSMaxRange(range) <= text.length else { break }
        text.addAttributes(
          [
            .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular),
            .foregroundColor: theme.code,
          ],
          range: range
        )
        blockStart = nil
      } else {
        blockStart = fence.location
      }
      searchStart = fence.location + fence.length
    }
  }
}

/// The colours used by the editor.
struct EditorTheme {
  var body: NSColor
  var heading: NSColor
  var emphasis: NSColor
  var code: NSColor
  var link: NSColor
  var tag: NSColor
  var quote: NSColor
  var marker: NSColor

  /// The colours that follow the system appearance.
  @MainActor
  static func current() -> EditorTheme {
    let dark = NSApp?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    if dark {
      return EditorTheme(
        body: NSColor(white: 0.88, alpha: 1),
        heading: NSColor(white: 0.98, alpha: 1),
        emphasis: NSColor(red: 0.95, green: 0.70, blue: 0.88, alpha: 1),
        code: NSColor(red: 0.58, green: 0.90, blue: 0.70, alpha: 1),
        link: NSColor(red: 0.56, green: 0.78, blue: 1, alpha: 1),
        tag: NSColor(red: 0.98, green: 0.78, blue: 0.50, alpha: 1),
        quote: NSColor(white: 0.58, alpha: 1),
        marker: NSColor(red: 0.58, green: 0.72, blue: 1, alpha: 1)
      )
    }
    return EditorTheme(
      body: NSColor(white: 0.16, alpha: 1),
      heading: NSColor(white: 0.07, alpha: 1),
      emphasis: NSColor(red: 0.62, green: 0.20, blue: 0.55, alpha: 1),
      code: NSColor(red: 0.11, green: 0.50, blue: 0.28, alpha: 1),
      link: NSColor(red: 0.15, green: 0.40, blue: 0.82, alpha: 1),
      tag: NSColor(red: 0.70, green: 0.42, blue: 0.04, alpha: 1),
      quote: NSColor(white: 0.45, alpha: 1),
      marker: NSColor(red: 0.30, green: 0.45, blue: 0.80, alpha: 1)
    )
  }
}

private extension NSFont {
  /// A copy of the font with the italic trait applied.
  var italicized: NSFont {
    let descriptor = fontDescriptor.withSymbolicTraits(.italic)
    return NSFont(descriptor: descriptor, size: pointSize) ?? self
  }
}
