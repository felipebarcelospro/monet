import XCTest

@testable import MonetCore

/// Tests for the wikilink parser.
final class WikilinkParserTests: XCTestCase {
  func testParsesSimpleLink() {
    let links = WikilinkParser.parseLinks(in: "See [[Project Plan]] for details.")
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links[0].target, "Project Plan")
    XCTAssertNil(links[0].display)
    XCTAssertNil(links[0].anchor)
    XCTAssertFalse(links[0].isEmbed)
  }

  func testParsesDisplayAlias() {
    let links = WikilinkParser.parseLinks(in: "See [[Project Plan|the plan]].")
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links[0].target, "Project Plan")
    XCTAssertEqual(links[0].display, "the plan")
    XCTAssertEqual(links[0].label, "the plan")
  }

  func testParsesHeadingAnchor() {
    let links = WikilinkParser.parseLinks(in: "[[Budget#Q1 Numbers]]")
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links[0].target, "Budget")
    XCTAssertEqual(links[0].anchor, "Q1 Numbers")
  }

  func testParsesEmbed() {
    let links = WikilinkParser.parseLinks(in: "![[Diagram]]")
    XCTAssertEqual(links.count, 1)
    XCTAssertTrue(links[0].isEmbed)
    XCTAssertEqual(links[0].target, "Diagram")
  }

  func testParsesFolderQualifiedTarget() {
    let links = WikilinkParser.parseLinks(in: "[[Projects/Alpha]]")
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links[0].target, "Projects/Alpha")
  }

  func testParsesMultipleLinks() {
    let links = WikilinkParser.parseLinks(in: "[[One]] and [[Two]] and [[Three|three]]")
    XCTAssertEqual(links.map(\.target), ["One", "Two", "Three"])
  }

  func testIgnoresLinksInsideFencedCodeBlocks() {
    let body = """
    Real link [[Alpha]]

    ```
    Fake link [[Beta]]
    ```

    Another real [[Gamma]]
    """
    let links = WikilinkParser.parseLinks(in: body)
    XCTAssertEqual(links.map(\.target), ["Alpha", "Gamma"])
  }

  func testIgnoresLinksInsideInlineCode() {
    let links = WikilinkParser.parseLinks(in: "Use `[[NotALink]]` but [[RealLink]] works.")
    XCTAssertEqual(links.map(\.target), ["RealLink"])
  }

  func testIgnoresSingleBrackets() {
    let links = WikilinkParser.parseLinks(in: "[Normal link](https://example.com) and [Text]")
    XCTAssertTrue(links.isEmpty)
  }

  func testStripsMarkdownExtension() {
    let link = Wikilink(target: "Notes/Alpha.md")
    XCTAssertEqual(link.targetWithoutExtension, "Notes/Alpha")
    XCTAssertEqual(link.normalizedTarget, "Notes/Alpha.md")
  }

  func testParsesHeadings() {
    let body = """
    # Title

    ## Section One

    Text

    ### Deep
    """
    let headings = WikilinkParser.parseHeadings(in: body)
    XCTAssertEqual(headings.map(\.title), ["Title", "Section One", "Deep"])
    XCTAssertEqual(headings.map(\.level), [1, 2, 3])
  }

  func testParsesTags() {
    let body = "Tagged #project and #area/frontend plus #multi-word."
    let tags = WikilinkParser.parseTags(in: body)
    XCTAssertTrue(tags.contains("project"))
    XCTAssertTrue(tags.contains("area/frontend"))
    // Obsidian allows hyphens and slashes in a tag.
    XCTAssertTrue(tags.contains("multi-word"))
  }

  func testStopsATagAtWhitespace() {
    let tags = WikilinkParser.parseTags(in: "This #not a tag")
    XCTAssertEqual(tags, ["not"])
  }

  func testDoesNotParseHeadingsAsTags() {
    let tags = WikilinkParser.parseTags(in: "# Heading\n\nSome #real text")
    XCTAssertEqual(tags, ["real"])
  }

  func testLinkRangesPointAtTheLink() {
    let body = "abc [[Target]] def"
    let links = WikilinkParser.parseLinks(in: body)
    XCTAssertEqual(links.count, 1)
    let range = body.utf8.index(body.utf8.startIndex, offsetBy: links[0].range.lowerBound)
    XCTAssertTrue(body[range...].hasPrefix("[[Target]]"))
  }
}
