import Foundation

/// The options the app accepts on the command line.
struct LaunchOptions {
  /// The vault folder to open.
  var vault: URL?
  /// The note to select.
  var note: String?
  /// The workspace to show.
  var workspace: String?
  /// Whether the command palette opens straight away.
  var opensPalette = false
  /// Whether the focus mode starts on.
  var startsFocused = false
  /// The path the window is rendered into, when the app is capturing itself.
  var capturePath: String?

  /// Parses the command line.
  ///
  /// The positional arguments are the vault and the note; the flags are
  /// `--capture`, `--workspace`, `--palette` and `--focus`.
  static func parse(_ arguments: [String] = CommandLine.arguments) -> LaunchOptions {
    var options = LaunchOptions()
    var positional: [String] = []

    // `arguments[0]` is the executable itself.
    var index = 1
    while index < arguments.count {
      let argument = arguments[index]
      switch argument {
      case "--capture":
        index += 1
        if index < arguments.count { options.capturePath = arguments[index] }
      case "--workspace":
        index += 1
        if index < arguments.count { options.workspace = arguments[index] }
      case "--palette":
        options.opensPalette = true
      case "--focus":
        options.startsFocused = true
      default:
        if !argument.hasPrefix("-") { positional.append(argument) }
      }
      index += 1
    }

    if let first = positional.first {
      let candidate = URL(fileURLWithPath: (first as NSString).expandingTildeInPath)
        .standardizedFileURL
      var isDirectory: ObjCBool = false
      if FileManager.default.fileExists(
        atPath: candidate.path,
        isDirectory: &isDirectory
      ), isDirectory.boolValue {
        options.vault = candidate
        if positional.count > 1 { options.note = positional[1] }
      }
    }

    return options
  }
}
