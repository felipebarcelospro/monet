import Foundation
import XCTest

@testable import MonetCore

/// Tests for the backlink index and the vault index as a whole.
final class BacklinkIndexTests: XCTestCase {
  private func makeVault() throws -> URL {
    let root = FileManager.default.temporaryDirectory
      .appending(path: "monet-backlinks-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

    try """
    ---
    title: Architecture
    tags: [design, core]
    aliases: [System Design]
    ---
    # Architecture

    The [[Renderer]] renders the [[Scene]].
    """.write(to: root.appending(path: "Architecture.md"), atomically: true, encoding: .utf8)

    try """
    ---
    tags: [core]
    ---
    # Renderer

    Back to [[Architecture]].
    """.write(to: root.appending(path: "Renderer.md"), atomically: true, encoding: .utf8)

    try """
    # Scene

    Referenced by [[Renderer]] and [[Missing Note]].
    """.write(to: root.appending(path: "Scene.md"), atomically: true, encoding: .utf8)

    return root
  }

  func testIndexesBacklinks() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    XCTAssertEqual(index.notes.count, 3)

    let rendererBacklinks = index.backlinks(of: "Renderer").map(\.id)
    XCTAssertEqual(rendererBacklinks.sorted(), ["Architecture", "Scene"])

    let architectureBacklinks = index.backlinks(of: "Architecture").map(\.id)
    XCTAssertEqual(architectureBacklinks, ["Renderer"])
  }

  func testIndexesOutgoingLinks() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    let outgoing = index.outgoingLinks(of: "Architecture").map(\.id).sorted()
    XCTAssertEqual(outgoing, ["Renderer", "Scene"])
  }

  func testTracksUnresolvedLinks() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    XCTAssertEqual(index.unresolved["Missing Note"]?.count, 1)
    XCTAssertNil(index.note(id: "Missing Note"))
  }

  func testIndexesTags() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    XCTAssertEqual(index.notes(tagged: "design").map(\.id), ["Architecture"])
    XCTAssertEqual(index.notes(tagged: "core").map(\.id).sorted(), ["Architecture", "Renderer"])
    XCTAssertEqual(index.sortedTags.first?.tag, "core")
    XCTAssertEqual(index.sortedTags.first?.count, 2)
  }

  func testReadsAliasesAndTitle() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    let architecture = try XCTUnwrap(index.note(id: "Architecture"))
    XCTAssertEqual(architecture.title, "Architecture")
    XCTAssertEqual(architecture.aliases, ["System Design"])
    XCTAssertTrue(architecture.tags.contains("design"))
  }

  func testResolvesLinkThroughAlias() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    try "Linking to [[System Design]].".write(
      to: root.appending(path: "Alias User.md"),
      atomically: true,
      encoding: .utf8
    )

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()

    XCTAssertEqual(index.backlinks(of: "Architecture").map(\.id).sorted(), ["Alias User", "Renderer"])
  }

  func testBuildsGraph() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()
    let graph = index.graph

    XCTAssertEqual(graph.nodes.count, 3)
    // Architecture -> Renderer, Architecture -> Scene,
    // Renderer -> Architecture, Scene -> Renderer.
    XCTAssertEqual(graph.edges.count, 4)
    XCTAssertTrue(graph.edges.contains(GraphEdge(source: "Architecture", target: "Renderer")))
  }

  func testBuildsFolderTree() async throws {
    let root = try makeVault()
    defer { try? FileManager.default.removeItem(at: root) }

    try FileManager.default.createDirectory(
      at: root.appending(path: "Nested/Deep"),
      withIntermediateDirectories: true
    )
    try "# Deep\n".write(
      to: root.appending(path: "Nested/Deep/Note.md"),
      atomically: true,
      encoding: .utf8
    )

    let loader = try VaultLoader(path: root.path)
    let index = try await loader.loadIndex()
    let tree = index.folderTree()

    XCTAssertEqual(tree.children.map(\.name), ["Nested"])
    XCTAssertEqual(tree.children.first?.children.map(\.name), ["Deep"])
    XCTAssertEqual(tree.notes.count, 3)
  }

  func testRoundTripsAWrittenNote() async throws {
    let root = FileManager.default.temporaryDirectory
      .appending(path: "monet-roundtrip-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }

    let loader = try VaultLoader(path: root.path)
    let note = Note(
      id: "Fresh",
      relativePath: "Fresh.md",
      title: "Fresh",
      aliases: ["New"],
      tags: ["todo"],
      frontmatter: [
        "title": .string("Fresh"),
        "aliases": .array([.string("New")]),
        "tags": .array([.string("todo")]),
      ],
      body: "# Fresh\n\nBody with [[Fresh]].\n"
    )
    try loader.write(note: note)

    let reloaded = try await loader.loadIndex()
    let fresh = try XCTUnwrap(reloaded.note(id: "Fresh"))
    XCTAssertEqual(fresh.title, "Fresh")
    XCTAssertEqual(fresh.aliases, ["New"])
    XCTAssertEqual(fresh.tags, ["todo"])
    XCTAssertTrue(fresh.body.contains("# Fresh"))
  }
}
