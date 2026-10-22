import Foundation

/// A point in 3D space.
public struct Vec3: Sendable, Hashable, Codable {
  public var x: Double
  public var y: Double
  public var z: Double

  public static let zero = Vec3(x: 0, y: 0, z: 0)

  public init(x: Double, y: Double, z: Double) {
    self.x = x
    self.y = y
    self.z = z
  }

  public static func + (lhs: Vec3, rhs: Vec3) -> Vec3 {
    Vec3(x: lhs.x + rhs.x, y: lhs.y + rhs.y, z: lhs.z + rhs.z)
  }

  public static func - (lhs: Vec3, rhs: Vec3) -> Vec3 {
    Vec3(x: lhs.x - rhs.x, y: lhs.y - rhs.y, z: lhs.z - rhs.z)
  }

  public static func * (lhs: Vec3, rhs: Double) -> Vec3 {
    Vec3(x: lhs.x * rhs, y: lhs.y * rhs, z: lhs.z * rhs)
  }

  public var length: Double {
    (x * x + y * y + z * z).squareRoot()
  }

  public var normalized: Vec3 {
    let magnitude = length
    guard magnitude > 0 else { return .zero }
    return self * (1 / magnitude)
  }

  public static func distance(_ lhs: Vec3, _ rhs: Vec3) -> Double {
    (lhs - rhs).length
  }
}

/// A laid-out node with its final position.
public struct LayoutNode: Sendable, Hashable, Identifiable {
  public var id: String
  public var position: Vec3
  public var degree: Int

  public init(id: String, position: Vec3, degree: Int) {
    self.id = id
    self.position = position
    self.degree = degree
  }
}

/// A laid-out edge.
public struct LayoutEdge: Sendable, Hashable, Identifiable {
  public var source: String
  public var target: String

  public init(source: String, target: String) {
    self.source = source
    self.target = target
  }

  public var id: String { "\(source)->\(target)" }
}

/// The result of a graph layout pass.
public struct GraphLayoutResult: Sendable, Hashable {
  public var nodes: [LayoutNode]
  public var edges: [LayoutEdge]
  /// The number of simulation iterations that were run.
  public var iterations: Int
  /// The total energy of the final iteration; lower means a more settled graph.
  public var energy: Double

  public init(nodes: [LayoutNode], edges: [LayoutEdge], iterations: Int, energy: Double) {
    self.nodes = nodes
    self.edges = edges
    self.iterations = iterations
    self.energy = energy
  }
}

/// A stable 3D force-directed layout for the vault graph.
///
/// The simulation combines four forces:
///
/// * **Repulsion** between every pair of nodes (Coulomb-like).
/// * **Attraction** along every edge (spring-like).
/// * **Centering** that pulls the graph towards the origin.
/// * **Layering** that spreads nodes on the Y axis by their tag, giving the
///   graph a readable vertical structure.
///
/// The layout is deterministic: the initial positions come from a stable hash
/// of the node id, so the same vault always produces the same graph. This
/// matters for the CLI, which exports the same positions the app displays.
public struct GraphLayout: Sendable {
  /// The number of simulation iterations to run.
  public var iterations: Int
  /// The strength of the repulsion force.
  public var repulsion: Double
  /// The strength of the spring force along edges.
  public var attraction: Double
  /// The ideal length of an edge.
  public var idealEdgeLength: Double
  /// The strength of the centering force.
  public var centering: Double
  /// The maximum distance a node may move in a single iteration.
  public var maxDisplacement: Double
  /// The damping applied to the velocity of each node.
  public var damping: Double
  /// A deterministic random seed.
  public var seed: UInt64

  public init(
    iterations: Int = 320,
    repulsion: Double = 5200,
    attraction: Double = 0.045,
    idealEdgeLength: Double = 40,
    centering: Double = 0.006,
    maxDisplacement: Double = 12,
    damping: Double = 0.82,
    seed: UInt64 = 0x4D6F6E65_7421_0001
  ) {
    self.iterations = iterations
    self.repulsion = repulsion
    self.attraction = attraction
    self.idealEdgeLength = idealEdgeLength
    self.centering = centering
    self.maxDisplacement = maxDisplacement
    self.damping = damping
    self.seed = seed
  }

  /// Computes the layout of a graph.
  ///
  /// - Parameters:
  ///   - graph: The graph to lay out.
  ///   - tagLayers: An optional mapping from tag to a vertical layer, used to
  ///     structure the graph.
  /// - existing: The previous positions, when the layout is being recomputed.
  ///     Passing them keeps the graph stable while the user navigates.
  public func layout(
    graph: VaultGraph,
    tagLayers: [String: Double] = [:],
    existing: [String: Vec3] = [:]
  ) -> GraphLayoutResult {
    let nodeIDs = graph.nodes.map(\.id)
    let indexOf = Dictionary(uniqueKeysWithValues: nodeIDs.enumerated().map { ($0.element, $0.offset) })

    var positions: [Vec3] = nodeIDs.map { id in
      if let previous = existing[id] { return previous }
      return initialPosition(for: id, seed: seed)
    }

    var velocities = [Vec3](repeating: .zero, count: nodeIDs.count)
    let degrees = Dictionary(uniqueKeysWithValues: graph.nodes.map { ($0.id, $0.linkCount + $0.backlinkCount) })
    let layerOf = Dictionary(uniqueKeysWithValues: graph.nodes.map { node in
      let layer = node.tags.compactMap { tagLayers[$0.lowercased()] }.first
      return (node.id, layer ?? 0)
    })

    let edges = graph.edges.compactMap { edge -> (Int, Int)? in
      guard let source = indexOf[edge.source], let target = indexOf[edge.target] else { return nil }
      return (source, target)
    }

    var energy = 0.0
    var performedIterations = 0

    for iteration in 0..<max(1, iterations) {
      var forces = [Vec3](repeating: .zero, count: nodeIDs.count)

      // Repulsion between all pairs.
      for i in 0..<positions.count {
        for j in (i + 1)..<positions.count {
          let delta = positions[i] - positions[j]
          let distanceSquared = max(0.01, (delta.x * delta.x + delta.y * delta.y + delta.z * delta.z))
          let magnitude = repulsion / distanceSquared
          let direction = delta.normalized
          forces[i] = forces[i] + direction * magnitude
          forces[j] = forces[j] - direction * magnitude
        }
      }

      // Spring attraction along edges.
      for (source, target) in edges {
        let delta = positions[source] - positions[target]
        let distance = max(0.01, delta.length)
        let magnitude = attraction * (distance - idealEdgeLength)
        let force = delta.normalized * magnitude
        forces[source] = forces[source] - force
        forces[target] = forces[target] + force
      }

      // Layering force pulls nodes towards the Y plane of their tag.
      for i in 0..<positions.count {
        let targetY = layerOf[nodeIDs[i]] ?? 0
        forces[i].y += (targetY - positions[i].y) * 0.08
      }

      // Centering force.
      var centroid = Vec3.zero
      for position in positions { centroid = centroid + position }
      if !positions.isEmpty { centroid = centroid * (1 / Double(positions.count)) }
      for i in 0..<positions.count {
        forces[i] = forces[i] - centroid * centering * 40
      }

      // Integrate.
      var totalEnergy = 0.0
      for i in 0..<positions.count {
        let force = forces[i]
        var velocity = (velocities[i] + force * 0.0016) * damping
        var displacement = velocity * 0.9
        if displacement.length > maxDisplacement {
          displacement = displacement.normalized * maxDisplacement
        }
        velocities[i] = velocity
        positions[i] = positions[i] + displacement
        totalEnergy += force.length
      }
      energy = totalEnergy
      performedIterations = iteration + 1

      // Stop early once the graph has settled.
      if iteration > 40, totalEnergy / Double(max(1, positions.count)) < 0.05 { break }
    }

    let nodes = nodeIDs.enumerated().map { index, id in
      LayoutNode(id: id, position: positions[index], degree: degrees[id] ?? 0)
    }

    return GraphLayoutResult(
      nodes: nodes,
      edges: edges.map { LayoutEdge(source: nodeIDs[$0.0], target: nodeIDs[$0.1]) },
      iterations: performedIterations,
      energy: energy
    )
  }

  /// Computes a deterministic starting position from a node id.
  ///
  /// A stable hash is used instead of a random generator so the layout is
  /// reproducible across processes and machines.
  func initialPosition(for id: String, seed: UInt64) -> Vec3 {
    let hash = stableHash(id, seed: seed)
    let first = Double(hash & 0xFFFF) / Double(0xFFFF)
    let second = Double((hash >> 16) & 0xFFFF) / Double(0xFFFF)
    let third = Double((hash >> 32) & 0xFFFF) / Double(0xFFFF)
    return Vec3(
      x: (first - 0.5) * 240,
      y: (second - 0.5) * 120,
      z: (third - 0.5) * 240
    )
  }

  /// FNV-1a hash with a seed, used for deterministic placement.
  func stableHash(_ value: String, seed: UInt64) -> UInt64 {
    var hash: UInt64 = 0xCBF2_9CE4_8422_2325 ^ seed
    for byte in value.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 0x1000_0000_01B3
    }
    return hash
  }
}
