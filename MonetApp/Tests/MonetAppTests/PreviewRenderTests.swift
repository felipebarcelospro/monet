import AppKit
import MonetCore
import SwiftUI
import XCTest

@testable import MonetApp

/// Renders the interface offscreen so the design can be reviewed without a
/// window server.
///
/// The images land in `docs/screenshots/`. Run the test with:
///
/// ```sh
/// swift test --filter PreviewRenderTests
/// ```
@MainActor
final class PreviewRenderTests: XCTestCase {
  /// The folder the previews are written to.
  private static var outputFolder: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()   // MonetAppTests
      .deletingLastPathComponent()   // MonetApp
      .deletingLastPathComponent()   // MonetCore
      .deletingLastPathComponent()   // repository root
      .appending(path: "docs/screenshots")
  }

  /// The example vault shipped with the repository.
  private static var exampleVault: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appending(path: "ExampleVault")
  }

  func testRendersThePreviews() async throws {
    let folder = Self.outputFolder
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

    let model = AppModel()
    if FileManager.default.fileExists(atPath: Self.exampleVault.path) {
      await model.openVault(Self.exampleVault)
    }
    model.preferences.favorites = ["Projects/Monet Launch"]
    model.select(noteID: "Projects/Monet Launch")

    // The onboarding screen.
    let onboarding = OnboardingView()
      .environment(model)
      .frame(width: 1_100, height: 720)
    render(onboarding, named: "01-onboarding", in: folder)

    // The editor with a note open.
    let editor = EditorPane()
      .environment(model)
      .frame(width: 900, height: 720)
    render(editor, named: "02-editor", in: folder)

    // The sources sidebar.
    let sidebar = SourcesSidebar()
      .environment(model)
      .frame(width: 220, height: 720)
    render(sidebar, named: "03-sources", in: folder)

    // The note list.
    let list = NoteListView()
      .environment(model)
      .frame(width: 300, height: 720)
    render(list, named: "04-note-list", in: folder)

    // The inspector.
    let inspector = InspectorView()
      .environment(model)
      .frame(width: 290, height: 720)
    render(inspector, named: "05-inspector", in: folder)

    // The command palette.
    let palette = CommandPalette()
      .environment(model)
      .frame(width: 1_100, height: 720)
    render(palette, named: "06-command-palette", in: folder)
  }

  /// Renders a view into a PNG file.
  private func render<V: View>(_ view: V, named name: String, in folder: URL) {
    let renderer = ImageRenderer(content: view)
    renderer.scale = 2

    guard let image = renderer.nsImage,
          let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
      XCTFail("Could not render \(name)")
      return
    }

    let url = folder.appending(path: "\(name).png")
    try? png.write(to: url)
    XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
  }
}
