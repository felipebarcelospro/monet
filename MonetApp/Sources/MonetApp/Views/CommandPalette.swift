import MonetCore
import SwiftUI

/// The quick open panel: a search field and a list of notes.
///
/// It is the fastest way to move around a big vault: one field, fuzzy
/// matching, and the keyboard drives everything.
struct CommandPalette: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model
  /// The query typed by the user.
  @State private var query = ""
  /// The notes that match the query.
  @State private var results: [Note] = []
  /// The highlighted result.
  @State private var highlighted = 0
  /// Whether the field has the keyboard focus.
  @FocusState private var isFocused: Bool

  var body: some View {
    ZStack {
      Color.black.opacity(0.16)
        .ignoresSafeArea()
        .onTapGesture { close() }

      VStack(spacing: 0) {
        searchField

        Rectangle()
          .fill(Palette.separator)
          .frame(height: Metrics.hairline)

        if results.isEmpty {
          emptyState
        } else {
          resultList
        }
      }
      .frame(width: 560, height: 380)
      .background(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(Palette.paletteSurface)
          .shadow(color: .black.opacity(0.24), radius: 32, y: 14)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(Palette.separator, lineWidth: Metrics.hairline)
      )
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .padding(.top, 80)
    }
    .onAppear {
      isFocused = true
      results = model.search("", limit: 40)
    }
    .onChange(of: query) { _, newValue in
      results = model.search(newValue, limit: 40)
      highlighted = 0
    }
  }

  private var searchField: some View {
    HStack(spacing: 9) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(Palette.textTertiary)

      TextField("palette.placeholder", text: $query)
        .textFieldStyle(.plain)
        .font(.system(size: 14))
        .focused($isFocused)
        .onSubmit { open(highlighted) }

      if !query.isEmpty {
        Button {
          query = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(Palette.textTertiary)
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }

  private var resultList: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 0) {
          ForEach(Array(results.enumerated()), id: \.element.id) { index, note in
            Button {
              open(index)
            } label: {
              HStack(spacing: 8) {
                Image(systemName: "doc.text")
                  .font(.system(size: 11))
                  .foregroundStyle(index == highlighted ? Palette.accent : Palette.textTertiary)
                  .frame(width: 14)

                Text(note.title)
                  .font(.system(size: 12.5))
                  .foregroundStyle(Palette.text)
                  .lineLimit(1)

                Spacer(minLength: 0)

                Text(note.relativePath)
                  .font(.system(size: 10.5))
                  .foregroundStyle(Palette.textTertiary)
                  .lineLimit(1)
                  .truncationMode(.middle)
              }
              .padding(.horizontal, 14)
              .padding(.vertical, 6)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                  .fill(index == highlighted ? Palette.selection : .clear)
                  .padding(.horizontal, 6)
              )
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .id(note.id)
            .onHover { inside in
              if inside { highlighted = index }
            }
          }
        }
        .padding(.vertical, 5)
      }
      .onChange(of: highlighted) { _, newValue in
        guard results.indices.contains(newValue) else { return }
        withAnimation(.easeOut(duration: 0.1)) {
          proxy.scrollTo(results[newValue].id, anchor: .center)
        }
      }
    }
  }

  private var emptyState: some View {
    VStack(spacing: 6) {
      Text("palette.noResults")
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textSecondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func open(_ index: Int) {
    guard results.indices.contains(index) else { return }
    model.select(noteID: results[index].id)
    close()
  }

  private func close() {
    withAnimation(.smooth(duration: 0.15)) {
      model.showsCommandPalette = false
    }
    query = ""
  }
}
