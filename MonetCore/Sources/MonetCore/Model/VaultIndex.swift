import Foundation

/// The searchable, linkable index of a vault.
///
/// An index is an immutable value: rebuilding it after a file system change
/// produces a new value, which keeps concurrency simple and makes the whole
/// index trivially testable.
public struct VaultIndex: Sendable {
  /// Every note in the vault, ordered by path.
  public var notes: [Note]
  /// Notes keyed by their vault-relative path.
  public var notesByPath: [String: Note]
  /// Resolves wikilink targets to note ids.
  public var resolver: LinkResolver
  /// Backlinks: target note id -> the ids of notes that link to it.
  public var backlinks: [String: [String]]
  /// Outgoing links: source note id -> the ids of the notes it links to.
  public var outgoing: [String: [String]]
  /// Every tag in the vault mapped to the notes that declare it.
  public var tags: [String: [String]]
  /// Wikilinks that could not be resolved to a note.
  public var unresolved: [String: [String]]

  /// Creates an index from a list of notes.
  public init(notes: [Note]) {
    let sorted = notes.sorted { $0.relativePath.localizedStandardCompare($1.relativePath) == .orderedAscending }
    var notesByPath: [String: Note] = [:]
    for note in sorted {
      notesByPath[note.relativePath] = note
    }

    let resolver = LinkResolver(
      notes: sorted.map {
        LinkResolver.Candidate(
          id: $0.id,
          relativePath: $0.relativePath,
          title: $0.title,
          aliases: $0.aliases,
          folder: $0.folder
        )
      }
    )

    var backlinks: [String: [String]] = [:]
    var outgoing: [String: [String]] = [:]
    var tags: [String: [String]] = [:]
    var unresolved: [String: [String]] = [:]

    for note in sorted {
      for tag in note.tags {
        let key = tag.lowercased()
        tags[key, default: []].append(note.id)
      }

      var targets: [String] = []
      for link in note.links where !link.target.isEmpty {
        guard let resolved = resolver.resolve(link: link, source: note) else {
          unresolved[link.target, default: []].append(note.id)
          continue
        }
        guard resolved != note.id, !targets.contains(resolved) else { continue }
        targets.append(resolved)
        backlinks[resolved, default: []].append(note.id)
      }
      outgoing[note.id] = targets
    }

    self.notes = sorted
    self.notesByPath = notesByPath
    self.resolver = resolver
    self.backlinks = backlinks
    self.outgoing = outgoing
    self.tags = tags
    self.unresolved = unresolved
  }

  /// Returns a new index with one note replaced, without touching the disk.
  ///
  /// Saving a note used to re-read the whole vault. On a large vault that is
  /// both slow and unnecessary: only the saved note changed.
  public func updating(note updated: Note) -> VaultIndex {
    var copy = notes
    if let position = copy.firstIndex(where: { $0.id == updated.id }) {
      copy[position] = updated
    } else {
      copy.append(updated)
    }
    return VaultIndex(notes: copy)
  }

  /// The note with the given id, if it exists.
  public func note(id: String) -> Note? {
    notes.first { $0.id == id }
  }

  /// The note stored at a vault-relative path, if it exists.
  public func note(path: String) -> Note? {
    notesByPath[path]
  }

  /// The notes that link to the given note.
  public func backlinks(of id: String) -> [Note] {
    (backlinks[id] ?? []).compactMap { note(id: $0) }
  }

  /// The notes the given note links to.
  public func outgoingLinks(of id: String) -> [Note] {
    (outgoing[id] ?? []).compactMap { note(id: $0) }
  }

  /// The notes that declare the given tag.
  public func notes(tagged tag: String) -> [Note] {
    (tags[tag.lowercased()] ?? []).compactMap { note(id: $0) }
  }

  /// All tags in the vault, sorted by how many notes use them.
  public var sortedTags: [(tag: String, count: Int)] {
    tags.map { (tag: $0.key, count: $0.value.count) }
      .sorted { lhs, rhs in
        if lhs.count != rhs.count { return lhs.count > rhs.count }
        return lhs.tag < rhs.tag
      }
  }

  /// Builds the link graph of the vault.
  public var graph: VaultGraph {
    let nodes = notes.map { note in
      GraphNode(
        id: note.id,
        title: note.title,
        tags: note.tags,
        linkCount: outgoing[note.id]?.count ?? 0,
        backlinkCount: backlinks[note.id]?.count ?? 0
      )
    }
    var edges: [GraphEdge] = []
    for (source, targets) in outgoing {
      for target in targets {
        edges.append(GraphEdge(source: source, target: target))
      }
    }
    return VaultGraph(nodes: nodes, edges: edges)
  }

  /// The folder structure of the vault, expressed as a tree.
  public func folderTree() -> FolderNode {
    var root = FolderNode(name: "", path: "")
    for note in notes {
      root.insert(note: note)
    }
    return root
  }
}

/// A folder in the vault tree.
public struct FolderNode: Sendable, Hashable, Identifiable {
  /// The display name of the folder (empty for the vault root).
  public var name: String
  /// The vault-relative path of the folder.
  public var path: String
  /// Child folders, sorted by name.
  public var children: [FolderNode]
  /// Notes directly inside this folder, sorted by title.
  public var notes: [Note]

  public var id: String { path.isEmpty ? "/" : path }

  public init(name: String, path: String, children: [FolderNode] = [], notes: [Note] = []) {
    self.name = name
    self.path = path
    self.children = children
    self.notes = notes
  }

  /// Inserts a note, creating intermediate folders as needed.
  mutating func insert(note: Note) {
    let components = note.relativePath.split(separator: "/").map(String.init)
    insert(note: note, components: components, depth: 0)
  }

  /// Inserts a note, consuming one folder level per call.
  ///
  /// The recursion has to advance one component of the path on every level,
  /// otherwise a note inside a nested folder would be inserted into a child
  /// with the same name forever.
  private mutating func insert(note: Note, components: [String], depth: Int) {
    // The last component is the file name: the note belongs to this folder.
    guard depth < components.count - 1 else {
      notes.append(note)
      notes.sort { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
      return
    }

    let folderName = components[depth]
    let folderPath = components[0...depth].joined(separator: "/")

    if let index = children.firstIndex(where: { $0.name == folderName }) {
      var child = children[index]
      child.insert(note: note, components: components, depth: depth + 1)
      children[index] = child
    } else {
      var child = FolderNode(name: folderName, path: folderPath)
      child.insert(note: note, components: components, depth: depth + 1)
      children.append(child)
      children.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
  }
}
