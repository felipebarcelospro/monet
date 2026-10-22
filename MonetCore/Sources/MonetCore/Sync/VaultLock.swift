import CryptoKit
import Foundation

/// The information the Monet app publishes about the vault it has open.
///
/// The lock file lets the command line interface warn the user when both
/// write to the same file. It is a *hint*, never a lock: the CLI never
/// refuses to work because the app is running.
public struct VaultLock: Sendable, Codable, Equatable {
  /// The absolute path of the vault the app has open.
  public var vault: String
  /// The process id of the app.
  public var pid: Int32
  /// The moment the app opened the vault, in milliseconds since the epoch.
  public var startedAt: Double
  /// The port the app listens on, when it exposes one.
  public var port: Int?

  public init(vault: String, pid: Int32, startedAt: Double = Date().timeIntervalSince1970 * 1_000, port: Int? = nil) {
    self.vault = vault
    self.pid = pid
    self.startedAt = startedAt
    self.port = port
  }
}

/// Publishes and removes the lock file of an open vault.
///
/// The lock file lives in Application Support, next to the app's other
/// per-user state, and never inside the vault: the vault holds nothing but
/// Markdown.
public struct VaultLockWriter: Sendable {
  /// The directory the lock files are written to.
  public static func lockDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
    if let override = environment["MONET_STATE_DIR"], !override.isEmpty {
      return URL(fileURLWithPath: override)
    }
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    return base.appending(path: "Monet/locks")
  }

  /// The path of the lock file of a vault.
  ///
  /// The name is the first 16 hexadecimal characters of the SHA-256 of the
  /// vault path, which matches the name the TypeScript CLI computes.
  public static func lockPath(for vault: String, environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
    let digest = SHA256.hash(data: Data(vault.utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return lockDirectory(environment: environment).appending(path: "\(name.prefix(16)).json")
  }

  /// Writes the lock file for a vault.
  @discardableResult
  public static func write(vault: String, pid: Int32 = ProcessInfo.processInfo.processIdentifier, port: Int? = nil) throws -> URL {
    let url = lockPath(for: vault)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let lock = VaultLock(vault: vault, pid: pid, port: port)
    let data = try JSONEncoder().encode(lock)
    try data.write(to: url, options: .atomic)
    return url
  }

  /// Removes the lock file of a vault.
  public static func remove(vault: String) {
    let url = lockPath(for: vault)
    try? FileManager.default.removeItem(at: url)
  }

  /// Reads the lock file of a vault, when the app is still running.
  public static func read(vault: String) -> VaultLock? {
    let url = lockPath(for: vault)
    guard let data = try? Data(contentsOf: url) else { return nil }
    guard let lock = try? JSONDecoder().decode(VaultLock.self, from: data) else { return nil }
    return lock
  }
}
