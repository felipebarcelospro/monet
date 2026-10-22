import MonetCore
import SwiftUI

/// The second column: the notes of the current source, grouped by age.
///
/// The rows are laid out in a scroll view rather than a `List`, so the
/// selection is a quiet grey fill and the keyboard can move between notes
/// explicitly.
struct NoteListView: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model
  /// Whether the list has the keyboard focus.
  @FocusState private var isFocused: Bool

  var body: some View {
    VStack(spacing: 0) {
      ListHeader(title: model.noteListTitle, count: model.listedNotes.count)

      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
            if model.listedSections.isEmpty {
              emptyState
            } else {
              ForEach(model.listedSections) { section in
                Section {
                  ForEach(section.notes) { note in
                    row(note)
                  }
                } header: {
                  if !section.title.isEmpty {
                    sectionHeader(section.title)
                  }
                }
              }
            }
          }
          .padding(.bottom, 8)
        }
        .scrollIndicators(.never)
        .onChange(of: model.selectedNoteID) { _, newValue in
          guard let newValue else { return }
          withAnimation(.easeOut(duration: 0.15)) {
            proxy.scrollTo(newValue, anchor: .center)
          }
        }
      }
    }
    .background(Palette.list)
    .focusable()
    .focusEffectDisabled()
    .focused($isFocused)
    .onKeyPress(.upArrow) {
      move(by: -1)
      return .handled
    }
    .onKeyPress(.downArrow) {
      move(by: 1)
      return .handled
    }
    .overlay(alignment: .trailing) {
      Rectangle()
        .fill(Palette.separator)
        .frame(width: Metrics.hairline)
    }
  }

  // MARK: - Rows

  private func row(_ note: Note) -> some View {
    NoteListRow(
      note: note,
      isSelected: model.selectedNoteID == note.id,
      isFavorite: model.preferences.favorites.contains(note.id)
    )
    .padding(.horizontal, 6)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(Palette.rowSeparator)
        .frame(height: Metrics.hairline)
        .padding(.leading, 15)
    }
    .contentShape(Rectangle())
    .onTapGesture {
      model.select(noteID: note.id)
      isFocused = true
    }
    .contextMenu { contextMenu(note) }
    .id(note.id)
  }

  private func sectionHeader(_ title: String) -> some View {
    Text(title)
      .font(Type.section)
      .foregroundStyle(Palette.textSecondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 15)
      .padding(.top, 12)
      .padding(.bottom, 5)
      .background(Palette.list)
  }

  private var emptyState: some View {
    VStack(spacing: 6) {
      Image(systemName: "doc.text")
        .font(.system(size: 20, weight: .light))
        .foregroundStyle(Palette.textTertiary)
      Text("sidebar.noNotes")
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textSecondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 48)
  }

  // MARK: - Keyboard

  /// Moves the selection by one note.
  private func move(by offset: Int) {
    let notes = model.listedNotes
    guard !notes.isEmpty else { return }

    let current = notes.firstIndex { $0.id == model.selectedNoteID }
    let next: Int
    if let current {
      next = min(max(current + offset, 0), notes.count - 1)
    } else {
      next = offset > 0 ? 0 : notes.count - 1
    }
    model.select(noteID: notes[next].id)
  }

  // MARK: - Menu

  @ViewBuilder
  private func contextMenu(_ note: Note) -> some View {
    Button {
      model.select(noteID: note.id)
    } label: {
      Label("sidebar.open", systemImage: "arrow.up.forward.app")
    }

    Button {
      model.toggleFavorite(noteID: note.id)
    } label: {
      Label(
        model.preferences.favorites.contains(note.id)
          ? "sidebar.removeFavorite" : "sidebar.addFavorite",
        systemImage: "star"
      )
    }

    Divider()

    Button {
      if let vault = model.vaultURL {
        NSWorkspace.shared.activateFileViewerSelecting([
          vault.appending(path: note.relativePath),
        ])
      }
    } label: {
      Label("sidebar.revealInFinder", systemImage: "folder")
    }

    Button {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(note.relativePath, forType: .string)
    } label: {
      Label("sidebar.copyPath", systemImage: "doc.on.doc")
    }
  }
}
