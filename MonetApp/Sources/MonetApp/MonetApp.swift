import MonetCore
import SwiftUI

/// The Monet application.
@main
struct MonetApp: App {
  /// The shared application state.
  @State private var model = AppModel()
  /// Handles the folders macOS opens with the app.
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  init() {
    // The preferences are per-user state and live outside the vault, so the
    // app and the CLI can never disagree about the vault contents.
    let model = AppModel()
    model.preferences.load()
    _model = State(initialValue: model)
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(model)
        .frame(minWidth: 980, minHeight: 620)
        .onOpenURL { url in
          Task { await model.openVault(url) }
        }
    }
    .defaultSize(width: 1_320, height: 840)
    .windowToolbarStyle(.unifiedCompact)
    .commands { commands }
  }

  @CommandsBuilder
  private var commands: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("Open Vault…") {
        model.showsVaultPicker = true
      }
      .keyboardShortcut("o", modifiers: [.command])

      Button("New Note") {
        Task { await model.createNote(title: "Untitled") }
      }
      .keyboardShortcut("n", modifiers: [.command, .shift])
      .disabled(model.vaultURL == nil)
    }

    CommandGroup(replacing: .textEditing) {
      Button("Quick Open…") {
        model.showsCommandPalette = true
      }
      .keyboardShortcut("p", modifiers: [.command])

    }

    CommandGroup(after: .toolbar) {
      Toggle("Inspector", isOn: Binding(
        get: { model.showsInspector },
        set: { model.showsInspector = $0 }
      ))
      .keyboardShortcut("i", modifiers: [.command, .option])

      Toggle("Focus Mode", isOn: Binding(
        get: { model.focusMode },
        set: { model.focusMode = $0 }
      ))
      .keyboardShortcut("f", modifiers: [.command, .shift])
    }

    CommandMenu("View") {
      Picker("Workspace", selection: Bindable(model).workspace) {
        ForEach(Workspace.allCases, id: \.self) { workspace in
          Label {
            Text(workspace.localizedName)
          } icon: {
            Image(systemName: workspace.symbol)
          }
          .tag(workspace)
        }
      }
      .pickerStyle(.inline)
    }

    CommandMenu("Vault") {
      Button("Save Note") {
        Task { await model.saveCurrentNote() }
      }
      .keyboardShortcut("s", modifiers: [.command])
      .disabled(!model.isDirty)

      Button("Reload Vault") {
        Task { await model.reload() }
      }
      .keyboardShortcut("r", modifiers: [.command])

      Divider()

      Button("Reveal Vault in Finder") {
        if let url = model.vaultURL {
          NSWorkspace.shared.activateFileViewerSelecting([url])
        }
      }
      .disabled(model.vaultURL == nil)
    }
  }
}
