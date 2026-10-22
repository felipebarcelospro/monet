import MonetCore
import SwiftUI

/// The inspector on the trailing edge: links, outline and properties.
struct InspectorView: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        if let note = model.selectedNote {
          linkSection(
            title: "inspector.backlinks",
            notes: model.selectedBacklinks,
            empty: "inspector.noBacklinks",
            symbol: "arrowshape.turn.up.left"
          )

          linkSection(
            title: "inspector.outgoing",
            notes: model.selectedOutgoing,
            empty: "inspector.noOutgoing",
            symbol: "arrowshape.turn.up.right"
          )

          outlineSection(note: note)
          propertiesSection(note: note)
        } else {
          Text("inspector.noSelection")
            .font(Type.rowSubtitle)
            .foregroundStyle(Palette.textTertiary)
            .padding(.top, 24)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 18)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .surface(.regularMaterial, flat: Palette.list)
  }

  // MARK: - Sections

  private func linkSection(
    title: LocalizedStringKey,
    notes: [Note],
    empty: LocalizedStringKey,
    symbol: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      SectionTitle(title: title, count: notes.count)

      if notes.isEmpty {
        Text(empty)
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
      } else {
        VStack(spacing: 1) {
          ForEach(notes) { note in
            Button {
              model.select(noteID: note.id)
            } label: {
              HStack(spacing: 7) {
                Image(systemName: symbol)
                  .font(.system(size: 9))
                  .foregroundStyle(Palette.textTertiary)
                  .frame(width: 12)
                Text(note.title)
                  .font(Type.rowSubtitle)
                  .foregroundStyle(Palette.textSecondary)
                  .lineLimit(1)
                Spacer(minLength: 0)
              }
              .padding(.horizontal, 6)
              .padding(.vertical, 3.5)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .hoverHighlight()
          }
        }
      }
    }
  }

  private func outlineSection(note: Note) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      SectionTitle(title: "inspector.outline", count: note.headings.count)

      if note.headings.isEmpty {
        Text("inspector.noOutline")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
      } else {
        VStack(alignment: .leading, spacing: 2) {
          ForEach(Array(note.headings.enumerated()), id: \.offset) { _, heading in
            Text(heading.title)
              .font(.system(size: 11.5, weight: heading.level == 1 ? .medium : .regular))
              .foregroundStyle(heading.level == 1 ? Palette.text : Palette.textSecondary)
              .lineLimit(1)
              .padding(.leading, CGFloat(max(0, heading.level - 1)) * 9)
          }
        }
      }
    }
  }

  private func propertiesSection(note: Note) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      SectionTitle(title: "inspector.properties")

      VStack(spacing: 0) {
        PropertyRow(label: "inspector.path", value: note.relativePath)
        if !note.aliases.isEmpty {
          PropertyRow(label: "inspector.aliases", value: note.aliases.joined(separator: ", "))
        }
        if !note.tags.isEmpty {
          PropertyRow(
            label: "inspector.tags",
            value: note.tags.map { "#\($0)" }.joined(separator: " ")
          )
        }
        PropertyRow(
          label: "inspector.size",
          value: ByteCountFormatter.string(fromByteCount: Int64(note.byteSize), countStyle: .file)
        )
        if !note.frontmatter.isEmpty {
          PropertyRow(
            label: "inspector.frontmatter",
            value: note.frontmatter.keys.sorted().joined(separator: ", ")
          )
        }
      }
    }
  }
}

/// A quiet section title.
struct SectionTitle: View {
  /// The title of the section.
  let title: LocalizedStringKey
  /// An optional count.
  var count: Int?

  var body: some View {
    HStack(spacing: 6) {
      Text(title)
        .font(Type.section)
        .foregroundStyle(Palette.textSecondary)
      if let count {
        Text("\(count)")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
      }
      Spacer(minLength: 0)
    }
  }
}

/// A label and a value.
struct PropertyRow: View {
  let label: LocalizedStringKey
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(label)
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textTertiary)
        .frame(width: 68, alignment: .leading)
      Text(value)
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textSecondary)
        .textSelection(.enabled)
        .lineLimit(2)
        .truncationMode(.middle)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 2.5)
  }
}
