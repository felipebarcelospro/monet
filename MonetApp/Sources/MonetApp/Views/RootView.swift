import MonetCore
import SwiftUI

/// The root layout, modelled on the system notes application.
///
/// A native `NavigationSplitView` provides the window chrome: macOS 26 draws
/// the sidebar, the toolbar and the inspector with Liquid Glass automatically,
/// which is exactly where the material belongs — the navigation layer that
/// floats above the content. The content itself (the note list, the editor,
/// the inspector body) uses standard surfaces, as the guidelines require.
struct RootView: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model

  var body: some View {
    @Bindable var model = model

    HStack(spacing: 0) {
      SourcesSidebar()
        .frame(minWidth: 190, idealWidth: 212, maxWidth: 260)

      Divider().overlay(Palette.separator)

      NoteListView()
        .frame(minWidth: 240, idealWidth: 292, maxWidth: 380)

      Divider().overlay(Palette.separator)

      HStack(spacing: 0) {
        detail
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        if model.showsInspector {
          Divider().overlay(Palette.separator)
          InspectorView()
            .frame(width: 268)
            .transition(.move(edge: .trailing).combined(with: .opacity))
        }
      }
    }
    .animation(.smooth(duration: 0.2), value: model.showsInspector)
    .navigationTitle(model.vaultURL?.lastPathComponent ?? "Monet")
    .navigationSubtitle(model.selectedNote?.title ?? "")
    .toolbar { toolbarContent }
    .searchable(
      text: Bindable(model).searchQuery,
      placement: .toolbar,
      prompt: Text("sidebar.searchPlaceholder")
    )
    .onChange(of: model.searchQuery) { _, _ in model.runSearch() }
    .overlay {
      if model.showsCommandPalette {
        CommandPalette()
          .transition(.opacity)
      }
    }
    .animation(.smooth(duration: 0.18), value: model.showsCommandPalette)
    .overlay(alignment: .bottom) {
      if let error = model.lastError {
        ErrorBanner(message: error) { model.lastError = nil }
          .padding(.bottom, 14)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.spring(response: 0.34, dampingFraction: 0.86), value: model.lastError)
    .onReceive(NotificationCenter.default.publisher(for: .monetOpenVault)) { notification in
      guard let url = notification.object as? URL else { return }
      Task { await model.openVault(url) }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
      model.releaseVault()
    }
    .task { await prepare() }
    .fileImporter(
      isPresented: Bindable(model).showsVaultPicker,
      allowedContentTypes: [.folder],
      allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        Task { await model.openVault(url) }
      }
    }
    .overlay {
      if model.vaultURL == nil, !model.isLoading {
        OnboardingView()
          .transition(.opacity)
      }
    }
    .environment(\.flatSurfaces, LaunchOptions.parse().capturePath != nil)
  }

  /// Opens the vault and, when the app was asked to, captures its window.
  private func prepare() async {
    let options = LaunchOptions.parse()

    if let vault = options.vault {
      await model.openVault(vault)
      if let note = options.note { model.select(noteID: note) }
    } else if let recent = model.preferences.recentVaults.first {
      await model.openVault(recent)
    }

    if let workspace = options.workspace, let value = Workspace(rawValue: workspace) {
      model.workspace = value
    }
    if options.startsFocused { model.focusMode = true }
    if options.opensPalette { model.showsCommandPalette = true }

    if let path = options.capturePath {
      try? await Task.sleep(for: .seconds(1.4))
      AppDelegate.captureFrontWindow(to: path)
    }
  }

  @ViewBuilder
  private var detail: some View {
    switch model.workspace {
    case .editor:
      EditorPane()
    case .graph:
      GraphPane()
    }
  }

  @ToolbarContentBuilder
  private var toolbarContent: some ToolbarContent {
    ToolbarItem(placement: .navigation) {
      Button {
        Task { await model.createNote(title: "Untitled") }
      } label: {
        Image(systemName: "square.and.pencil")
      }
      .help(Text("sidebar.newNote"))
      .disabled(model.vaultURL == nil)
    }

    ToolbarItem(placement: .principal) {
      WorkspacePicker()
    }

    ToolbarItemGroup(placement: .automatic) {
      Button {
        withAnimation(.smooth(duration: 0.2)) {
          model.focusMode.toggle()
        }
      } label: {
        Image(systemName: model.focusMode
          ? "arrow.down.right.and.arrow.up.left"
          : "arrow.up.left.and.arrow.down.right")
      }
      .help(Text("editor.focusMode"))
      .disabled(model.selectedNote == nil)

      Button {
        model.showsInspector.toggle()
      } label: {
        Image(systemName: "sidebar.trailing")
      }
      .help(Text("inspector.show"))
    }
  }
}

/// The control that chooses between the editor and the graph.
///
/// It is a standard segmented picker: the toolbar already draws Liquid Glass
/// behind it, and the guidelines are explicit that glass must never be
/// stacked on glass.
struct WorkspacePicker: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model

  var body: some View {
    @Bindable var model = model

    Picker("Workspace", selection: $model.workspace) {
      ForEach(Workspace.allCases, id: \.self) { workspace in
        Label {
          Text(workspace.localizedName)
        } icon: {
          Image(systemName: workspace.symbol)
        }
        .tag(workspace)
      }
    }
    .pickerStyle(.segmented)
    .labelsHidden()
    .frame(width: 104)
    .help(Text("workspace.picker"))
  }
}

/// A dismissible banner that reports the last error.
///
/// A transient notice that floats over the content, so it uses a standard
/// material rather than a second sheet of glass.
struct ErrorBanner: View {
  let message: String
  let onDismiss: () -> Void

  var body: some View {
    HStack(spacing: 9) {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 11))
        .foregroundStyle(Palette.destructive)
      Text(message)
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.text)
        .lineLimit(2)
      Button(action: onDismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(Palette.textSecondary)
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(.regularMaterial)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(Palette.separator, lineWidth: Metrics.hairline)
    )
    .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
  }
}
