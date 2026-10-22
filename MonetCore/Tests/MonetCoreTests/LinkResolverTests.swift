import XCTest

@testable import MonetCore

/// Tests for the Obsidian-compatible link resolver.
final class LinkResolverTests: XCTestCase {
  private func makeNote(
    id: String,
    path: String,
    title: String? = nil,
    aliases: [String] = []
  ) -> Note {
    Note(
      id: id,
      relativePath: path,
      title: title ?? ((path as NSString).deletingPathExtension),
      aliases: aliases,
      body: "",
      links: [],
      headings: []
    )
  }

  private func resolver(_ notes: [Note]) -> LinkResolver {
    LinkResolver(
      notes: notes.map {
        LinkResolver.Candidate(
          id: $0.id,
          relativePath: $0.relativePath,
          title: $0.title,
          aliases: $0.aliases,
          folder: $0.folder
        )
      }
    )
  }

  func testResolvesByFileNameWithoutExtension() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md")])
    XCTAssertEqual(subject.resolve(target: "Alpha"), "Alpha")
  }

  func testResolvesByFileNameWithExtension() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md")])
    XCTAssertEqual(subject.resolve(target: "Alpha.md"), "Alpha")
  }

  func testResolutionIsCaseInsensitive() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md")])
    XCTAssertEqual(subject.resolve(target: "alpha"), "Alpha")
    XCTAssertEqual(subject.resolve(target: "ALPHA"), "Alpha")
  }

  func testResolvesByFullPath() {
    let subject = resolver([makeNote(id: "Notes/Alpha", path: "Notes/Alpha.md")])
    XCTAssertEqual(subject.resolve(target: "Notes/Alpha"), "Notes/Alpha")
    XCTAssertEqual(subject.resolve(target: "notes/alpha"), "Notes/Alpha")
  }

  func testResolvesByAlias() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md", aliases: ["The First Letter"])])
    XCTAssertEqual(subject.resolve(target: "The First Letter"), "Alpha")
    XCTAssertEqual(subject.resolve(target: "the first letter"), "Alpha")
  }

  func testResolvesByFrontmatterTitle() {
    let subject = resolver([makeNote(id: "alpha", path: "alpha.md", title: "Alpha Project")])
    XCTAssertEqual(subject.resolve(target: "Alpha Project"), "alpha")
  }

  func testDuplicateTitlesResolveDeterministically() {
    let notes = [
      makeNote(id: "Folder B/Dup", path: "Folder B/Dup.md"),
      makeNote(id: "Dup", path: "Dup.md"),
    ]
    let subject = resolver(notes)
    // The shortest path wins when the folders are equally distant.
    XCTAssertEqual(subject.resolve(target: "Dup"), "Dup")
  }

  func testDuplicateTitlesPreferSameFolder() {
    let notes = [
      makeNote(id: "Other/Dup", path: "Other/Dup.md"),
      makeNote(id: "Notes/Dup", path: "Notes/Dup.md"),
    ]
    let subject = resolver(notes)
    XCTAssertEqual(subject.resolve(target: "Dup", sourceFolder: "Notes"), "Notes/Dup")
    XCTAssertEqual(subject.resolve(target: "Dup", sourceFolder: "Other"), "Other/Dup")
  }

  func testHeadingOnlyLinkResolvesToSourceNote() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md")])
    XCTAssertEqual(subject.resolve(target: "#Section", sourceID: "Alpha"), "Alpha")
  }

  func testUnresolvedTargetReturnsNil() {
    let subject = resolver([makeNote(id: "Alpha", path: "Alpha.md")])
    XCTAssertNil(subject.resolve(target: "Missing"))
  }

  func testResolvesFolderQualifiedTargetWithDuplicateNames() {
    let notes = [
      makeNote(id: "A/Dup", path: "A/Dup.md"),
      makeNote(id: "B/Dup", path: "B/Dup.md"),
    ]
    let subject = resolver(notes)
    XCTAssertEqual(subject.resolve(target: "B/Dup"), "B/Dup")
    XCTAssertEqual(subject.resolve(target: "A/Dup"), "A/Dup")
  }
}
