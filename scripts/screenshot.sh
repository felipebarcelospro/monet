#!/usr/bin/env bash
#
# Captures the Monet interface into `docs/screenshots/`.
#
# The app renders its own window into a PNG (`--capture`), so the screenshots
# can be produced on a machine that has not been granted the Screen
# Recording permission.
#
# Usage:
#   scripts/screenshot.sh [output directory]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/docs/screenshots}"
VAULT="${MONET_VAULT:-$ROOT/ExampleVault}"
BINARY="$ROOT/build/Monet.app/Contents/MacOS/Monet"

mkdir -p "$OUTPUT"

if [[ ! -x "$BINARY" ]]; then
  echo "==> Building the application"
  "$ROOT/scripts/build-app.sh" >/dev/null
fi

if [[ ! -d "$VAULT" ]]; then
  echo "==> Seeding the example vault"
  (cd "$ROOT" && pnpm seed >/dev/null)
fi

capture() {
  local name="$1"
  shift
  echo "==> Capturing $name"
  "$BINARY" "$VAULT" "$@" --capture "$OUTPUT/$name.png" 2>&1 | grep -v "^captured" || true
}

capture "01-editor"

# The graph workspace.
capture "02-graph" --workspace graph

# The command palette.
capture "03-command-palette" --palette

echo "==> Screenshots written to $OUTPUT"
ls -1 "$OUTPUT"
