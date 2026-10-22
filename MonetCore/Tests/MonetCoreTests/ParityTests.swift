import Foundation
import XCTest

@testable import MonetCore

/// The expected parse result of the shared parity fixture.
private struct ParityExpectation: Decodable {
  struct Note: Decodable {
    var title: String
    var aliases: [String]
    var tags: [String]
  }

  struct Link: Decodable {
    var target: String
    var display: String?
    var anchor: String?
    var isEmbed: Bool
  }

  struct Heading: Decodable {
    var title: String
    var level: Int
  }

  var note: Note
  var links: [Link]
  var headings: [Heading]
}

/// The parity between the Swift and the TypeScript parsers.
///
/// The fixture in `Fixtures/` is parsed by both implementations and the
/// result is compared with `Fixtures/parity.json`. The TypeScript test in
/// `packages/cli/test/parity.test.ts` asserts exactly the same thing, so a
/// change to one parser that is not mirrored in the other fails a test.
final class ParityTests: XCTestCase {
  /// The folder that holds the shared fixtures.
  private static let fixtureFolder = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()   // MonetCoreTests
    .deletingLastPathComponent()   // Tests
    .deletingLastPathComponent()   // MonetCore
    .deletingLastPathComponent()   // repository root
    .appending(path: "Fixtures")

  func testParsesTheSharedFixtureTheSameWay() throws {
    let markdown = try String(
      contentsOf: Self.fixtureFolder.appending(path: "parity.md"),
      encoding: .utf8
    )
    let expectation = try JSONDecoder().decode(
      ParityExpectation.self,
      from: Data(contentsOf: Self.fixtureFolder.appending(path: "parity.json"))
    )

    let loader = VaultLoader(root: URL(fileURLWithPath: NSTemporaryDirectory()))
    let note = try loader.parseNote(relativePath: "parity.md", contents: markdown)

    XCTAssertEqual(note.title, expectation.note.title)
    XCTAssertEqual(note.aliases, expectation.note.aliases)
    XCTAssertEqual(note.tags, expectation.note.tags)

    XCTAssertEqual(note.links.count, expectation.links.count)
    for (actual, expected) in zip(note.links, expectation.links) {
      XCTAssertEqual(actual.target, expected.target)
      XCTAssertEqual(actual.display, expected.display)
      XCTAssertEqual(actual.anchor, expected.anchor)
      XCTAssertEqual(actual.isEmbed, expected.isEmbed)
    }

    XCTAssertEqual(note.headings.count, expectation.headings.count)
    for (actual, expected) in zip(note.headings, expectation.headings) {
      XCTAssertEqual(actual.title, expected.title)
      XCTAssertEqual(actual.level, expected.level)
    }
  }
}
