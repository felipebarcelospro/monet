import MonetCore
import SwiftUI

// MARK: - Rows

/// A row in the sources sidebar.
struct SourceRow: View {
  /// The symbol of the row.
  let symbol: String
  /// The title of the row.
  let title: LocalizedStringKey
  /// The optional count at the trailing edge.
  var count: Int?
  /// Whether the row is selected.
  var isSelected = false
  /// The tint of the symbol.
  var symbolTint: Color = Palette.textSecondary

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: symbol)
        .font(.system(size: 13, weight: .regular))
        .foregroundStyle(isSelected ? Palette.accent : symbolTint)
        .frame(width: 18, alignment: .center)

      Text(title)
        .font(Type.body)
        .foregroundStyle(Palette.text)
        .lineLimit(1)

      Spacer(minLength: 4)

      if let count {
        Text("\(count)")
          .font(Type.rowSubtitle)
          .monospacedDigit()
          .foregroundStyle(Palette.textTertiary)
      }
    }
    .padding(.horizontal, 7)
    .padding(.vertical, 4.5)
    .background(
      RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
        .fill(isSelected ? Palette.selection : .clear)
    )
    .contentShape(Rectangle())
  }
}

/// A note in the note list.
struct NoteListRow: View {
  /// The note to show.
  let note: Note
  /// Whether the note is the current selection.
  let isSelected: Bool
  /// Whether the note is a favourite.
  let isFavorite: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 5) {
        Text(note.title)
          .font(Type.rowTitle)
          .foregroundStyle(Palette.text)
          .lineLimit(1)
          .truncationMode(.tail)

        if isFavorite {
          Image(systemName: "star.fill")
            .font(.system(size: 8))
            .foregroundStyle(Palette.favorite)
        }

        Spacer(minLength: 0)
      }

      HStack(spacing: 5) {
        Text(NoteListRow.relativeDate(note.modifiedAt))
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary)
          .lineLimit(1)

        Text("·")
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textTertiary.opacity(0.6))

        Text(snippet)
          .font(Type.rowSubtitle)
          .foregroundStyle(Palette.textSecondary)
          .lineLimit(1)
          .truncationMode(.tail)
      }
    }
    .padding(.horizontal, 9)
    .padding(.vertical, 7)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
        .fill(isSelected ? Palette.selection : .clear)
    )
    .contentShape(Rectangle())
  }

  /// The first meaningful line of the note, skipping its own title.
  private var snippet: String {
    for line in note.body.split(separator: "\n") {
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if trimmed.isEmpty { continue }

      if trimmed.hasPrefix("#") {
        let heading = trimmed.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
        if heading.caseInsensitiveCompare(note.title) == .orderedSame { continue }
        return heading
      }
      return trimmed
    }
    return ""
  }

  /// A short, relative description of a date.
  static func relativeDate(_ date: Date) -> String {
    guard date != .distantPast else { return "" }
    let calendar = Calendar.current
    if calendar.isDateInToday(date) {
      return date.formatted(date: .omitted, time: .shortened)
    }
    if calendar.isDateInYesterday(date) {
      return "Yesterday"
    }
    return date.formatted(.dateTime.month(.abbreviated).day())
  }
}

// MARK: - Chrome

/// The header of a list section.
struct ListSectionHeader: View {
  /// The title of the section.
  let title: String

  var body: some View {
    Text(title)
      .font(Type.section)
      .foregroundStyle(Palette.textSecondary)
      .padding(.horizontal, 9)
      .padding(.top, 14)
      .padding(.bottom, 4)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The header of the note list column.
struct ListHeader: View {
  /// The title of the list.
  let title: String
  /// The number of notes in the list.
  let count: Int

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(title)
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(Palette.text)
      Text("\(count) notes")
        .font(Type.rowSubtitle)
        .foregroundStyle(Palette.textTertiary)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 14)
    .padding(.top, 12)
    .padding(.bottom, 8)
  }
}

/// A small, quiet chip used for tags.
struct TagChip: View {
  /// The name of the tag, without the leading `#`.
  let tag: String
  /// Whether the chip is active.
  var isActive = false

  var body: some View {
    Text("#\(tag)")
      .font(Type.rowSubtitle)
      .foregroundStyle(isActive ? Palette.accent : Palette.textSecondary)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(
        RoundedRectangle(cornerRadius: 4, style: .continuous)
          .fill(isActive ? Palette.accent.opacity(0.12) : Palette.textTertiary.opacity(0.10))
      )
  }
}

// MARK: - Behaviour

/// A subtle highlight while the pointer is over the view.
private struct HoverEffect: ViewModifier {
  /// Whether the pointer is over the view.
  @State private var isHovering = false

  func body(content: Content) -> some View {
    content
      .background(
        RoundedRectangle(cornerRadius: Metrics.selectionRadius, style: .continuous)
          .fill(Palette.textTertiary.opacity(isHovering ? 0.08 : 0))
      )
      .onHover { isHovering = $0 }
      .animation(.easeOut(duration: 0.1), value: isHovering)
  }
}

extension View {
  /// Highlights the view while the pointer is over it.
  func hoverHighlight() -> some View {
    modifier(HoverEffect())
  }
}

/// A toolbar button with a symbol and a tooltip.
struct ToolButton: View {
  /// The symbol of the button.
  let symbol: String
  /// The tooltip of the button.
  let help: LocalizedStringKey
  /// The action of the button.
  let action: () -> Void
  /// Whether the button is active.
  var isActive = false
  /// Whether the button is enabled.
  var isEnabled = true

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 13, weight: .medium))
        .frame(width: 24, height: 22)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(isActive ? Palette.accent : Palette.textSecondary)
    .disabled(!isEnabled)
    .opacity(isEnabled ? 1 : 0.35)
    .help(help)
  }
}
