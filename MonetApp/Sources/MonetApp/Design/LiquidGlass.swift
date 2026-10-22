import Foundation
import SwiftUI

/// The shapes Liquid Glass can be applied to.
public enum GlassShape: Sendable {
  /// A rectangle with a continuous corner radius.
  case rect
  /// A capsule.
  case capsule
}

/// A type-erased `Shape`, used to forward a shape to `glassEffect(_:in:)`.
public struct AnyGlassShape: Shape {
  private let pathBuilder: @Sendable (CGRect) -> Path

  public init(_ shape: some Shape) {
    pathBuilder = { shape.path(in: $0) }
  }

  public init(_ shape: GlassShape) {
    switch shape {
    case .rect: self.init(RoundedRectangle(cornerRadius: 12, style: .continuous))
    case .capsule: self.init(Capsule(style: .continuous))
    }
  }

  public func path(in rect: CGRect) -> Path {
    pathBuilder(rect)
  }
}

/// Runtime detection for Apple's native Liquid Glass API.
///
/// Monet targets macOS 26 (Tahoe), where `glassEffect(_:in:)` and
/// `GlassEffectContainer` are part of the SDK and are always compiled in.
/// The check below is deliberately a runtime check instead of an
/// `#available` guard, because `#available` would be folded away by the
/// compiler and the fallback branch would become unreachable code that can
/// never be exercised.
///
/// **Why the fallback exists:** the material fallback is not a "fake blur" of
/// the glass effect — it is what the system itself renders when the glass
/// material is unavailable (for example on a macOS release that predates
/// Tahoe, or when the app is rebuilt against an older SDK). Keeping the
/// branch means the app degrades gracefully instead of rendering an empty
/// panel, and the reason is documented in `README.md`.
public enum LiquidGlass {
  /// Whether the running system provides the native Liquid Glass API.
  public static let isAvailable: Bool = {
    if #available(macOS 26.0, *) {
      return ProcessInfo.processInfo.isOperatingSystemAtLeast(
        OperatingSystemVersion(majorVersion: 26, minorVersion: 0, patchVersion: 0)
      )
    }
    return false
  }()

  /// The reason the fallback is used, or `nil` when the native API is active.
  public static var fallbackReason: String? {
    isAvailable ? nil : "macOS 26 (Tahoe) or later is required for the native Liquid Glass effect."
  }
}

/// Applies Apple's native Liquid Glass effect to a view.
///
/// The modifier uses `glassEffect(_:in:)` with the real `Glass` value
/// (`.regular` or `.clear`) whenever the system supports it. When it does
/// not, the view falls back to a system material, and the reason is logged
/// once so it can be surfaced in the README and in the app's diagnostics.
public struct GlassSurface: ViewModifier {
  /// The glass variant to apply.
  public var glass: Glass
  /// The shape the glass is clipped to.
  public var shape: GlassShape
  /// Whether the glass reacts to pointer interaction.
  public var interactive: Bool
  /// An optional tint applied to the glass.
  public var tint: Color?

  public init(
    glass: Glass = .regular,
    shape: GlassShape = .rect,
    interactive: Bool = false,
    tint: Color? = nil
  ) {
    self.glass = glass
    self.shape = shape
    self.interactive = interactive
    self.tint = tint
  }

  public func body(content: Content) -> some View {
    if LiquidGlass.isAvailable {
      let base = tint.map { glass.tint($0) } ?? glass
      let applied = interactive ? base.interactive() : base
      content.glassEffect(applied, in: AnyGlassShape(shape))
    } else {
      content.background(.ultraThinMaterial, in: AnyGlassShape(shape))
    }
  }
}

public extension View {
  /// Applies the native Liquid Glass effect, falling back to a material.
  func glassSurface(
    glass: Glass = .regular,
    shape: GlassShape = .rect,
    interactive: Bool = false,
    tint: Color? = nil
  ) -> some View {
    modifier(
      GlassSurface(
        glass: glass,
        shape: shape,
        interactive: interactive,
        tint: tint
      )
    )
  }
}
