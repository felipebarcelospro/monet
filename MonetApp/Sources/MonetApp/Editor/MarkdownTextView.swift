import AppKit
import MonetCore
import SwiftUI

/// A Markdown editor backed by a native `NSTextView`.
///
/// The editor reports the text under the cursor so the SwiftUI layer can
/// offer wikilink completions, and it re-colours the text after every edit.
struct MarkdownTextView: NSViewRepresentable {
  /// The text being edited.
  @Binding var text: String
  /// Called whenever the user edits the text.
  var onChange: () -> Void
  /// The wikilink query under the cursor, if any.
  @Binding var linkQuery: String?
  /// Called when the user activates a wikilink.
  var onOpenLink: (String) -> Void
  /// The notes that can be linked to.
  var candidates: [Note]

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  func makeNSView(context: Context) -> NSScrollView {
    let scrollView = NSTextView.scrollableTextView()
    let textView = scrollView.documentView as? NSTextView ?? NSTextView()

    textView.delegate = context.coordinator
    textView.isRichText = false
    textView.isAutomaticQuoteSubstitutionEnabled = false
    textView.isAutomaticDashSubstitutionEnabled = false
    textView.isAutomaticSpellingCorrectionEnabled = false
    textView.isAutomaticTextReplacementEnabled = false
    textView.isContinuousSpellCheckingEnabled = true
    textView.allowsUndo = true
    textView.font = MarkdownHighlighter.baseFont
    textView.defaultParagraphStyle = MarkdownHighlighter.bodyParagraph
    textView.typingAttributes = [
      .font: MarkdownHighlighter.baseFont,
      .foregroundColor: EditorTheme.current().body,
      .paragraphStyle: MarkdownHighlighter.bodyParagraph,
    ]
    textView.textContainerInset = NSSize(width: 0, height: 26)
    textView.autoresizingMask = [.width]
    textView.isVerticallyResizable = true
    textView.isHorizontallyResizable = false
    textView.textContainer?.widthTracksTextView = true
    textView.minSize = NSSize(width: 0, height: 0)
    textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    textView.backgroundColor = .clear
    textView.drawsBackground = false
    textView.insertionPointColor = .labelColor
    textView.selectedTextAttributes = [
      .backgroundColor: NSColor.selectedTextBackgroundColor,
      .foregroundColor: NSColor.selectedTextColor,
    ]

    scrollView.drawsBackground = false
    scrollView.hasVerticalScroller = true
    scrollView.autohidesScrollers = true
    scrollView.contentInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
    scrollView.scrollerStyle = .overlay

    context.coordinator.textView = textView
    context.coordinator.applyHighlighting(to: textView)
    return scrollView
  }

  func updateNSView(_ scrollView: NSScrollView, context: Context) {
    guard let textView = context.coordinator.textView else { return }
    context.coordinator.parent = self

    if textView.string != text {
      let selection = textView.selectedRange()
      context.coordinator.replaceText(text, in: textView)
      context.coordinator.applyHighlighting(to: textView)
      let safeLocation = min(selection.location, textView.string.utf16.count)
      textView.setSelectedRange(
        NSRange(location: safeLocation, length: min(selection.length, 0))
      )
    }
  }

  /// Coordinates the text view with the SwiftUI layer.
  @MainActor
  final class Coordinator: NSObject, NSTextViewDelegate {
    /// The editor being coordinated.
    var parent: MarkdownTextView
    /// The text view being coordinated.
    weak var textView: NSTextView?
    /// Whether the highlight pass is currently running.
    private var isHighlighting = false
    /// Whether the text is being replaced programmatically.
    private var isApplyingText = false

    init(_ parent: MarkdownTextView) {
      self.parent = parent
    }

    func textDidChange(_ notification: Notification) {
      // Replacing the string from `updateNSView` must not feed the change
      // back into the model, or SwiftUI would mutate state while it is
      // laying the view out.
      guard !isApplyingText else { return }
      guard let textView else { return }
      applyHighlighting(to: textView)
      updateLinkQuery(in: textView)
      parent.onChange()
    }

    /// Replaces the text without reporting the change back to the model.
    func replaceText(_ text: String, in textView: NSTextView) {
      isApplyingText = true
      defer { isApplyingText = false }
      textView.string = text
      textView.typingAttributes = [
        .font: MarkdownHighlighter.baseFont,
        .foregroundColor: EditorTheme.current().body,
        .paragraphStyle: MarkdownHighlighter.bodyParagraph,
      ]
    }

    /// Re-colours the text view.
    ///
    /// The attributes are applied run by run. An empty text view is skipped
    /// entirely: reading the attribute runs of an empty string raises an
    /// `NSRangeException`, and there is nothing to colour anyway.
    func applyHighlighting(to textView: NSTextView) {
      guard !isHighlighting else { return }
      guard let storage = textView.textStorage, storage.length > 0 else { return }

      isHighlighting = true
      defer { isHighlighting = false }

      let attributed = NSMutableAttributedString(attributedString: storage)
      MarkdownHighlighter.highlight(attributed, theme: .current())
      guard attributed.length == storage.length else { return }

      storage.beginEditing()
      attributed.enumerateAttributes(
        in: NSRange(location: 0, length: attributed.length)
      ) { attributes, range, _ in
        guard NSMaxRange(range) <= storage.length else { return }
        storage.setAttributes(attributes, range: range)
      }
      storage.endEditing()
    }

    /// Computes the wikilink query under the cursor.
    func updateLinkQuery(in textView: NSTextView) {
      let selection = textView.selectedRange()
      let nsString = textView.string as NSString
      let cursor = min(selection.location, nsString.length)
      let prefix = nsString.substring(to: cursor) as String

      guard let openRange = prefix.range(of: "[[", options: .backwards) else {
        if parent.linkQuery != nil { parent.linkQuery = nil }
        return
      }

      let afterOpen = prefix[openRange.upperBound...]
      guard !afterOpen.contains("]"), !afterOpen.contains("\n"), afterOpen.count <= 80 else {
        if parent.linkQuery != nil { parent.linkQuery = nil }
        return
      }

      let query = String(afterOpen)
      if parent.linkQuery != query { parent.linkQuery = query }
    }
  }
}

/// A view that offers wikilink completions above the editor.
struct LinkCompletionOverlay: View {
  /// The current query.
  let query: String?
  /// The notes that match the query.
  let candidates: [Note]
  /// Called when a candidate is chosen.
  let onPick: (Note) -> Void

  var body: some View {
    if let query, !candidates.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 5) {
          Image(systemName: "link")
            .font(.system(size: 9, weight: .semibold))
          Text(query.isEmpty ? "editor.linkAnyNote" : "editor.linkTo")
            .font(.system(size: 10, weight: .medium))
            .textCase(.uppercase)
            .kerning(0.5)
          Spacer(minLength: 0)
        }
        .foregroundStyle(Palette.textTertiary)
        .padding(.horizontal, 12)
        .padding(.top, 9)
        .padding(.bottom, 6)

        ForEach(candidates.prefix(7)) { note in
          Button {
            onPick(note)
          } label: {
            HStack(spacing: 9) {
              Image(systemName: "doc.text")
                .font(.system(size: 11))
                .foregroundStyle(Palette.accent)
                .frame(width: 15)
              Text(note.title)
                .font(.system(size: 12.5))
                .foregroundStyle(Palette.text)
                .lineLimit(1)
              Spacer(minLength: 0)
              Text(note.relativePath)
                .font(.system(size: 10.5))
                .foregroundStyle(Palette.textTertiary)
                .lineLimit(1)
                .truncationMode(.middle)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      .frame(maxWidth: 420, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(.thickMaterial)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(Palette.separator, lineWidth: Metrics.hairline)
      )
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .shadow(color: .black.opacity(0.18), radius: 18, y: 7)
      .help(query)
      .transition(.opacity.combined(with: .move(edge: .top)))
    }
  }
}
