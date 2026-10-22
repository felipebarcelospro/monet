import MonetCore
import SwiftUI

/// The first column: the smart lists, the folders and the tags.
///
/// The column is built from plain rows rather than a `List`, so the selection
/// is a quiet grey fill instead of the accent pill the system source list
/// draws.
struct SourcesSidebar: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model
  /// The folders that are open in the tree.
  @State private var expanded: Set<String> = []

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 1) {
          smartLists
          folders
          tags
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 12)
      }
      .scrollIndicators(.never)

      footer
    }
    .surface(.regularMaterial, flat: Palette.sidebar)
  }

  // MARK: - Smart lists

  private var smartLists: some View {
    VStack(spacing: 1) {
      sourceRow(
        symbol: "tray.full",
        title: "sidebar.allNotes",
        count: model.index.notes.count,
        source: .all
      )
      sourceRow(
        symbol: "star",
        title: "sidebar.favorites",
        count: model.preferences.favorites.count,
        source: .favorites
      )
      sourceRow(
        symbol: "clock",
        title: "sidebar.recents",
        count: model.preferences.history.count,
        source: .recents
      )
    }
  }

  private func sourceRow(
    symbol: String,
    title: LocalizedStringKey,
    count: Int,
    source: NoteSource
  ) -> some View {
    let isSelected = model.noteSource == source

    return HStack(spacing: 8) {
      Image(systemName: symbol)
        .font(.system(size: 12.5))
        .foregroundStyle(isSelected ? Palette.accent : Palette.textSecondary)
        .frame(width: 18)
      Text(title)
        .font(Type.body)
        .foregroundStyle(Palette.text)
        .lineLimit(1)
      Spacer(minLength: 4)
      Text("\(count)")
        .font(Type.rowSubtitle)
        .monospacedDigit()
        .foregroundStyle(Palette.textTertiary)
    }
    .padding(.horizontal, 7)
    .padding(.vertical, 4.5)
    .background(
      RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
        .fill(isSelected ? Palette.selection : .clear)
    )
    .contentShape(Rectangle())
    .onTapGesture { model.noteSource = source }
    .hoverHighlight()
  }

  // MARK: - Folders

  @ViewBuilder
  private var folders: some View {
    if !model.index.folderTree().children.isEmpty {
      sectionLabel("sidebar.folders")

      ForEach(flattenedFolders, id: \.folder.path) { entry in
        folderRow(entry.folder, depth: entry.depth)
      }
    }
  }

  /// A folder and its depth, ready to be rendered as a flat list.
  private struct FolderEntry {
    let folder: FolderNode
    let depth: Int
  }

  /// The visible folders, in display order.
  private var flattenedFolders: [FolderEntry] {
    var entries: [FolderEntry] = []
    func visit(_ node: FolderNode, depth: Int) {
      for child in node.children {
        entries.append(FolderEntry(folder: child, depth: depth))
        if expanded.contains(child.path) {
          visit(child, depth: depth + 1)
        }
      }
    }
    visit(model.index.folderTree(), depth: 0)
    return entries
  }

  private func folderRow(_ folder: FolderNode, depth: Int) -> some View {
    let isExpanded = expanded.contains(folder.path)
    let isSelected = model.noteSource == .folder(folder.path)

    return HStack(spacing: 5) {
      Button {
        toggle(folder.path)
      } label: {
        Image(systemName: "chevron.right")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(Palette.textTertiary)
          .rotationEffect(.degrees(isExpanded ? 90 : 0))
          .frame(width: 10, height: 10)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .opacity(folder.children.isEmpty ? 0 : 1)

      Image(systemName: isExpanded ? "folder.fill" : "folder")
        .font(.system(size: 11.5))
        .foregroundStyle(isSelected ? Palette.accent : Palette.textSecondary)
        .frame(width: 15)

      Text(folder.name)
        .font(Type.body)
        .foregroundStyle(Palette.text)
        .lineLimit(1)

      Spacer(minLength: 4)

      Text("\(count(of: folder))")
        .font(Type.rowSubtitle)
        .monospacedDigit()
        .foregroundStyle(Palette.textTertiary)
    }
    .padding(.leading, CGFloat(depth) * 12 + 2)
    .padding(.trailing, 7)
    .padding(.vertical, 3)
    .background(
      RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
        .fill(isSelected ? Palette.selection : .clear)
    )
    .contentShape(Rectangle())
    .onTapGesture { model.noteSource = .folder(folder.path) }
    .hoverHighlight()
  }

  private func toggle(_ path: String) {
    withAnimation(.smooth(duration: 0.16)) {
      if expanded.contains(path) {
        expanded.remove(path)
      } else {
        expanded.insert(path)
      }
    }
  }

  /// The number of notes in a folder and its subfolders.
  private func count(of folder: FolderNode) -> Int {
    var total = folder.notes.count
    for child in folder.children {
      total += count(of: child)
    }
    return total
  }

  // MARK: - Tags

  @ViewBuilder
  private var tags: some View {
    if !model.tags.isEmpty {
      sectionLabel("sidebar.tags")

      ForEach(model.tags.prefix(24), id: \.tag) { entry in
        tagRow(entry.tag, count: entry.count)
      }
    }
  }

  private func tagRow(_ tag: String, count: Int) -> some View {
    let isSelected = model.noteSource == .tag(tag)

    return HStack(spacing: 8) {
      Image(systemName: "number")
        .font(.system(size: 9.5, weight: .semibold))
        .foregroundStyle(isSelected ? Palette.accent : Palette.textTertiary)
        .frame(width: 18)
      Text(tag)
        .font(Type.body)
        .foregroundStyle(Palette.text)
        .lineLimit(1)
      Spacer(minLength: 4)
      Text("\(count)")
        .font(Type.rowSubtitle)
        .monospacedDigit()
        .foregroundStyle(Palette.textTertiary)
    }
    .padding(.horizontal, 7)
    .padding(.vertical, 3.5)
    .background(
      RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
        .fill(isSelected ? Palette.selection : .clear)
    )
    .contentShape(Rectangle())
    .onTapGesture { model.noteSource = .tag(tag) }
    .hoverHighlight()
  }

  // MARK: - Chrome

  private func sectionLabel(_ title: LocalizedStringKey) -> some View {
    Text(title)
      .font(Type.section)
      .foregroundStyle(Palette.textTertiary)
      .padding(.horizontal, 7)
      .padding(.top, 14)
      .padding(.bottom, 3)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var footer: some View {
    VStack(spacing: 0) {
      Divider().overlay(Palette.separator)
      HStack(spacing: 6) {
        Image(systemName: "tray.full.fill")
          .font(.system(size: 9))
          .foregroundStyle(Palette.textTertiary)
        Text(model.vaultURL?.lastPathComponent ?? "—")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textSecondary)
          .lineLimit(1)
          .truncationMode(.head)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 6)
    }
  }
}
