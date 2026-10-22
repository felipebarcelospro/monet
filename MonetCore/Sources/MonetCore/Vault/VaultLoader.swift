import Foundation

/// Errors thrown while loading a vault.
public enum VaultError: Error, Sendable, Equatable {
  /// The vault directory does not exist.
  case vaultNotFound(String)
  /// The path exists but is not a directory.
  case notADirectory(String)
  /// A note could not be read or written.
  case ioFailure(String)
}

/// Reads and writes notes on disk, and turns a folder of Markdown files into
/// a `VaultIndex`.
///
/// The on-disk format is the single source of truth shared with the Monet
/// TypeScript CLI: plain Markdown files with an optional YAML frontmatter
/// block, `[[wikilinks]]`, `![[embeds]]` and `#tags`.
public struct VaultLoader: Sendable {
  /// The absolute path of the vault root.
  public let root: URL

  /// File extensions treated as notes.
  public static let noteExtensions: Set<String> = ["md", "markdown"]

  /// Folder names that are never scanned.
  public static let ignoredFolders: Set<String> = [
    ".git", ".obsidian", ".trash", ".monet", "node_modules", ".DS_Store", ".idea", ".vscode",
  ]

  public init(root: URL) {
    self.root = root
  }

  /// Creates a loader for a vault path, expanding `~` and relative paths.
  public init(path: String) throws {
    let expanded = (path as NSString).expandingTildeInPath
    let url = URL(fileURLWithPath: expanded).standardizedFileURL
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
      throw VaultError.vaultNotFound(url.path)
    }
    guard isDirectory.boolValue else {
      throw VaultError.notADirectory(url.path)
    }
    self.root = url
  }

  /// The path of a note relative to the vault root, or `nil` when the file
  /// lies outside the vault.
  public func relativePath(for url: URL) -> String? {
    let base = root.standardizedFileURL.path
    let target = url.standardizedFileURL.path
    guard target.hasPrefix(base) else { return nil }
    var relative = String(target.dropFirst(base.count))
    while relative.hasPrefix("/") { relative.removeFirst() }
    return relative.isEmpty ? nil : relative
  }

  /// The absolute URL of a vault-relative path.
  public func url(for relativePath: String) -> URL {
    root.appending(path: relativePath)
  }

  /// Every Markdown file in the vault, sorted by path.
  public func markdownFiles() throws -> [URL] {
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey, .fileSizeKey],
      options: [.skipsHiddenFiles]
    ) else {
      throw VaultError.ioFailure("Could not enumerate vault at \(root.path)")
    }

    var files: [URL] = []
    let base = root.standardizedFileURL.path
    for case let url as URL in enumerator {
      let path = url.standardizedFileURL.path
      guard path.hasPrefix(base) else { continue }

      let relative = String(path.dropFirst(base.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      let components = relative.split(separator: "/").map(String.init)
      if components.contains(where: { Self.ignoredFolders.contains($0) }) { continue }
      if components.contains(where: { $0.hasPrefix(".") && $0 != ".md" }) { continue }

      let ext = url.pathExtension.lowercased()
      guard Self.noteExtensions.contains(ext) else { continue }

      var isDirectory: ObjCBool = false
      guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
        continue
      }
      files.append(url)
    }

    return files.sorted { $0.path < $1.path }
  }

  /// Loads every note in the vault and builds the index.
  public func loadIndex() async throws -> VaultIndex {
    let files = try markdownFiles()
    var notes: [Note] = []
    notes.reserveCapacity(files.count)
    for file in files {
      if let note = try loadNote(at: file) {
        notes.append(note)
      }
    }
    return VaultIndex(notes: notes)
  }

  /// Loads a single note from disk.
  public func loadNote(at url: URL) throws -> Note? {
    guard let relativePath = relativePath(for: url) else { return nil }
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    let modified = attributes?[.modificationDate] as? Date ?? .distantPast
    let size = attributes?[.size] as? Int ?? 0

    var note = try parseNote(
      relativePath: relativePath,
      contents: try String(contentsOf: url, encoding: .utf8)
    )
    note.modifiedAt = modified
    note.byteSize = size
    return note
  }

  /// Parses note contents into a `Note`.
  public func parseNote(relativePath: String, contents: String) throws -> Note {
    let document = (try? MarkdownDocument.parse(contents)) ?? MarkdownDocument(frontmatter: [:], body: contents, raw: contents)
    let fileName = (relativePath as NSString).deletingPathExtension
    let id = (relativePath as NSString).deletingPathExtension

    let title = document.frontmatter["title"]?.stringValue.nonEmpty
      ?? document.frontmatter["name"]?.stringValue.nonEmpty
      ?? fileName

    let aliases = mergedAliases(from: document)
    let frontmatterTags = document.frontmatter["tags"]?.stringList ?? []
    let inlineTags = WikilinkParser.parseTags(in: document.body)
    var tags: [String] = []
    var seen: Set<String> = []
    for tag in frontmatterTags + inlineTags {
      let cleaned = tag.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
      guard !cleaned.isEmpty else { continue }
      let key = cleaned.lowercased()
      if seen.insert(key).inserted { tags.append(cleaned) }
    }

    let links = WikilinkParser.parseLinks(in: document.body)
    let headings = WikilinkParser.parseHeadings(in: document.body)

    return Note(
      id: id,
      relativePath: relativePath,
      title: title,
      aliases: aliases,
      tags: tags,
      frontmatter: document.frontmatter,
      body: document.body,
      links: links,
      headings: headings,
      modifiedAt: .distantPast,
      byteSize: contents.utf8.count
    )
  }

  /// Writes a note to disk, creating intermediate folders.
  public func write(note: Note, body overrideBody: String? = nil) throws {
    let url = url(for: note.relativePath)
    let directory = url.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let contents = renderNote(note, body: overrideBody)
    try contents.write(to: url, atomically: true, encoding: .utf8)
  }

  /// Renders a note back to its on-disk representation.
  ///
  /// The frontmatter block is emitted only when there is something to write,
  /// keeping plain notes plain.
  public func renderNote(_ note: Note, body overrideBody: String? = nil) -> String {
    var output = ""
    if !note.frontmatter.isEmpty {
      output += "---\n"
      for key in note.frontmatter.keys.sorted() {
        guard let value = note.frontmatter[key] else { continue }
        switch value {
        case .array(let items):
          output += "\(key):\n"
          for item in items {
            output += "  - \(item.stringValue)\n"
          }
        case .mapping(let mapping):
          output += "\(key):\n"
          let nested = mapping.keys.sorted().map { (key: $0, value: mapping[$0]!) }
          for (nestedKey, nestedValue) in nested {
            output += "  \(nestedKey): \(nestedValue.stringValue)\n"
          }
        default:
          output += "\(key): \(value.stringValue)\n"
        }
      }
      output += "---\n"
    }
    let body = overrideBody ?? note.body
    output += body.hasPrefix("\n") ? body : "\n" + body
    return output
  }

  /// Moves a note to a new vault-relative path.
  public func move(note: Note, to newRelativePath: String) throws -> Note {
    let destination = url(for: newRelativePath)
    let directory = destination.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let source = url(for: note.relativePath)
    if FileManager.default.fileExists(atPath: source.path) {
      try FileManager.default.moveItem(at: source, to: destination)
    }

    var updated = note
    updated.relativePath = newRelativePath
    updated.id = (newRelativePath as NSString).deletingPathExtension
    updated.title = (newRelativePath as NSString).deletingPathExtension
    return updated
  }

  /// Deletes a note from disk.
  public func delete(note: Note) throws {
    let url = url(for: note.relativePath)
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }

  /// Collects aliases from both the `alias` and `aliases` frontmatter keys.
  private func mergedAliases(from document: MarkdownDocument) -> [String] {
    var aliases: [String] = []
    var seen: Set<String> = []
    for key in ["alias", "aliases"] {
      for alias in document.frontmatter[key]?.stringList ?? [] {
        let cleaned = alias.trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty else { continue }
        if seen.insert(cleaned.lowercased()).inserted { aliases.append(cleaned) }
      }
    }
    return aliases
  }
}

extension String {
  /// The string, or `nil` when it only contains whitespace.
  var nonEmpty: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
