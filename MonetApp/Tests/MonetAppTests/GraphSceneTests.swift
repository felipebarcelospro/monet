import MonetCore
import SceneKit
import XCTest

@testable import MonetApp

/// Tests for the 3D graph scene.
///
/// The scene merges every node mesh into one geometry with one element per
/// colour bucket, so the picking has to map a hit back to a note id through
/// the bucket index and the triangle index.
@MainActor
final class GraphSceneTests: XCTestCase {
  private func makeLayout() -> GraphLayoutResult {
    let notes = (0..<12).map { index in
      Note(
        id: "Note\(index)",
        relativePath: "Note\(index).md",
        title: "Note \(index)",
        body: "",
        links: index == 0
          ? [Wikilink(target: "Note1", display: nil, anchor: nil, isEmbed: false)]
          : [],
        headings: []
      )
    }
    let index = VaultIndex(notes: notes)
    return GraphLayout(iterations: 60).layout(graph: index.graph)
  }

  func testBuildsASceneWithNodesAndEdges() {
    let builder = GraphSceneBuilder()
    let result = builder.buildScene(layout: makeLayout(), selectedID: "Note0")

    let names = result.scene.rootNode.childNodes.map(\.name)
    XCTAssertTrue(names.contains(GraphSceneBuilder.nodeGeometryName))
    XCTAssertTrue(names.contains(GraphSceneBuilder.edgeGeometryName))
    XCTAssertTrue(names.contains(GraphSceneBuilder.highlightGeometryName))

    let nodeNode = result.scene.rootNode.childNode(
      withName: GraphSceneBuilder.nodeGeometryName,
      recursively: true
    )
    XCTAssertNotNil(nodeNode?.geometry)
    // One element per colour bucket that actually holds a node.
    let usedBuckets = result.buckets.filter { !$0.nodeIDs.isEmpty }.count
    XCTAssertEqual(nodeNode?.geometry?.elements.count, usedBuckets)
    XCTAssertEqual(nodeNode?.geometry?.materials.count, usedBuckets)
  }

  func testEveryNodeBelongsToABucket() {
    let builder = GraphSceneBuilder()
    let layout = makeLayout()
    let result = builder.buildScene(layout: layout)

    let bucketed = result.buckets.flatMap(\.nodeIDs)
    XCTAssertEqual(bucketed.count, layout.nodes.count)
    XCTAssertEqual(Set(bucketed), Set(layout.nodes.map(\.id)))
  }

  func testTheHighlightOverlayContainsTheSelectedNode() {
    let builder = GraphSceneBuilder()
    let layout = makeLayout()
    let result = builder.buildScene(
      layout: layout,
      selectedID: "Note0",
      neighbourIDs: ["Note1"]
    )

    let overlay = result.scene.rootNode.childNode(
      withName: GraphSceneBuilder.highlightGeometryName,
      recursively: true
    )
    // The neighbours and the selected node.
    XCTAssertEqual(overlay?.childNodes.count, 2)
  }

  func testTheIcosphereHasTheExpectedShape() {
    XCTAssertEqual(Icosphere.vertices.count, 12)
    XCTAssertEqual(Icosphere.faces.count, 20)
    for vertex in Icosphere.vertices {
      XCTAssertEqual(vertex.x * vertex.x + vertex.y * vertex.y + vertex.z * vertex.z, 1, accuracy: 1e-9)
    }

    let detailed = Icosphere.highDetailMesh(subdivisions: 1)
    XCTAssertEqual(detailed.faces.count, 80)
  }

  func testThePaletteBucketsByDegree() {
    XCTAssertEqual(GraphPalette.index(forDegree: 0), 0)
    XCTAssertEqual(GraphPalette.index(forDegree: 1), 0)
    XCTAssertEqual(GraphPalette.index(forDegree: 3), 2)
    XCTAssertEqual(GraphPalette.index(forDegree: 99), GraphPalette.all.count - 1)
    XCTAssertGreaterThan(GraphPalette.radius(forDegree: 5), GraphPalette.radius(forDegree: 1))
  }
}
