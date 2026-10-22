import AppKit
import Foundation
import MonetCore
import SceneKit
import SwiftUI

/// A low-poly sphere used for the graph nodes.
///
/// The graph renders every note with the cheapest possible mesh, because the
/// whole graph is drawn in a handful of draw calls (see `GraphSceneBuilder`).
/// Only the selected node and its neighbours are promoted to the detailed
/// mesh, which is the level-of-detail strategy used here: SceneKit's
/// `SCNInstancingGeometry` was removed from the macOS 26 SDK, so Monet merges
/// the meshes into per-colour buckets instead of relying on instancing.
enum Icosphere {
  /// The Euclidean length of a vector.
  static func magnitude(_ vector: SIMD3<Double>) -> Double {
    (vector.x * vector.x + vector.y * vector.y + vector.z * vector.z).squareRoot()
  }

  /// The 12 vertices of an icosahedron, normalised to unit length.
  static let vertices: [SIMD3<Double>] = {
    let phi = (1.0 + 5.0.squareRoot()) / 2.0
    let raw: [SIMD3<Double>] = [
      SIMD3(-1, phi, 0), SIMD3(1, phi, 0), SIMD3(-1, -phi, 0), SIMD3(1, -phi, 0),
      SIMD3(0, -1, phi), SIMD3(0, 1, phi), SIMD3(0, -1, -phi), SIMD3(0, 1, -phi),
      SIMD3(phi, 0, -1), SIMD3(phi, 0, 1), SIMD3(-phi, 0, -1), SIMD3(-phi, 0, 1),
    ]
    return raw.map { $0 / magnitude($0) }
  }()

  /// The 20 triangular faces of the icosahedron.
  static let faces: [(Int, Int, Int)] = [
    (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
    (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
    (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
    (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
  ]

  /// A subdivided icosahedron used for the highlighted nodes.
  static func highDetailMesh(subdivisions: Int = 1) -> (vertices: [SIMD3<Double>], faces: [(Int, Int, Int)]) {
    var vertices = vertices
    var faces = faces
    for _ in 0..<subdivisions {
      var midpoints: [String: Int] = [:]
      var nextFaces: [(Int, Int, Int)] = []
      var nextVertices = vertices

      func midpoint(_ a: Int, _ b: Int) -> Int {
        let key = a < b ? "\(a)-\(b)" : "\(b)-\(a)"
        if let existing = midpoints[key] { return existing }
        let point = (nextVertices[a] + nextVertices[b]) / 2
        nextVertices.append(point / magnitude(point))
        let index = nextVertices.count - 1
        midpoints[key] = index
        return index
      }

      for face in faces {
        let a = midpoint(face.0, face.1)
        let b = midpoint(face.1, face.2)
        let c = midpoint(face.2, face.0)
        nextFaces.append((face.0, a, c))
        nextFaces.append((face.1, b, a))
        nextFaces.append((face.2, c, b))
        nextFaces.append((a, b, c))
      }
      vertices = nextVertices
      faces = nextFaces
    }
    return (vertices, faces)
  }
}

/// A colour bucket used to group the graph nodes into draw calls.
struct GraphBucket {
  /// The note ids in this bucket, in the order their meshes were merged.
  var nodeIDs: [String] = []
  /// The colour of the bucket.
  var color: NSColor
}

/// Builds the SceneKit scene that renders the vault graph.
///
/// The whole graph is drawn in a handful of draw calls: every node mesh is
/// merged into one geometry with one element per colour bucket, and every
/// edge is merged into a single line geometry. Picking works because
/// SceneKit reports the index of the geometry element (`geometryIndex`, the
/// bucket) and the index of the primitive inside it (`faceIndex`, the
/// triangle), which maps back to a note id.
@MainActor
final class GraphSceneBuilder {
  /// The name of the node that carries the merged node geometry.
  static let nodeGeometryName = "monet.graph.nodes"
  /// The name of the node that carries the merged edge geometry.
  static let edgeGeometryName = "monet.graph.edges"
  /// The name of the node that carries the highlight overlays.
  static let highlightGeometryName = "monet.graph.highlight"

  /// The result of a scene build.
  struct Scene {
    /// The SceneKit scene.
    var scene: SCNScene
    /// The buckets, in the same order as the geometry elements.
    var buckets: [GraphBucket]
  }

  /// Builds the scene.
  ///
  /// - Parameters:
  ///   - layout: The computed layout.
  ///   - visibleIDs: The ids of the notes to show; `nil` shows everything.
  ///   - selectedID: The id of the selected note.
  ///   - neighbourIDs: The ids of the neighbours of the selected note.
  ///   - hoveredID: The id of the node under the pointer.
  func buildScene(
    layout: GraphLayoutResult,
    visibleIDs: Set<String>? = nil,
    selectedID: String? = nil,
    neighbourIDs: Set<String> = [],
    hoveredID: String? = nil
  ) -> Scene {
    let positions = Dictionary(
      uniqueKeysWithValues: layout.nodes.map {
        ($0.id, SIMD3($0.position.x, $0.position.y, $0.position.z))
      }
    )
    let degrees = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.degree) })

    let visibleNodes = layout.nodes.filter { node in
      guard let visibleIDs else { return true }
      return visibleIDs.contains(node.id)
    }
    let visibleSet = Set(visibleNodes.map(\.id))

    var buckets = GraphPalette.all.map { GraphBucket(color: $0) }
    for node in visibleNodes {
      buckets[GraphPalette.index(forDegree: degrees[node.id] ?? 0)].nodeIDs.append(node.id)
    }

    let scene = SCNScene()
    scene.background.contents = Self.makeBackdrop()

    let nodeNode = SCNNode(
      geometry: buildNodeGeometry(buckets: buckets, positions: positions, degrees: degrees)
    )
    nodeNode.name = Self.nodeGeometryName
    scene.rootNode.addChildNode(nodeNode)

    let edgeNode = SCNNode(
      geometry: buildEdgeGeometry(layout: layout, positions: positions, visible: visibleSet)
    )
    edgeNode.name = Self.edgeGeometryName
    scene.rootNode.addChildNode(edgeNode)

    buildHighlights(
      in: scene,
      positions: positions,
      selectedID: selectedID,
      neighbourIDs: neighbourIDs,
      hoveredID: hoveredID
    )

    return Scene(scene: scene, buckets: buckets)
  }

  /// The gradient behind the graph.
  ///
  /// A deep vertical gradient with a soft glow near the horizon gives the
  /// scene depth without a single light source.
  static func makeBackdrop() -> NSImage {
    let size = NSSize(width: 16, height: 256)
    let image = NSImage(size: size)
    image.lockFocus()
    let colors = [
      NSColor(red: 0.10, green: 0.11, blue: 0.19, alpha: 1).cgColor,
      NSColor(red: 0.04, green: 0.04, blue: 0.08, alpha: 1).cgColor,
      NSColor(red: 0.01, green: 0.01, blue: 0.02, alpha: 1).cgColor,
    ] as CFArray
    if let gradient = CGGradient(
      colorsSpace: CGColorSpaceCreateDeviceRGB(),
      colors: colors,
      locations: [0, 0.45, 1]
    ) {
      let context = NSGraphicsContext.current!.cgContext
      context.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: 0),
        end: CGPoint(x: 0, y: size.height),
        options: []
      )
    }
    image.unlockFocus()
    return image
  }

  /// Merges every node mesh into one geometry with one element per bucket.
  func buildNodeGeometry(
    buckets: [GraphBucket],
    positions: [String: SIMD3<Double>],
    degrees: [String: Int]
  ) -> SCNGeometry {
    var allVertices: [SCNVector3] = []
    var allNormals: [SCNVector3] = []
    var elements: [SCNGeometryElement] = []
    var materials: [SCNMaterial] = []

    for bucket in buckets {
      guard !bucket.nodeIDs.isEmpty else { continue }
      var indices: [Int32] = []

      for nodeID in bucket.nodeIDs {
        guard let position = positions[nodeID] else { continue }
        let radius = GraphPalette.radius(forDegree: degrees[nodeID] ?? 0)
        let base = Int32(allVertices.count)

        for vertex in Icosphere.vertices {
          let scaled = vertex * radius
          allVertices.append(SCNVector3(
            Float(position.x + scaled.x),
            Float(position.y + scaled.y),
            Float(position.z + scaled.z)
          ))
          allNormals.append(SCNVector3(Float(vertex.x), Float(vertex.y), Float(vertex.z)))
        }
        for face in Icosphere.faces {
          indices.append(base + Int32(face.0))
          indices.append(base + Int32(face.1))
          indices.append(base + Int32(face.2))
        }
      }

      guard !indices.isEmpty else { continue }
      elements.append(SCNGeometryElement(indices: indices, primitiveType: .triangles))

      let material = SCNMaterial()
      material.lightingModel = .constant
      material.diffuse.contents = bucket.color
      // The emission is what makes the nodes bloom.
      material.emission.contents = bucket.color
      material.emission.intensity = 0.55
      material.isDoubleSided = false
      materials.append(material)
    }

    let geometry = SCNGeometry(
      sources: [
        SCNGeometrySource(vertices: allVertices),
        SCNGeometrySource(normals: allNormals),
      ],
      elements: elements
    )
    geometry.name = Self.nodeGeometryName
    geometry.materials = materials
    return geometry
  }

  /// Merges every edge into a single line geometry.
  func buildEdgeGeometry(
    layout: GraphLayoutResult,
    positions: [String: SIMD3<Double>],
    visible: Set<String>
  ) -> SCNGeometry {
    var vertices: [SCNVector3] = []
    var indices: [Int32] = []

    for edge in layout.edges {
      guard visible.contains(edge.source), visible.contains(edge.target) else { continue }
      guard let from = positions[edge.source], let to = positions[edge.target] else { continue }
      vertices.append(SCNVector3(Float(from.x), Float(from.y), Float(from.z)))
      vertices.append(SCNVector3(Float(to.x), Float(to.y), Float(to.z)))
      let base = Int32(vertices.count - 2)
      indices.append(base)
      indices.append(base + 1)
    }

    let geometry = SCNGeometry(
      sources: [SCNGeometrySource(vertices: vertices)],
      elements: [SCNGeometryElement(indices: indices, primitiveType: .line)]
    )
    geometry.name = Self.edgeGeometryName

    let material = SCNMaterial()
    material.lightingModel = .constant
    material.diffuse.contents = GraphPalette.edge
    material.isDoubleSided = true
    geometry.materials = [material]
    return geometry
  }

  /// Adds the highlight overlays for the selected node and its neighbours.
  func buildHighlights(
    in scene: SCNScene,
    positions: [String: SIMD3<Double>],
    selectedID: String?,
    neighbourIDs: Set<String>,
    hoveredID: String?
  ) {
    let container = SCNNode()
    container.name = Self.highlightGeometryName
    scene.rootNode.addChildNode(container)

    let detailed = Icosphere.highDetailMesh(subdivisions: 1)

    func addHighlight(id: String, color: NSColor, scale: Double, useDetail: Bool) {
      guard let position = positions[id] else { return }
      let mesh = useDetail ? detailed : (vertices: Icosphere.vertices, faces: Icosphere.faces)
      var vertices: [SCNVector3] = []
      var indices: [Int32] = []
      for vertex in mesh.vertices {
        vertices.append(SCNVector3(Float(vertex.x), Float(vertex.y), Float(vertex.z)))
      }
      for face in mesh.faces {
        indices.append(Int32(face.0))
        indices.append(Int32(face.1))
        indices.append(Int32(face.2))
      }

      let geometry = SCNGeometry(
        sources: [SCNGeometrySource(vertices: vertices)],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)]
      )
      let material = SCNMaterial()
      material.lightingModel = .constant
      material.diffuse.contents = color
      material.emission.contents = color
      material.emission.intensity = 0.9
      material.isDoubleSided = false
      geometry.materials = [material]

      let node = SCNNode(geometry: geometry)
      node.position = SCNVector3(Float(position.x), Float(position.y), Float(position.z))
      node.scale = SCNVector3(Float(scale), Float(scale), Float(scale))
      container.addChildNode(node)
    }

    for id in neighbourIDs.sorted() {
      addHighlight(id: id, color: GraphPalette.neighbour, scale: 1.15, useDetail: false)
    }
    if let hoveredID, hoveredID != selectedID, !neighbourIDs.contains(hoveredID) {
      addHighlight(id: hoveredID, color: GraphPalette.hovered, scale: 1.35, useDetail: false)
    }
    if let selectedID {
      addHighlight(id: selectedID, color: GraphPalette.selected, scale: 1.7, useDetail: true)
    }
  }
}

/// The colours and sizes used by the graph.
enum GraphPalette {
  /// The colour of the selected node.
  static let selected = NSColor(red: 1.0, green: 0.62, blue: 0.26, alpha: 1)
  /// The colour of the neighbours of the selected node.
  static let neighbour = NSColor(red: 0.36, green: 0.88, blue: 0.66, alpha: 1)
  /// The colour of the node under the pointer.
  static let hovered = NSColor(red: 0.98, green: 0.95, blue: 0.72, alpha: 1)
  /// The colour of the edges.
  static let edge = NSColor(white: 1, alpha: 0.12)

  /// The colours used for the nodes, ordered by degree.
  static let all: [NSColor] = [
    NSColor(red: 0.38, green: 0.56, blue: 0.98, alpha: 1),
    NSColor(red: 0.36, green: 0.74, blue: 0.98, alpha: 1),
    NSColor(red: 0.42, green: 0.86, blue: 0.84, alpha: 1),
    NSColor(red: 0.50, green: 0.88, blue: 0.60, alpha: 1),
    NSColor(red: 0.92, green: 0.82, blue: 0.42, alpha: 1),
    NSColor(red: 0.98, green: 0.60, blue: 0.42, alpha: 1),
  ]

  /// The bucket index for a degree.
  static func index(forDegree degree: Int) -> Int {
    guard degree > 0 else { return 0 }
    return min(all.count - 1, degree - 1)
  }

  /// The radius of a node with the given degree.
  static func radius(forDegree degree: Int) -> Double {
    1.5 + min(3.6, Double(degree) * 0.42)
  }
}
