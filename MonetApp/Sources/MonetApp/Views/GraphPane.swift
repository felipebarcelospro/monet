import MonetCore
import SwiftUI

/// The graph workspace: a full-bleed 3D canvas with a floating HUD.
///
/// The HUD is the one place in the app where Liquid Glass is applied by hand,
/// and it follows the guidelines exactly: the controls float above rich
/// content, they are grouped in a single `GlassEffectContainer` so their
/// shapes blend instead of stacking, and they use the `.regular` variant with
/// `.interactive()` on the buttons. Everything else in the window — the
/// sidebar, the toolbar, the note list, the editor — is either system glass
/// or a standard surface.
struct GraphPane: View {
  /// The shared application state.
  @Environment(AppModel.self) private var model
  /// The namespace that lets the glass shapes morph into one another.
  @Namespace private var glassNamespace
  /// Whether the legend is expanded.
  @State private var showsLegend = false

  var body: some View {
    ZStack(alignment: .topLeading) {
      GraphSceneView(
        layout: model.graphLayout,
        visibleIDs: visibleIDs,
        selectedID: model.selectedGraphNodeID,
        neighbourIDs: model.graphNeighbours,
        hoveredID: model.hoveredGraphNodeID,
        onPick: { id in
          withAnimation(.smooth(duration: 0.18)) {
            model.selectedGraphNodeID = id
          }
          if let id { model.select(noteID: id) }
        },
        onHover: { id in
          model.hoveredGraphNodeID = id
        }
      )
      .ignoresSafeArea()

      hud
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

      if let id = model.selectedGraphNodeID, let note = model.index.note(id: id) {
        details(for: note)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
          .padding(16)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.smooth(duration: 0.22), value: model.selectedGraphNodeID)
  }

  // MARK: - Heads-up display

  private var hud: some View {
    GlassEffectContainer(spacing: 10) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 10) {
          stats
            .glassEffect(.regular, in: Capsule())
            .glassEffectID("stats", in: glassNamespace)

          Button {
            withAnimation(.smooth(duration: 0.2)) {
              model.tagFilter = nil
              model.recomputeGraph()
            }
          } label: {
            Image(systemName: "arrow.triangle.2.circlepath")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(.white.opacity(0.85))
              .frame(width: 32, height: 32)
          }
          .buttonStyle(.plain)
          .glassEffect(.regular.interactive(), in: Circle())
          .glassEffectID("relayout", in: glassNamespace)
          .help(Text("graph.recompute"))

          Button {
            withAnimation(.smooth(duration: 0.2)) {
              showsLegend.toggle()
            }
          } label: {
            Image(systemName: showsLegend ? "circle.grid.2x2.fill" : "circle.grid.2x2")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(.white.opacity(0.85))
              .frame(width: 32, height: 32)
          }
          .buttonStyle(.plain)
          .glassEffect(.regular.interactive(), in: Circle())
          .glassEffectID("legend", in: glassNamespace)
          .help(Text("graph.legend"))
        }

        if showsLegend {
          legend
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .glassEffectID("legend-panel", in: glassNamespace)
            .glassEffectTransition(.materialize)
        }

        tagFilter
          .glassEffect(.regular, in: Capsule())
          .glassEffectID("filter", in: glassNamespace)
      }
    }
  }

  private var stats: some View {
    HStack(spacing: 10) {
      stat(value: model.graphLayout.nodes.count, label: "graph.notes")
      Rectangle()
        .fill(.white.opacity(0.18))
        .frame(width: 0.5, height: 16)
      stat(value: model.graphLayout.edges.count, label: "graph.links")
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 7)
  }

  private func stat(value: Int, label: LocalizedStringKey) -> some View {
    HStack(spacing: 5) {
      Text("\(value)")
        .font(.system(size: 12, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(.white)
      Text(label)
        .font(.system(size: 10.5))
        .foregroundStyle(.white.opacity(0.55))
    }
  }

  private var legend: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("graph.legendTitle")
        .font(.system(size: 9.5, weight: .semibold))
        .textCase(.uppercase)
        .kerning(0.6)
        .foregroundStyle(.white.opacity(0.45))

      ForEach(Array(legendEntries.enumerated()), id: \.offset) { _, entry in
        HStack(spacing: 7) {
          Circle()
            .fill(entry.color)
            .frame(width: 6, height: 6)
          Text(entry.label)
            .font(.system(size: 11))
            .foregroundStyle(.white.opacity(0.8))
          Spacer(minLength: 0)
          Text("\(entry.count)")
            .font(.system(size: 10))
            .monospacedDigit()
            .foregroundStyle(.white.opacity(0.45))
        }
      }
    }
    .padding(12)
    .frame(width: 168, alignment: .leading)
  }

  /// The number of notes in each degree bucket.
  private var legendEntries: [(label: String, color: Color, count: Int)] {
    var buckets = [Int](repeating: 0, count: GraphPalette.all.count)
    for node in model.visibleGraphNodes {
      let index = GraphPalette.index(forDegree: node.degree)
      buckets[index] += 1
    }
    let labels = ["1", "2", "3", "4", "5", "6+"]
    return zip(labels, GraphPalette.all).enumerated().map { offset, pair in
      (
        label: pair.0,
        color: Color(nsColor: pair.1),
        count: buckets[offset]
      )
    }
  }

  private var tagFilter: some View {
    Menu {
      Button {
        withAnimation(.smooth(duration: 0.18)) {
          model.tagFilter = nil
          model.recomputeGraph()
        }
      } label: {
        if model.tagFilter == nil {
          Label("graph.allTags", systemImage: "checkmark")
        } else {
          Text("graph.allTags")
        }
      }

      Divider()

      ForEach(model.tags, id: \.tag) { entry in
        Button {
          withAnimation(.smooth(duration: 0.18)) {
            model.tagFilter = model.tagFilter == entry.tag ? nil : entry.tag
            model.recomputeGraph()
          }
        } label: {
          if model.tagFilter == entry.tag {
            Label("#\(entry.tag) (\(entry.count))", systemImage: "checkmark")
          } else {
            Text("#\(entry.tag) (\(entry.count))")
          }
        }
      }
    } label: {
      HStack(spacing: 5) {
        Image(systemName: "line.3.horizontal.decrease")
          .font(.system(size: 10, weight: .medium))
        Text(model.tagFilter.map { "#\($0)" } ?? String(localized: "graph.allTags"))
          .font(.system(size: 11, weight: .medium))
          .lineLimit(1)
      }
      .foregroundStyle(.white.opacity(0.85))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
    }
    .menuStyle(.borderlessButton)
    .menuIndicator(.hidden)
    .fixedSize()
  }

  // MARK: - Details

  private func details(for note: Note) -> some View {
    let neighbours = model.graphNeighbours
      .compactMap { model.index.note(id: $0) }
      .sorted { $0.title < $1.title }

    return VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(note.title)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Spacer(minLength: 0)
        Button {
          withAnimation(.smooth(duration: 0.18)) {
            model.selectedGraphNodeID = nil
          }
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(.white.opacity(0.45))
        }
        .buttonStyle(.plain)
      }

      HStack(spacing: 12) {
        DetailStat(value: model.selectedOutgoing.count, label: "graph.outgoing")
        DetailStat(value: model.selectedBacklinks.count, label: "graph.backlinks")
      }

      if !neighbours.isEmpty {
        Rectangle()
          .fill(.white.opacity(0.10))
          .frame(height: 0.5)

        VStack(alignment: .leading, spacing: 2) {
          ForEach(neighbours.prefix(6)) { neighbour in
            Button {
              withAnimation(.smooth(duration: 0.18)) {
                model.selectedGraphNodeID = neighbour.id
              }
              model.select(noteID: neighbour.id)
            } label: {
              HStack(spacing: 6) {
                Circle()
                  .fill(Color(nsColor: GraphPalette.neighbour))
                  .frame(width: 4, height: 4)
                Text(neighbour.title)
                  .font(.system(size: 11.5))
                  .foregroundStyle(.white.opacity(0.8))
                  .lineLimit(1)
                Spacer(minLength: 0)
              }
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
      }

      Button {
        model.select(noteID: note.id)
        withAnimation(.smooth(duration: 0.18)) {
          model.workspace = .editor
        }
      } label: {
        Text("graph.openNote")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(.white.opacity(0.9))
          .padding(.horizontal, 10)
          .padding(.vertical, 4)
          .background(Capsule().fill(.white.opacity(0.14)))
      }
      .buttonStyle(.plain)
    }
    .padding(12)
    .frame(width: 236, alignment: .leading)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  /// The ids of the notes that are visible in the graph.
  private var visibleIDs: Set<String>? {
    guard let tagFilter = model.tagFilter else { return nil }
    return Set(model.index.notes(tagged: tagFilter).map(\.id))
  }
}

/// A number with a caption.
struct DetailStat: View {
  let value: Int
  let label: LocalizedStringKey

  var body: some View {
    HStack(spacing: 4) {
      Text("\(value)")
        .font(.system(size: 12, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(.white)
      Text(label)
        .font(.system(size: 10))
        .foregroundStyle(.white.opacity(0.45))
    }
  }
}
