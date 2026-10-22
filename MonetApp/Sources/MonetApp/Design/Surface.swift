import SwiftUI

/// A flag that swaps the translucent surfaces for solid colours.
///
/// The app is translucent in normal use: the sidebar and the inspector use a
/// system material, the toolbar uses Liquid Glass, and the graph HUD uses the
/// native glass effect. The offscreen renderer used to produce the README
/// screenshots cannot rasterise those surfaces, so the capture mode turns
/// them into solid colours. The layout is identical either way.
private struct FlatSurfacesKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether surfaces should be drawn as solid colours.
  var flatSurfaces: Bool {
    get { self[FlatSurfacesKey.self] }
    set { self[FlatSurfacesKey.self] = newValue }
  }
}

/// A surface that is a system material in normal use and a solid colour when
/// the interface is being rendered offscreen.
struct Surface: ViewModifier {
  /// The material used in the running app.
  let material: Material
  /// The colour used when the surfaces are flattened.
  let flat: Color

  @Environment(\.flatSurfaces) private var isFlat

  func body(content: Content) -> some View {
    content.background(
      isFlat
        ? AnyShapeStyle(flat)
        : AnyShapeStyle(material)
    )
  }
}

extension View {
  /// Backs the view with a system material, or a solid colour when flat.
  func surface(_ material: Material = .regularMaterial, flat: Color) -> some View {
    modifier(Surface(material: material, flat: flat))
  }
}
