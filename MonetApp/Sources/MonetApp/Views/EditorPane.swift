import MonetCore
import SwiftUI

/// The third column: the note itself.
///
/// There is no title bar and no cards. The note's own Markdown heading is the
/// title, and the only chrome is a hairline breadcrumb above the text and a
/// word count below it.
struct EditorPane: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model
  /// The wikilink query under the cursor.
  @State private var linkQuery: String?

  var body: some View {
    @Bindable var model = model

    Group {
      if let note = model.selectedNote {
        VStack(spacing: 0) {
          if !model.focusMode {
            breadcrumb(note: note)
          }

          writingSurface

          if !model.focusMode {
            statusBar
          }
        }
      } else {
        emptyState
      }
    }
    .background(Palette.canvas)
  }

  // MARK: - Chrome

  private func breadcrumb(note: Note) -> some View {
    HStack(spacing: 8) {
      HStack(spacing: 4) {
        ForEach(Array(folders(note).enumerated()), id: \.offset) { index, folder in
          if index > 0 {
            Image(systemName: "chevron.compact.right")
              .font(.system(size: 8, weight: .semibold))
              .foregroundStyle(Palette.textTertiary.opacity(0.7))
          }
          Text(folder)
            .font(Type.rowSubtitle)
            .foregroundStyle(Palette.textTertiary)
            .lineLimit(1)
        }
      }

      Spacer(minLength: 8)

      if model.isDirty {
        Text("editor.saving")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
      }

      Button {
        model.toggleFavorite(noteID: note.id)
      } label: {
        Image(systemName: model.preferences.favorites.contains(note.id) ? "star.fill" : "star")
          .font(.system(size: 12))
          .foregroundStyle(
            model.preferences.favorites.contains(note.id)
              ? Palette.favorite : Palette.textTertiary
          )
      }
      .buttonStyle(.plain)
      .help(Text("editor.toggleFavorite"))
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 7)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(Palette.separator)
        .frame(height: Metrics.hairline)
    }
  }

  private var statusBar: some View {
    HStack(spacing: 10) {
      Text("\(model.wordCount) words")
        .monospacedDigit()
      Text("·")
        .foregroundStyle(Palette.textTertiary.opacity(0.5))
      Text("\(model.readingMinutes) min read")
        .monospacedDigit()
      Spacer(minLength: 0)
      if let note = model.selectedNote {
        Text("\(note.links.count) links")
          .monospacedDigit()
      }
      Text("Markdown")
    }
    .font(Type.rowSubtitle)
    .foregroundStyle(Palette.textTertiary)
    .padding(.horizontal, 18)
    .padding(.vertical, 5)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Palette.separator)
        .frame(height: Metrics.hairline)
    }
  }

  // MARK: - Writing surface

  private var writingSurface: some View {
    @Bindable var model = model

    return ZStack(alignment: .topLeading) {
      MarkdownTextView(
        text: $model.editorText,
        onChange: { model.editorTextDidChange() },
        linkQuery: $linkQuery,
        onOpenLink: { target in
          guard let resolved = model.index.resolver.resolve(target: target) else { return }
          model.select(noteID: resolved)
        },
        candidates: candidates
      )
      .frame(maxWidth: Metrics.readingWidth)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, 26)
      .padding(.top, 22)

      LinkCompletionOverlay(query: linkQuery, candidates: candidates) { candidate in
        insertCompletion(candidate)
      }
      .padding(.top, 30)
      .padding(.horizontal, 18)
      .frame(maxWidth: Metrics.readingWidth, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var emptyState: some View {
    VStack(spacing: 8) {
      Image(systemName: "text.alignleft")
        .font(.system(size: 22, weight: .light))
        .foregroundStyle(Palette.textTertiary)
      Text("editor.empty")
        .font(Type.body)
        .foregroundStyle(Palette.textSecondary)
      Text("editor.emptyDescription")
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textTertiary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  // MARK: - Helpers

  /// The folders that contain the note, used for the breadcrumb.
  private func folders(_ note: Note) -> [String] {
    let components = note.relativePath.split(separator: "/").map(String.init)
    return Array(components.dropLast())
  }

  /// The notes that can be linked to, filtered by the current query.
  private var candidates: [Note] {
    guard let linkQuery else { return [] }
    let trimmed = linkQuery.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty {
      return Array(model.index.notes.sorted { $0.title < $1.title }.prefix(7))
    }
    let needle = trimmed.lowercased()
    return model.index.notes
      .filter {
        $0.title.lowercased().contains(needle)
          || $0.aliases.contains { $0.lowercased().contains(needle) }
          || $0.relativePath.lowercased().contains(needle)
      }
      .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
  }

  /// Inserts the chosen completion, replacing the partial `[[query`.
  private func insertCompletion(_ note: Note) {
    let query = linkQuery ?? ""
    let replacement = "[[\(note.title)]]"
    let current = model.editorText
    guard let range = current.range(of: "[[\(query)", options: .backwards) else {
      linkQuery = nil
      return
    }
    var updated = current
    updated.replaceSubrange(range, with: replacement)
    model.editorText = updated
    model.editorTextDidChange()
    linkQuery = nil
  }
}
