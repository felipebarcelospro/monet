// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "Monet",
  defaultLocalization: "en",
  platforms: [.macOS(.v26)],
  products: [
    .library(name: "MonetCore", targets: ["MonetCore"]),
    .executable(name: "MonetApp", targets: ["MonetApp"]),
  ],
  targets: [
    .target(
      name: "MonetCore",
      path: "MonetCore/Sources/MonetCore",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "MonetCoreTests",
      dependencies: ["MonetCore"],
      path: "MonetCore/Tests/MonetCoreTests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .executableTarget(
      name: "MonetApp",
      dependencies: ["MonetCore"],
      path: "MonetApp/Sources/MonetApp",
      resources: [.process("Resources")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "MonetAppTests",
      dependencies: ["MonetApp", "MonetCore"],
      path: "MonetApp/Tests/MonetAppTests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
