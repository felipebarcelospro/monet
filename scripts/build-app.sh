#!/usr/bin/env bash
#
# Builds Monet.app — a double clickable macOS application bundle.
#
# Swift Package Manager produces a bare executable. This script wraps it in a
# proper `.app` bundle with an Info.plist, the localisation resources and an
# ad-hoc signature, so macOS treats it as a real application.
#
# Usage:
#   scripts/build-app.sh [output directory]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/build}"
APP="$OUTPUT/Monet.app"
CONFIGURATION="${MONET_CONFIGURATION:-release}"

echo "==> Building MonetApp ($CONFIGURATION)"
swift build --package-path "$ROOT" -c "$CONFIGURATION" --product MonetApp

BIN_DIR="$(swift build --package-path "$ROOT" -c "$CONFIGURATION" --show-bin-path)"
EXECUTABLE="$BIN_DIR/MonetApp"

if [[ ! -x "$EXECUTABLE" ]]; then
  echo "error: the MonetApp executable was not found at $EXECUTABLE" >&2
  exit 1
fi

echo "==> Assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$EXECUTABLE" "$APP/Contents/MacOS/Monet"

# The Swift Package Manager resource bundle carries the String Catalog.
for bundle in "$BIN_DIR"/*.bundle; do
  [[ -d "$bundle" ]] || continue
  cp -R "$bundle" "$APP/Contents/Resources/"
done

# SwiftPM copies the catalog verbatim, so it is compiled into the `.lproj`
# folders that macOS reads. Without this step the interface would show the
# raw keys instead of the translations.
echo "==> Compiling the string catalog"
node "$ROOT/scripts/compile-strings.mjs" \
  "$ROOT/MonetApp/Sources/MonetApp/Resources/Localizable.xcstrings" \
  "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>Monet</string>
  <key>CFBundleIdentifier</key>
  <string>com.monet.app</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Monet</string>
  <key>CFBundleDisplayName</key>
  <string>Monet</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>26.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Monet — a local first Markdown vault.</string>
  <key>CFBundleLocalizations</key>
  <array>
    <string>en</string>
    <string>pt-BR</string>
    <string>es</string>
  </array>
</dict>
</plist>
PLIST

printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "==> Signing (ad-hoc)"
codesign --force --deep --sign - "$APP" 2>/dev/null || {
  echo "warning: ad-hoc signing failed; the app will still run locally" >&2
}

echo "==> Built $APP"
echo "    open '$APP'"
