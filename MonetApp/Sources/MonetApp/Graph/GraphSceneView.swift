import AppKit
import MonetCore
import SceneKit
import SwiftUI

/// A SceneKit view that renders the vault graph and reports node picking.
struct GraphSceneView: NSViewRepresentable {
  /// The layout to render.
  let layout: GraphLayoutResult
  /// The ids of the notes to show; `nil` shows everything.
  let visibleIDs: Set<String>?
  /// The id of the selected note.
  let selectedID: String?
  /// The ids of the neighbours of the selected note.
  let neighbourIDs: Set<String>
  /// The id of the node under the pointer.
  let hoveredID: String?
  /// Called when a node is picked.
  let onPick: (String?) -> Void
  /// Called when the pointer moves over a node.
  let onHover: (String?) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  func makeNSView(context: Context) -> SCNView {
    let view = SCNView()
    view.pointOfView = makeCameraNode()
    view.allowsCameraControl = true
    view.autoenablesDefaultLighting = false
    view.antialiasingMode = .multisampling4X
    view.backgroundColor = NSColor(calibratedWhite: 0.02, alpha: 1)
    view.preferredFramesPerSecond = 60
    view.isPlaying = true
    view.rendersContinuously = true
    view.wantsLayer = true
    view.layer?.backgroundColor = NSColor.clear.cgColor

    let builder = GraphSceneBuilder()
    context.coordinator.builder = builder
    context.coordinator.sceneView = view
    rebuild(view: view, context: context)

    let click = NSClickGestureRecognizer(
      target: context.coordinator,
      action: #selector(Coordinator.handleClick(_:))
    )
    view.addGestureRecognizer(click)

    let tracking = NSTrackingArea(
      rect: .zero,
      options: [.activeInKeyWindow, .mouseMoved, .inVisibleRect],
      owner: context.coordinator,
      userInfo: nil
    )
    view.addTrackingArea(tracking)

    // A short camera move when the scene appears, so the graph does not just
    // pop into place.
    context.coordinator.playIntro(view: view)

    return view
  }

  func updateNSView(_ view: SCNView, context: Context) {
    context.coordinator.parent = self
    rebuild(view: view, context: context)
  }

  private func rebuild(view: SCNView, context: Context) {
    guard let builder = context.coordinator.builder else { return }
    let built = builder.buildScene(
      layout: layout,
      visibleIDs: visibleIDs,
      selectedID: selectedID,
      neighbourIDs: neighbourIDs,
      hoveredID: hoveredID
    )
    view.scene = built.scene
    context.coordinator.buckets = built.buckets
  }

  /// Creates the camera node used by the graph.
  private func makeCameraNode() -> SCNNode {
    let camera = SCNCamera()
    camera.fieldOfView = 50
    camera.wantsHDR = true
    camera.bloomIntensity = 0.85
    camera.bloomThreshold = 0.55
    camera.bloomBlurRadius = 14
    camera.zNear = 0.5
    camera.zFar = 6_000
    camera.wantsExposureAdaptation = false
    camera.contrast = 1.05
    camera.saturation = 1.08

    let node = SCNNode()
    node.camera = camera
    node.position = SCNVector3(0, 0, 300)
    return node
  }

  /// Handles picking and keeps the SceneKit view in sync with the model.
  @MainActor
  final class Coordinator: NSObject {
    /// The view being coordinated.
    var parent: GraphSceneView
    /// The scene builder.
    var builder: GraphSceneBuilder?
    /// The buckets of the current scene, used to map a pick back to a note.
    var buckets: [GraphBucket] = []
    /// Whether the scene has already played its intro.
    private var didPlayIntro = false
    /// The view being coordinated.
    weak var sceneView: SCNView?

    init(_ parent: GraphSceneView) {
      self.parent = parent
    }

    /// Moves the camera into place when the scene first appears.
    func playIntro(view: SCNView) {
      guard !didPlayIntro else { return }
      didPlayIntro = true

      guard let cameraNode = view.pointOfView else { return }
      let target = cameraNode.position
      cameraNode.position = SCNVector3(
        target.x * 1.55,
        target.y * 1.55 + 60,
        target.z * 1.55
      )

      SCNTransaction.begin()
      SCNTransaction.animationDuration = 1.1
      SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeOut)
      cameraNode.position = target
      SCNTransaction.commit()
    }

    /// Reports the picked node.
    @objc func handleClick(_ recognizer: NSClickGestureRecognizer) {
      guard let view = recognizer.view as? SCNView else { return }
      let location = recognizer.location(in: view)
      let results = view.hitTest(location, options: [.searchMode: SCNHitTestSearchMode.closest.rawValue])

      guard let result = results.first else {
        parent.onPick(nil)
        return
      }
      guard let node = result.node.parent, node.name == GraphSceneBuilder.nodeGeometryName else {
        parent.onPick(nil)
        return
      }

      // `geometryIndex` is the colour bucket, `faceIndex` the triangle.
      let bucketIndex = result.geometryIndex
      guard bucketIndex >= 0, bucketIndex < buckets.count else {
        parent.onPick(nil)
        return
      }
      let bucket = buckets[bucketIndex]
      let triangle = result.faceIndex / Icosphere.faces.count
      guard triangle >= 0, triangle < bucket.nodeIDs.count else {
        parent.onPick(nil)
        return
      }
      parent.onPick(bucket.nodeIDs[triangle])
    }

    /// Reports the node under the pointer.
    @objc func mouseMoved(with event: NSEvent) {
      guard let view = sceneView else { return }
      let location = view.convert(event.locationInWindow, from: nil)
      let results = view.hitTest(
        location,
        options: [SCNHitTestOption.searchMode: SCNHitTestSearchMode.closest.rawValue]
      )

      guard let result = results.first,
            let node = result.node.parent,
            node.name == GraphSceneBuilder.nodeGeometryName else {
        if parent.hoveredID != nil { parent.onHover(nil) }
        return
      }

      let bucketIndex = result.geometryIndex
      guard bucketIndex >= 0, bucketIndex < buckets.count else { return }
      let bucket = buckets[bucketIndex]
      let triangle = result.faceIndex / Icosphere.faces.count
      guard triangle >= 0, triangle < bucket.nodeIDs.count else { return }

      let id = bucket.nodeIDs[triangle]
      if parent.hoveredID != id { parent.onHover(id) }
    }
  }
}
