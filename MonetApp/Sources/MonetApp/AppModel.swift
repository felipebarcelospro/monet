import Foundation
import MonetCore
import Observation
import SwiftUI

/// The main view shown in the content column.
enum Workspace: String, CaseIterable, Sendable {
  case editor
  case graph

  var localizedName: LocalizedStringKey {
    switch self {
    case .editor: "workspace.editor"
    case .graph: "workspace.graph"
    }
  }

  var symbol: String {
    switch self {
    case .editor: "doc.text"
    case .graph: "point.3.filled.connected.trianglepath.dotted"
    }
  }
}

/// Persisted per-user application state.
///
/// The state lives in Application Support and never inside the vault, so the
/// Swift app and the TypeScript CLI can never disagree about the content of
/// a vault. The only shared state is the Markdown files themselves.
@MainActor
@Observable
final class AppPreferences {
  /// The note ids the user marked as favourites.
  var favorites: Set<String> = []
  /// The most recently opened note ids, newest first.
  var history: [String] = []
  /// The most recent vaults, newest first.
  var recentVaults: [URL] = []

  private static var storageURL: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    return base.appending(path: "Monet/preferences.json")
  }

  /// Loads the preferences from disk.
  func load() {
    guard let data = try? Data(contentsOf: Self.storageURL) else { return }
    guard let decoded = try? JSONDecoder().decode(Stored.self, from: data) else { return }
    favorites = Set(decoded.favorites)
    history = decoded.history
    recentVaults = decoded.recentVaults.map { URL(fileURLWithPath: $0) }
  }

  /// Writes the preferences to disk.
  func save() {
    let stored = Stored(
      favorites: Array(favorites).sorted(),
      history: Array(history.prefix(50)),
      recentVaults: recentVaults.map(\.path)
    )
    guard let data = try? JSONEncoder().encode(stored) else { return }
    let url = Self.storageURL
    try? FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try? data.write(to: url, options: .atomic)
  }

  private struct Stored: Codable {
    var favorites: [String]
    var history: [String]
    var recentVaults: [String]
  }
}

/// What the note list is showing.
enum NoteSource: Hashable, Sendable {
  /// Every note in the vault.
  case all
  /// The notes the user starred.
  case favorites
  /// The notes the user opened most recently.
  case recents
  /// The notes inside a folder.
  case folder(String)
  /// The notes that carry a tag.
  case tag(String)
}

/// A group of notes in the note list.
struct NoteSection: Identifiable {
  /// The title of the group.
  var title: String
  /// The notes of the group.
  var notes: [Note]

  var id: String { title }
}

/// The application state: the open vault, the index, the selection and the
/// editor buffer.
@MainActor
@Observable
final class AppModel {
  /// The open vault, if any.
  private(set) var vaultURL: URL?
  /// The index of the open vault.
  private(set) var index = VaultIndex(notes: [])
  /// What the note list is showing.
  var noteSource: NoteSource = .all
  /// The note the editor is showing.
  var selectedNoteID: String?
  /// The text in the editor. Bound to the editor view.
  var editorText: String = ""
  /// Whether the editor buffer differs from the note on disk.
  private(set) var isDirty = false
  /// The current search query.
  var searchQuery: String = ""
  /// The results of the current search.
  private(set) var searchResults: [SearchResult] = []
  /// The tag used to filter the vault, if any.
  var tagFilter: String?
  /// Which workspace is visible.
  var workspace: Workspace = .editor
  /// Whether the sources sidebar is visible.
  var showsSidebar = true
  /// Whether the inspector panel is visible.
  var showsInspector = true
  /// Whether the command palette is open.
  var showsCommandPalette = false
  /// Whether the folder picker is open.
  var showsVaultPicker = false
  /// Whether the focus mode hides the chrome.
  var focusMode = false
  /// The node selected in the graph.
  var selectedGraphNodeID: String?
  /// The node the pointer is over in the graph.
  var hoveredGraphNodeID: String?
  /// The graph layout.
  private(set) var graphLayout = GraphLayoutResult(nodes: [], edges: [], iterations: 0, energy: 0)
  /// Whether the vault is being loaded.
  private(set) var isLoading = false
  /// The last error that occurred, if any.
  var lastError: String?
  /// Per-user preferences.
  let preferences = AppPreferences()

  private var loader: VaultLoader?
  private var watcher: VaultWatcher?
  private var searchTask: Task<Void, Never>?
  private var autosaveTask: Task<Void, Never>?

  /// The note the editor is showing, if any.
  var selectedNote: Note? {
    guard let selectedNoteID else { return nil }
    return index.note(id: selectedNoteID)
  }

  /// The notes that link to the selected note.
  var selectedBacklinks: [Note] {
    guard let selectedNoteID else { return [] }
    return index.backlinks(of: selectedNoteID)
  }

  /// The notes the selected note links to.
  var selectedOutgoing: [Note] {
    guard let selectedNoteID else { return [] }
    return index.outgoingLinks(of: selectedNoteID)
  }

  /// The tags in the vault, most used first.
  var tags: [(tag: String, count: Int)] {
    index.sortedTags
  }

  /// The number of words in the editor buffer.
  var wordCount: Int {
    editorText
      .split { $0.isWhitespace || $0.isNewline }
      .filter { !$0.isEmpty }
      .count
  }

  /// The number of characters in the editor buffer.
  var characterCount: Int {
    editorText.count
  }

  /// An estimate of how long the note takes to read, in minutes.
  var readingMinutes: Int {
    max(1, wordCount / 220)
  }

  /// The notes the note list shows, filtered by the source and the query.
  var listedNotes: [Note] {
    var notes: [Note]

    switch noteSource {
    case .all:
      notes = index.notes
    case .favorites:
      notes = index.notes.filter { preferences.favorites.contains($0.id) }
    case .recents:
      notes = preferences.history.compactMap { index.note(id: $0) }
    case .folder(let folder):
      notes = index.notes.filter { note in
        note.relativePath.hasPrefix(folder + "/")
      }
    case .tag(let tag):
      notes = index.notes(tagged: tag)
    }

    let query = searchQuery.trimmingCharacters(in: .whitespaces)
    if !query.isEmpty {
      let matches = Set(searchResults.map(\.noteID))
      notes = notes.filter { matches.contains($0.id) }
      // Keep the ranking of the search when there is one.
      let order = Dictionary(uniqueKeysWithValues: searchResults.map { ($0.noteID, $0.score) })
      notes.sort { (order[$0.id] ?? 0) > (order[$1.id] ?? 0) }
      return notes
    }

    notes.sort { $0.modifiedAt > $1.modifiedAt }
    return notes
  }

  /// The note list, grouped the way a notes application groups by age.
  var listedSections: [NoteSection] {
    let notes = listedNotes
    switch noteSource {
    case .all where searchQuery.trimmingCharacters(in: .whitespaces).isEmpty:
      return Self.groupByAge(notes)
    default:
      return notes.isEmpty ? [] : [NoteSection(title: "", notes: notes)]
    }
  }

  /// Groups notes into the age buckets of the note list.
  static func groupByAge(_ notes: [Note]) -> [NoteSection] {
    let calendar = Calendar.current
    let now = Date()

    var today: [Note] = []
    var yesterday: [Note] = []
    var lastWeek: [Note] = []
    var lastMonth: [Note] = []
    var earlier: [Note] = []

    for note in notes {
      let date = note.modifiedAt
      if calendar.isDateInToday(date) {
        today.append(note)
      } else if calendar.isDateInYesterday(date) {
        yesterday.append(note)
      } else if let days = calendar.dateComponents([.day], from: date, to: now).day, days <= 7 {
        lastWeek.append(note)
      } else if let days = calendar.dateComponents([.day], from: date, to: now).day, days <= 30 {
        lastMonth.append(note)
      } else {
        earlier.append(note)
      }
    }

    var sections: [NoteSection] = []
    if !today.isEmpty { sections.append(NoteSection(title: "Today", notes: today)) }
    if !yesterday.isEmpty { sections.append(NoteSection(title: "Yesterday", notes: yesterday)) }
    if !lastWeek.isEmpty { sections.append(NoteSection(title: "Previous 7 Days", notes: lastWeek)) }
    if !lastMonth.isEmpty { sections.append(NoteSection(title: "Previous 30 Days", notes: lastMonth)) }
    if !earlier.isEmpty { sections.append(NoteSection(title: "Earlier", notes: earlier)) }
    return sections
  }

  /// The title of the note list for the current source.
  var noteListTitle: String {
    switch noteSource {
    case .all: "All Notes"
    case .favorites: "Favorites"
    case .recents: "Recents"
    case .folder(let folder): folder.split(separator: "/").last.map(String.init) ?? folder
    case .tag(let tag): "#\(tag)"
    }
  }

  /// The notes that match a query, for the command palette.
  func search(_ query: String, limit: Int = 40) -> [Note] {
    guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
      return Array(index.notes.prefix(limit))
    }
    let engine = SearchEngine(index: index)
    return engine.search(query, limit: limit).compactMap { index.note(id: $0.noteID) }
  }

  /// Opens a vault folder and loads its index.
  func openVault(_ url: URL) async {
    isLoading = true
    defer { isLoading = false }

    do {
      let loader = try VaultLoader(path: url.path)
      self.loader = loader
      self.vaultURL = loader.root
      self.index = try await loader.loadIndex()

      // Publish the open vault so the CLI can warn about concurrent edits.
      _ = try? VaultLockWriter.write(vault: loader.root.path)

      preferences.recentVaults.removeAll { $0 == loader.root }
      preferences.recentVaults.insert(loader.root, at: 0)
      preferences.recentVaults = Array(preferences.recentVaults.prefix(10))
      preferences.save()

      startWatching()
      recomputeGraph()
      lastError = nil
    } catch {
      lastError = String(describing: error)
    }
  }

  /// Re-reads the vault from disk.
  func reload() async {
    guard let loader else { return }
    do {
      index = try await loader.loadIndex()
      if let selectedNoteID, index.note(id: selectedNoteID) == nil {
        self.selectedNoteID = nil
        editorText = ""
        isDirty = false
      }
      recomputeGraph()
    } catch {
      lastError = String(describing: error)
    }
  }

  /// Selects a note, loads it into the editor and opens a tab for it.
  func select(noteID: String?) {
    guard let noteID else {
      selectedNoteID = nil
      editorText = ""
      isDirty = false
      return
    }
    if selectedNoteID == noteID, isDirty { return }

    selectedNoteID = noteID
    editorText = index.note(id: noteID)?.body ?? ""
    isDirty = false

    preferences.history.removeAll { $0 == noteID }
    preferences.history.insert(noteID, at: 0)
    preferences.history = Array(preferences.history.prefix(50))
    preferences.save()
  }

  /// Marks the editor buffer as changed and schedules an autosave.
  ///
  /// Notes are saved to disk automatically, the way the system notes app
  /// does. The delay keeps a burst of keystrokes from writing the file over
  /// and over.
  func editorTextDidChange() {
    isDirty = true
    autosaveTask?.cancel()
    autosaveTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(700))
      guard !Task.isCancelled else { return }
      await self?.saveCurrentNote()
    }
  }

  /// Saves the editor buffer back to the note on disk.
  func saveCurrentNote() async {
    guard let loader, let note = selectedNote else { return }
    var updated = note
    updated.body = editorText
    updated.links = WikilinkParser.parseLinks(in: editorText)
    updated.headings = WikilinkParser.parseHeadings(in: editorText)
    updated.modifiedAt = Date()
    do {
      try loader.write(note: updated)
      index = index.updating(note: updated)
      isDirty = false
    } catch {
      lastError = String(describing: error)
    }
  }

  /// Creates a new note and selects it.
  func createNote(title: String, folder: String = "") async -> Note? {
    guard let loader else { return nil }
    let safeTitle = title.trimmingCharacters(in: .whitespaces).isEmpty ? "Untitled" : title
    let relativePath = folder.isEmpty ? "\(safeTitle).md" : "\(folder)/\(safeTitle).md"
    let note = Note(
      id: (relativePath as NSString).deletingPathExtension,
      relativePath: relativePath,
      title: safeTitle,
      body: "# \(safeTitle)\n\n"
    )
    do {
      try loader.write(note: note)
      index = try await loader.loadIndex()
      select(noteID: note.id)
      recomputeGraph()
      return note
    } catch {
      lastError = String(describing: error)
      return nil
    }
  }

  /// Toggles the favourite state of a note.
  func toggleFavorite(noteID: String) {
    if preferences.favorites.contains(noteID) {
      preferences.favorites.remove(noteID)
    } else {
      preferences.favorites.insert(noteID)
    }
    preferences.save()
  }

  /// Runs the search, updating `searchResults`.
  func runSearch() {
    let query = searchQuery
    searchTask?.cancel()
    searchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(120))
      guard !Task.isCancelled else { return }
      await MainActor.run {
        guard let self else { return }
        let engine = SearchEngine(index: self.index)
        self.searchResults = engine.search(query, limit: 100, tagFilter: self.tagFilter)
      }
    }
  }

  /// Recomputes the graph layout for the current index.
  func recomputeGraph() {
    let graph = index.graph
    let layoutEngine = GraphLayout()
    var tagLayers: [String: Double] = [:]
    for (offset, tag) in index.sortedTags.enumerated() where offset < 6 {
      tagLayers[tag.tag.lowercased()] = Double(offset - 3) * 22
    }
    let existing = Dictionary(
      uniqueKeysWithValues: graphLayout.nodes.map { ($0.id, $0.position) }
    )
    graphLayout = layoutEngine.layout(graph: graph, tagLayers: tagLayers, existing: existing)
  }

  /// The neighbours of the selected graph node.
  var graphNeighbours: Set<String> {
    guard let selected = selectedGraphNodeID else { return [] }
    var result: Set<String> = []
    for edge in graphLayout.edges {
      if edge.source == selected { result.insert(edge.target) }
      if edge.target == selected { result.insert(edge.source) }
    }
    return result
  }

  /// The nodes that are visible with the current filters applied.
  var visibleGraphNodes: [LayoutNode] {
    guard let tagFilter else { return graphLayout.nodes }
    let allowed = Set(index.notes(tagged: tagFilter).map(\.id))
    return graphLayout.nodes.filter { allowed.contains($0.id) }
  }

  /// Removes the lock file, so the CLI stops warning about this instance.
  func releaseVault() {
    guard let vaultURL else { return }
    VaultLockWriter.remove(vault: vaultURL.path)
  }

  private func startWatching() {
    watcher?.stop()
    guard let root = vaultURL else { return }
    let watcher = VaultWatcher(root: root) { [weak self] _ in
      Task { @MainActor in
        await self?.reload()
      }
    }
    watcher.start()
    self.watcher = watcher
  }
}
