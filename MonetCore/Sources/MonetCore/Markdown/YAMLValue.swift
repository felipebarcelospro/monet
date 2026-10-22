import Foundation

/// A value decoded from a YAML document.
///
/// Monet intentionally ships a dependency-free YAML subset parser: the vault
/// frontmatter format is small, stable and shared byte-for-byte with the
/// TypeScript CLI. Supporting the full YAML specification is not required and
/// would introduce a divergence between the two implementations.
public enum YAMLValue: Sendable, Hashable {
  case string(String)
  case int(Int)
  case double(Double)
  case bool(Bool)
  case null
  case array([YAMLValue])
  case mapping([String: YAMLValue])

  /// Textual representation used for display and search purposes.
  public var stringValue: String {
    switch self {
    case .string(let value): value
    case .int(let value): String(value)
    case .double(let value): String(value)
    case .bool(let value): value ? "true" : "false"
    case .null: ""
    case .array(let values): values.map(\.stringValue).joined(separator: ", ")
    case .mapping(let mapping):
      mapping
        .keys
        .sorted()
        .map { "\($0): \(mapping[$0]?.stringValue ?? "")" }
        .joined(separator: ", ")
    }
  }

  /// A list of strings, flattening nested sequences one level deep.
  ///
  /// Frontmatter authors write `tags: [a, b]` as often as they write a YAML
  /// block sequence, so both shapes must collapse to the same list.
  public var stringList: [String] {
    switch self {
    case .string(let value): [value]
    case .array(let values): values.flatMap(\.stringList)
    case .mapping(let mapping): mapping.keys.sorted()
    case .int, .double, .bool, .null: []
    }
  }
}
