import Foundation

/// A Markdown note stored inside a vault.
public struct Note: Sendable, Hashable, Identifiable {
  /// The note's vault-relative path without the `.md` extension.
  ///
  /// This is the stable identity of a note inside the vault.
  public var id: String
  /// The vault-relative path including the `.md` extension.
  public var relativePath: String
  /// The display title, taken from frontmatter `title` or the file name.
  public var title: String
  /// Alternative names the note can be linked by.
  public var aliases: [String]
  /// Tags declared in the frontmatter.
  public var tags: [String]
  /// The complete frontmatter mapping.
  public var frontmatter: [String: YAMLValue]
  /// The Markdown body without the frontmatter block.
  public var body: String
  /// The outgoing links and embeds found in the body.
  public var links: [Wikilink]
  /// The headings found in the body.
  public var headings: [Heading]
  /// The last modification date reported by the file system.
  public var modifiedAt: Date
  /// The byte size of the file on disk.
  public var byteSize: Int

  public init(
    id: String,
    relativePath: String,
    title: String,
    aliases: [String] = [],
    tags: [String] = [],
    frontmatter: [String: YAMLValue] = [:],
    body: String = "",
    links: [Wikilink] = [],
    headings: [Heading] = [],
    modifiedAt: Date = .distantPast,
    byteSize: Int = 0
  ) {
    self.id = id
    self.relativePath = relativePath
    self.title = title
    self.aliases = aliases
    self.tags = tags
    self.frontmatter = frontmatter
    self.body = body
    self.links = links
    self.headings = headings
    self.modifiedAt = modifiedAt
    self.byteSize = byteSize
  }

  /// The folder that contains the note, relative to the vault root.
  public var folder: String {
    let components = relativePath.split(separator: "/")
    guard components.count > 1 else { return "" }
    return components.dropLast().joined(separator: "/")
  }

  /// The file name without the `.md` extension.
  public var fileName: String {
    (relativePath as NSString).deletingPathExtension
  }
}

/// A node in the vault graph.
public struct GraphNode: Sendable, Hashable, Identifiable {
  public var id: String
  public var title: String
  public var tags: [String]
  public var linkCount: Int
  public var backlinkCount: Int

  public init(id: String, title: String, tags: [String], linkCount: Int, backlinkCount: Int) {
    self.id = id
    self.title = title
    self.tags = tags
    self.linkCount = linkCount
    self.backlinkCount = backlinkCount
  }
}

/// A directed edge in the vault graph.
public struct GraphEdge: Sendable, Hashable, Identifiable {
  public var id: String
  public var source: String
  public var target: String

  public init(source: String, target: String) {
    self.source = source
    self.target = target
    self.id = "\(source)->\(target)"
  }
}

/// The complete graph of a vault.
public struct VaultGraph: Sendable, Hashable {
  public var nodes: [GraphNode]
  public var edges: [GraphEdge]

  public init(nodes: [GraphNode], edges: [GraphEdge]) {
    self.nodes = nodes
    self.edges = edges
  }
}
