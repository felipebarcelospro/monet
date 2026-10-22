import Foundation

/// Watches a vault folder for file system changes.
///
/// The watcher is implemented with `DispatchSource` file system monitoring.
/// Because a single file system event can describe many files at once, the
/// watcher keeps a snapshot of the vault (path, size and modification date)
/// and diffs it against the current state whenever an event arrives.
/// Changes are coalesced with a short debounce so the index does not thrash
/// while a note is being typed into.
public final class VaultWatcher: @unchecked Sendable {
  /// A description of a change to the vault.
  public struct Change: Sendable, Equatable {
    /// The vault-relative path that changed.
    public var path: String
    /// Whether the file was created, modified or removed.
    public var kind: Kind

    /// The kind of change.
    public enum Kind: String, Sendable, Equatable {
      case created
      case modified
      case removed
    }

    public init(path: String, kind: Kind) {
      self.path = path
      self.kind = kind
    }
  }

  /// A snapshot entry for a single file.
  private struct Snapshot: Sendable {
    var size: Int
    var modified: Date
  }

  private let root: URL
  private let debounce: TimeInterval
  private let handler: @Sendable ([Change]) -> Void
  private let queue = DispatchQueue(label: "com.monet.vault-watcher", qos: .utility)

  private var source: DispatchSourceFileSystemObject?
  private var fileDescriptor: Int32 = -1
  private var snapshot: [String: Snapshot] = [:]
  private var pending: [String: Change.Kind] = [:]
  private var flushScheduled = false
  private let lock = NSLock()

  /// Creates a watcher for a vault root.
  ///
  /// - Parameters:
  ///   - root: The vault folder to watch.
  ///   - debounce: How long to wait for the file system to settle before
  ///     reporting changes.
  ///   - handler: Called on a background queue with the batched changes.
  public init(
    root: URL,
    debounce: TimeInterval = 0.2,
    handler: @escaping @Sendable ([Change]) -> Void
  ) {
    self.root = root
    self.debounce = debounce
    self.handler = handler
    self.snapshot = Self.takeSnapshot(root: root)
  }

  /// Starts watching. Calling this twice is a no-op.
  public func start() {
    lock.lock()
    defer { lock.unlock() }
    guard source == nil else { return }

    fileDescriptor = open(root.path, O_EVTONLY)
    guard fileDescriptor >= 0 else { return }

    let source = DispatchSource.makeFileSystemObjectSource(
      fileDescriptor: fileDescriptor,
      eventMask: [.write, .rename, .delete, .extend],
      queue: queue
    )

    source.setEventHandler { [weak self] in
      self?.rescan()
    }
    source.setCancelHandler { [weak self] in
      guard let self else { return }
      if self.fileDescriptor >= 0 {
        close(self.fileDescriptor)
        self.fileDescriptor = -1
      }
    }
    self.source = source
    source.resume()
  }

  /// Stops watching and releases the file descriptor.
  public func stop() {
    lock.lock()
    let source = self.source
    self.source = nil
    lock.unlock()
    source?.cancel()
  }

  deinit {
    stop()
  }

  /// Re-scans the vault and queues the differences.
  public func rescan() {
    let current = Self.takeSnapshot(root: root)

    lock.lock()
    let previous = snapshot
    snapshot = current
    var changes: [String: Change.Kind] = [:]

    for (path, entry) in current {
      if let old = previous[path] {
        if old.size != entry.size || old.modified != entry.modified {
          changes[path] = .modified
        }
      } else {
        changes[path] = .created
      }
    }
    for path in previous.keys where current[path] == nil {
      changes[path] = .removed
    }

    for (path, kind) in changes {
      pending[path] = kind
    }
    lock.unlock()

    scheduleFlush()
  }

  /// Reports a change directly. Used by tests and by the app when it knows a
  /// file changed without waiting for the file system notification.
  public func report(_ change: Change) {
    lock.lock()
    pending[change.path] = change.kind
    lock.unlock()
    scheduleFlush()
  }

  private func scheduleFlush() {
    lock.lock()
    if flushScheduled {
      lock.unlock()
      return
    }
    flushScheduled = true
    lock.unlock()

    queue.asyncAfter(deadline: .now() + debounce) { [weak self] in
      guard let self else { return }
      self.lock.lock()
      let batch = self.pending
      self.pending.removeAll()
      self.flushScheduled = false
      self.lock.unlock()
      guard !batch.isEmpty else { return }
      self.handler(batch.map { Change(path: $0.key, kind: $0.value) })
    }
  }

  /// Captures the size and modification date of every Markdown file.
  private static func takeSnapshot(root: URL) -> [String: Snapshot] {
    var result: [String: Snapshot] = [:]
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey, .fileSizeKey],
      options: [.skipsHiddenFiles]
    ) else {
      return result
    }

    let base = root.standardizedFileURL.path
    for case let url as URL in enumerator {
      let path = url.standardizedFileURL.path
      guard path.hasPrefix(base) else { continue }
      let relative = String(path.dropFirst(base.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      let components = relative.split(separator: "/").map(String.init)
      if components.contains(where: { $0.hasPrefix(".") }) { continue }
      guard ["md", "markdown"].contains(url.pathExtension.lowercased()) else { continue }

      let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
      result[relative] = Snapshot(
        size: values?.fileSize ?? 0,
        modified: values?.contentModificationDate ?? .distantPast
      )
    }
    return result
  }
}
