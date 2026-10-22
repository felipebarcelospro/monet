import AppKit
import SwiftUI

/// The design tokens of Monet.
///
/// The palette is built on the semantic AppKit colours, so every surface
/// follows the system appearance without a single hard-coded value. Colour is
/// used sparingly: the interface is neutral, and the only saturated things in
/// the window are a link and the graph.
enum Palette {
  // MARK: - Surfaces

  /// The colour of the sources sidebar.
  static let sidebar = Color(nsColor: .windowBackgroundColor)
  /// The colour of the note list.
  static let list = Color(nsColor: .controlBackgroundColor)
  /// The colour behind the note being read.
  static let canvas = Color(nsColor: .textBackgroundColor)
  /// The colour of a window that holds no document.
  static let window = Color(nsColor: .windowBackgroundColor)
  /// A hairline between surfaces.
  static let separator = Color(nsColor: .separatorColor)
  /// The stand-in colour for the palette when surfaces are flattened.
  static let paletteSurface = Color(nsColor: .controlBackgroundColor)
  /// A separator that sits inside a list row.
  static let rowSeparator = Color(nsColor: .separatorColor).opacity(0.55)
  /// The fill of a selected row when the window is not key.
  static let selection = Color(nsColor: .unemphasizedSelectedContentBackgroundColor)
  /// The tint that makes a list draw a neutral selection.
  static let selectionTint = Color(nsColor: .unemphasizedSelectedContentBackgroundColor)

  // MARK: - Text

  /// The primary text colour.
  static let text = Color(nsColor: .labelColor)
  /// Supporting text.
  static let textSecondary = Color(nsColor: .secondaryLabelColor)
  /// Placeholder and meta text.
  static let textTertiary = Color(nsColor: .tertiaryLabelColor)

  // MARK: - Accents

  /// The accent used by the few interactive elements that need one.
  static let accent = Color.accentColor
  /// The colour of a favourite.
  static let favorite = Color(nsColor: .systemYellow)
  /// The colour of a destructive action.
  static let destructive = Color(nsColor: .systemRed)
}

/// The metrics of the interface.
enum Metrics {
  /// The corner radius of a row selection.
  static let selectionRadius: CGFloat = 6
  /// The corner radius of a card.
  static let cardRadius: CGFloat = 10
  /// The width of a hairline.
  static let hairline: CGFloat = 0.5
  /// The comfortable reading width of the editor.
  static let readingWidth: CGFloat = 680
  /// The height of a row in the note list.
  static let noteRowHeight: CGFloat = 54
}

/// The typography of the interface.
///
/// The interface is built from three sizes only: a 13 point body, an 11 point
/// caption and the 22 point title of the editor.
enum Type {
  /// The title of a note inside the editor.
  static let title = Font.system(size: 22, weight: .bold)
  /// The body of the interface.
  static let body = Font.system(size: 13)
  /// A row title.
  static let rowTitle = Font.system(size: 13, weight: .semibold)
  /// The supporting text of a row.
  static let rowSubtitle = Font.system(size: 11)
  /// A section header.
  static let section = Font.system(size: 11, weight: .semibold)
  /// The monospaced font of the editor.
  static let editor = Font.system(size: 13.5, design: .monospaced)
}
