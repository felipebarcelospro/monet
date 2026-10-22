import AppKit
import SwiftUI

/// Handles the documents macOS opens with the application.
///
/// When the user double clicks a folder, or the CLI runs `monet open`, macOS
/// sends the folder to the app as a document. The app answers by opening that
/// vault.
final class AppDelegate: NSObject, NSApplicationDelegate {
  /// Keeps the app running when the last window is closed, the way the
  /// system notes app does. The window can be reopened from the Dock.
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  /// Called when macOS opens a file or a folder with the app.
  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls {
      var isDirectory: ObjCBool = false
      guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
            isDirectory.boolValue else {
        continue
      }
      NotificationCenter.default.post(
        name: .monetOpenVault,
        object: url.standardizedFileURL
      )
    }
  }

  /// The path passed with `--capture`, if any.
  ///
  /// The flag renders the window into a PNG and quits. It exists so the
  /// screenshots of the README can be produced on a machine without the
  /// Screen Recording permission.
  static func capturePath() -> String? {
    LaunchOptions.parse().capturePath
  }

  /// Captures the first visible window into a PNG and quits.
  @MainActor
  static func captureFrontWindow(to path: String) {
    let window = NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil })
      ?? NSApp.mainWindow
    guard let window else { return }
    capture(window: window, to: path)
    NSApp.terminate(nil)
  }

  /// Renders a window into a PNG file.
  @MainActor
  static func capture(window: NSWindow, to path: String) {
    // Only the content is captured. The titlebar and the toolbar are native
    // glass, which the offscreen renderer cannot reproduce.
    guard let view = window.contentView else { return }
    let bounds = view.bounds
    guard let rep = view.bitmapImageRepForCachingDisplay(in: bounds) else { return }
    view.cacheDisplay(in: bounds, to: rep)
    guard let png = rep.representation(using: .png, properties: [:]) else { return }

    let url = URL(fileURLWithPath: path)
    try? FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try? png.write(to: url)
    FileHandle.standardError.write(Data("captured \(url.path)\n".utf8))
  }
}

/// The notification posted when macOS asks the app to open a vault.
extension Notification.Name {
  /// A vault folder that the app should open.
  static let monetOpenVault = Notification.Name("com.monet.openVault")
}
