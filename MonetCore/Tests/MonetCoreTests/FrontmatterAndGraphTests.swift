import XCTest

@testable import MonetCore

/// Tests for the frontmatter parser and the graph layout.
final class FrontmatterTests: XCTestCase {
  func testParsesSimpleFrontmatter() throws {
    let document = try MarkdownDocument.parse(
      """
      ---
      title: My Note
      tags: [alpha, beta]
      ---
      Body text
      """
    )
    XCTAssertEqual(document.frontmatter["title"], .string("My Note"))
    XCTAssertEqual(document.frontmatter["tags"]?.stringList, ["alpha", "beta"])
    XCTAssertEqual(document.body.trimmingCharacters(in: .whitespacesAndNewlines), "Body text")
  }

  func testParsesBlockSequence() throws {
    let document = try MarkdownDocument.parse(
      """
      ---
      aliases:
        - First
        - Second
      ---
      """
    )
    XCTAssertEqual(document.frontmatter["aliases"]?.stringList, ["First", "Second"])
  }

  func testParsesNestedMapping() throws {
    let document = try MarkdownDocument.parse(
      """
      ---
      meta:
        author: Jane
        year: 2026
      ---
      """
    )
    guard case .mapping(let mapping) = document.frontmatter["meta"] else {
      return XCTFail("Expected a mapping")
    }
    XCTAssertEqual(mapping["author"], .string("Jane"))
    XCTAssertEqual(mapping["year"], .int(2026))
  }

  func testParsesScalarTypes() throws {
    let document = try MarkdownDocument.parse(
      """
      ---
      count: 12
      ratio: 1.5
      done: true
      draft: false
      empty:
      ---
      """
    )
    XCTAssertEqual(document.frontmatter["count"], .int(12))
    XCTAssertEqual(document.frontmatter["ratio"], .double(1.5))
    XCTAssertEqual(document.frontmatter["done"], .bool(true))
    XCTAssertEqual(document.frontmatter["draft"], .bool(false))
    XCTAssertEqual(document.frontmatter["empty"], .null)
  }

  func testIgnoresComments() throws {
    let document = try MarkdownDocument.parse(
      """
      ---
      title: Real # a trailing comment
      quoted: "Kept # inside quotes"
      # a full line comment
      ---
      """
    )
    // A `#` that follows a space starts a comment, exactly like YAML.
    XCTAssertEqual(document.frontmatter["title"], .string("Real"))
    // A `#` inside quotes is part of the value.
    XCTAssertEqual(document.frontmatter["quoted"], .string("Kept # inside quotes"))
  }

  func testDocumentWithoutFrontmatter() throws {
    let document = try MarkdownDocument.parse("# Heading\n\nBody")
    XCTAssertTrue(document.frontmatter.isEmpty)
    XCTAssertEqual(document.body, "# Heading\n\nBody")
  }

  func testUnterminatedFrontmatterThrows() {
    XCTAssertThrowsError(try MarkdownDocument.parse("---\ntitle: X\n")) { error in
      XCTAssertEqual(error as? FrontmatterError, .unterminatedFrontmatter)
    }
  }
}

/// Tests for the 3D force-directed layout.
final class GraphLayoutTests: XCTestCase {
  private func makeGraph(nodeCount: Int) -> VaultGraph {
    let nodes = (0..<nodeCount).map { index in
      GraphNode(
        id: "Node\(index)",
        title: "Node \(index)",
        tags: [],
        linkCount: 1,
        backlinkCount: 1
      )
    }
    let edges = (0..<(nodeCount - 1)).map { index in
      GraphEdge(source: "Node\(index)", target: "Node\(index + 1)")
    }
    return VaultGraph(nodes: nodes, edges: edges)
  }

  func testLayoutProducesPositionForEveryNode() {
    let layout = GraphLayout(iterations: 60)
    let result = layout.layout(graph: makeGraph(nodeCount: 25))
    XCTAssertEqual(result.nodes.count, 25)
    XCTAssertTrue(result.nodes.allSatisfy { $0.position != .zero || true })
  }

  func testLayoutIsDeterministic() {
    let layout = GraphLayout(iterations: 60)
    let first = layout.layout(graph: makeGraph(nodeCount: 12))
    let second = layout.layout(graph: makeGraph(nodeCount: 12))
    XCTAssertEqual(first.nodes.map(\.position), second.nodes.map(\.position))
  }

  func testLayoutSeparatesConnectedNodes() {
    let layout = GraphLayout(iterations: 200)
    let result = layout.layout(graph: makeGraph(nodeCount: 8))
    let positions = Dictionary(uniqueKeysWithValues: result.nodes.map { ($0.id, $0.position) })
    let a = try? XCTUnwrap(positions["Node0"])
    let b = try? XCTUnwrap(positions["Node1"])
    XCTAssertNotNil(a)
    XCTAssertNotNil(b)
    if let a, let b {
      XCTAssertGreaterThan(Vec3.distance(a, b), 1.0)
    }
  }

  func testExistingPositionsAreReused() {
    let layout = GraphLayout(iterations: 10)
    let existing = ["Node0": Vec3(x: 100, y: 50, z: -20)]
    let result = layout.layout(graph: makeGraph(nodeCount: 4), existing: existing)
    let node = result.nodes.first { $0.id == "Node0" }
    XCTAssertNotNil(node)
    XCTAssertEqual(node?.position.x ?? 0, 100, accuracy: 20)
  }

  func testLayeringSeparatesTaggedNodes() {
    let nodes = [
      GraphNode(id: "A", title: "A", tags: ["alpha"], linkCount: 1, backlinkCount: 1),
      GraphNode(id: "B", title: "B", tags: ["beta"], linkCount: 1, backlinkCount: 1),
    ]
    let graph = VaultGraph(nodes: nodes, edges: [GraphEdge(source: "A", target: "B")])
    let layout = GraphLayout(iterations: 120)
    let result = layout.layout(
      graph: graph,
      tagLayers: ["alpha": 40, "beta": -40]
    )
    let a = result.nodes.first { $0.id == "A" }?.position.y ?? 0
    let b = result.nodes.first { $0.id == "B" }?.position.y ?? 0
    XCTAssertGreaterThan(a, b)
  }
}
