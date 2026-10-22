import Foundation

/// The state of the optional iCloud / CloudKit synchronisation.
///
/// The synchronisation is deliberately a stub in this release: the vault on
/// disk is the single source of truth and Monet never writes to a vault that
/// is not the one the user opened. The protocol below defines the seam where
/// a real CloudKit implementation plugs in, so the app can surface the
/// feature (and the CLI can report it) without pretending to sync files that
/// are not actually synchronised yet.
public protocol CloudSyncing: Sendable {
  /// The current synchronisation state.
  func state() async -> CloudSyncState
  /// Requests a synchronisation pass.
  func synchronize() async throws -> CloudSyncState
}

/// The observable synchronisation state.
public enum CloudSyncState: Sendable, Equatable {
  /// Synchronisation is not configured for this vault.
  case notConfigured
  /// Synchronisation is configured but idle.
  case idle(container: String)
  /// A synchronisation pass is running.
  case syncing(container: String, progress: Double)
  /// The last synchronisation failed.
  case failed(container: String, reason: String)

  /// A short, human readable description of the state.
  public var summary: String {
    switch self {
    case .notConfigured: "Not configured"
    case .idle(let container): "Idle (\(container))"
    case .syncing(let container, let progress): "Syncing \(container) — \(Int(progress * 100))%"
    case .failed(let container, let reason): "Failed (\(container)): \(reason)"
    }
  }

  /// Whether a synchronisation is currently running.
  public var isSyncing: Bool {
    if case .syncing = self { return true }
    return false
  }
}

/// A CloudKit synchroniser that is wired up but intentionally inert.
///
/// Monet writes to the vault folder the user chose. Moving that folder into
/// an iCloud Drive container is the supported way to get the vault onto every
/// device, and it needs no special entitlement or duplicated state. This
/// implementation reports that arrangement instead of pretending to push
/// individual files through CloudKit.
public struct iCloudSync: CloudSyncing {
  /// The iCloud Drive container that holds the vault, if any.
  public let container: String?

  public init(container: String? = nil) {
    self.container = container
  }

  public func state() async -> CloudSyncState {
    guard let container else { return .notConfigured }
    return .idle(container: container)
  }

  public func synchronize() async throws -> CloudSyncState {
    guard let container else { return .notConfigured }
    return .idle(container: container)
  }

  /// Detects whether a vault folder lives inside an iCloud Drive container.
  ///
  /// - Parameter url: The vault root.
  /// - Returns: The container name when the vault is under
  ///   `~/Library/Mobile Documents/`, otherwise `nil`.
  public static func detectContainer(for url: URL) -> String? {
    let path = url.standardizedFileURL.path
    guard path.hasPrefix("/") else { return nil }
    let components = path.split(separator: "/").map(String.init)
    guard components.count > 3, components[0] == "", components[1] == "Users" else { return nil }
    let home = components[2]
    guard components[3] == "Library", components.count > 4, components[4] == "Mobile Documents" else {
      return nil
    }
    return components.count > 5 ? components[5] : nil
  }
}
