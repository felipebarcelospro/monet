#!/usr/bin/env bash
#
# Runs the app straight from the package, with the localisations compiled.
#
# SwiftPM copies the String Catalog verbatim, so the `.lproj` folders the
# system reads are compiled next to the executable before the app starts.
#
# Usage:
#   scripts/run.sh [vault path] [note path]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

swift build --package-path "$ROOT" --product MonetApp

BIN_DIR="$(swift build --package-path "$ROOT" --show-bin-path)"
node "$ROOT/scripts/compile-strings.mjs" \
  "$ROOT/MonetApp/Sources/MonetApp/Resources/Localizable.xcstrings" \
  "$BIN_DIR"

exec "$BIN_DIR/MonetApp" "$@"
