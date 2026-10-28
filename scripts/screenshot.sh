#!/usr/bin/env bash
#
# Regenerates the screenshots used by the README.
#
# The app renders its own window into a PNG (`--capture`), so no Screen
# Recording permission is needed. A temporary Electron profile and config are
# used, which means the script never changes the vault you have configured.
#
# Usage:
#   pnpm screenshots
#   scripts/screenshot.sh [output directory]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/docs/screenshots}"
VAULT="${MONET_VAULT:-$ROOT/ExampleVault}"

PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/monet-screenshots.XXXXXX")"
trap 'rm -rf "$PROFILE"' EXIT

export MONET_USER_DATA="$PROFILE/user-data"
export MONET_CONFIG_DIR="$PROFILE/config"
mkdir -p "$OUTPUT" "$MONET_USER_DATA" "$MONET_CONFIG_DIR"

if [[ ! -d "$VAULT" ]]; then
  echo "==> Seeding the example vault"
  (cd "$ROOT" && pnpm seed >/dev/null)
fi

echo "==> Building the desktop app"
(cd "$ROOT" && pnpm --filter @monet/app build >/dev/null)

ELECTRON="$ROOT/packages/app/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON" ]]; then
  echo "Electron is not installed. Run pnpm install first." >&2
  exit 1
fi

capture() {
  local name="$1"
  shift
  echo "==> Capturing $name"
  (
    cd "$ROOT/packages/app"
    "$ELECTRON" . --vault "$VAULT" "$@" \
      --capture "$OUTPUT/$name.png" --width 1440 --height 900 >/dev/null 2>&1
  )
}

capture "editor" --note "Guides/Markdown"
capture "reading" --note "Guides/Markdown" --reading
capture "graph" --note "Guides/Markdown" --view graph
capture "command-palette" --note "Guides/Markdown" --palette commands
capture "settings" --note "Guides/Markdown" --settings

# The welcome screen needs its own empty profile and no vault argument.
echo "==> Capturing welcome"
mkdir -p "$PROFILE/welcome-user" "$PROFILE/welcome-config"
(
  cd "$ROOT/packages/app"
  MONET_USER_DATA="$PROFILE/welcome-user" \
  MONET_CONFIG_DIR="$PROFILE/welcome-config" \
    "$ELECTRON" . --capture "$OUTPUT/welcome.png" --width 1440 --height 900 >/dev/null 2>&1
)

echo "==> Screenshots written to $OUTPUT"
ls -1 "$OUTPUT"
