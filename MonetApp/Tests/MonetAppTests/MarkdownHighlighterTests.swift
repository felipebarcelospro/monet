import AppKit
import MonetCore
import SwiftUI
import XCTest

@testable import MonetApp

/// Tests for the editor.
///
/// The editor used to crash when it highlighted an empty text view: reading
/// the attributes of position zero of an empty string raises an
/// `NSRangeException`. The tests below cover the empty case, because it is
/// exactly what happens when a note is opened for the first time.
@MainActor
final class MarkdownHighlighterTests: XCTestCase {
  func testHighlightsAnEmptyString() {
    let text = NSMutableAttributedString(string: "")
    MarkdownHighlighter.highlight(text, theme: .current())
    XCTAssertEqual(text.length, 0)
  }

  func testHighlightsAMarkdownDocument() {
    let source = """
    # Title

    A **bold** word, an *italic* one, `code` and a [[Wikilink]].

    - a list item
    - another one

    > a quotation

    #tag

    ```
    let code = 1
    ```
    """
    let text = NSMutableAttributedString(string: source)
    MarkdownHighlighter.highlight(text, theme: .current())

    XCTAssertEqual(text.string, source)
    XCTAssertEqual(text.length, (source as NSString).length)

    // The heading is bigger than the body.
    let heading = NSRange(location: 0, length: 5)
    let headingFont = text.attribute(.font, at: 0, effectiveRange: nil) as? NSFont
    XCTAssertNotNil(headingFont)
    XCTAssertGreaterThan(headingFont?.pointSize ?? 0, 13.5)
  }

  func testApplyingTheHighlightToAnEmptyTextViewDoesNotCrash() {
    let textView = NSTextView()
    let storage = textView.textStorage
    XCTAssertNotNil(storage)

    let attributed = NSMutableAttributedString(attributedString: storage!)
    MarkdownHighlighter.highlight(attributed, theme: .current())
    XCTAssertEqual(attributed.length, 0)
  }

  func testFindsTheWikilinkQueryUnderTheCursor() {
    let body = "Some text [[Rele"
    let query = QueryBox()

    let coordinator = MarkdownTextView.Coordinator(
      MarkdownTextView(
        text: .constant(body),
        onChange: {},
        linkQuery: Binding(get: { query.value }, set: { query.value = $0 }),
        onOpenLink: { _ in },
        candidates: []
      )
    )
    let textView = NSTextView()
    textView.string = body
    textView.setSelectedRange(NSRange(location: (body as NSString).length, length: 0))
    coordinator.updateLinkQuery(in: textView)
    XCTAssertEqual(query.value, "Rele")
  }
}

/// A mutable box, used to observe a binding from a test.
private final class QueryBox {
  var value: String?
}

/// Tests for the vault lock the app publishes for the CLI.
final class VaultLockTests: XCTestCase {
  func testWritesAndRemovesTheLockFile() throws {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: "monet-lock-\(UUID().uuidString)")
    let vault = directory.appending(path: "Vault").path
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

    let environment = ["MONET_STATE_DIR": directory.path]
    let path = VaultLockWriter.lockPath(for: vault, environment: environment)
    XCTAssertTrue(path.path.hasSuffix(".json"))
    XCTAssertTrue(path.deletingLastPathComponent().path == directory.path)

    // The name is the first sixteen characters of the SHA-256 of the path.
    let name = path.deletingPathExtension().lastPathComponent
    XCTAssertEqual(name.count, 16)
    XCTAssertTrue(name.allSatisfy { $0.isHexDigit })
    XCTAssertEqual(path.pathExtension, "json")
  }
}
