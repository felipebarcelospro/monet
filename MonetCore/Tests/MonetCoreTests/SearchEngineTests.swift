import XCTest

@testable import MonetCore

/// Tests for the full-text and fuzzy search engine.
final class SearchEngineTests: XCTestCase {
  private func makeIndex() -> VaultIndex {
    let notes = [
      Note(
        id: "Graph Theory",
        relativePath: "Math/Graph Theory.md",
        title: "Graph Theory",
        tags: ["math"],
        body: "Vertices, edges and adjacency matrices."
      ),
      Note(
        id: "Graph Rendering",
        relativePath: "Rendering/Graph Rendering.md",
        title: "Graph Rendering",
        tags: ["rendering", "graph"],
        body: "Drawing a graph in three dimensions with Metal."
      ),
      Note(
        id: "Vault Format",
        relativePath: "Vault Format.md",
        title: "Vault Format",
        aliases: ["Storage Layout"],
        body: "Plain Markdown files on disk."
      ),
      Note(
        id: "Scene Tree",
        relativePath: "Scene Tree.md",
        title: "Scene Tree",
        body: "A graph of a graph is still a graph."
      ),
    ]
    return VaultIndex(notes: notes)
  }

  func testExactTitleMatchRanksFirst() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("Graph Rendering")
    XCTAssertEqual(results.first?.noteID, "Graph Rendering")
    XCTAssertEqual(results.first?.score, 1000)
  }

  func testPrefixMatchOutranksBodyMatch() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("Graph")
    // Two titles start with the query; the tie is broken by title.
    XCTAssertEqual(results.first?.noteID, "Graph Rendering")
    XCTAssertEqual(results.count, 3)
    // The body match comes last.
    XCTAssertEqual(results.last?.noteID, "Scene Tree")
    XCTAssertLessThan(results.last!.score, results[0].score)
  }

  func testFindsBodyMatches() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("Metal")
    XCTAssertEqual(results.first?.noteID, "Graph Rendering")
    XCTAssertNotNil(results.first?.excerpt)
  }

  func testFindsAliasMatches() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("Storage Layout")
    XCTAssertEqual(results.first?.noteID, "Vault Format")
  }

  func testFindsTagMatches() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("rendering")
    XCTAssertEqual(results.first?.noteID, "Graph Rendering")
  }

  func testFuzzyMatchFindsTypos() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("grph rendring")
    XCTAssertFalse(results.isEmpty)
    XCTAssertTrue(results.contains { $0.noteID == "Graph Rendering" })
  }

  func testFuzzySimilarityRequiresSubsequence() {
    let engine = SearchEngine(index: makeIndex())
    XCTAssertNotNil(engine.fuzzySimilarity(needle: "gth", haystack: "graph theory"))
    XCTAssertNil(engine.fuzzySimilarity(needle: "zzz", haystack: "graph theory"))
  }

  func testEmptyQueryListsEverything() {
    let engine = SearchEngine(index: makeIndex())
    XCTAssertEqual(engine.search("").count, 4)
  }

  func testRespectsLimit() {
    let engine = SearchEngine(index: makeIndex())
    XCTAssertEqual(engine.search("Graph", limit: 2).count, 2)
  }

  func testFiltersByTag() {
    let engine = SearchEngine(index: makeIndex())
    let results = engine.search("Graph", tagFilter: "math")
    XCTAssertEqual(results.map(\.noteID), ["Graph Theory"])
  }

  func testResultsAreDeterministic() {
    let engine = SearchEngine(index: makeIndex())
    let first = engine.search("Graph").map(\.noteID)
    let second = engine.search("Graph").map(\.noteID)
    XCTAssertEqual(first, second)
  }
}
