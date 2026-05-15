#!/usr/bin/env bash
# One-shot installer for InsomniKit.
#
# Usage: clone the repo, then run `./install.sh`. Handles:
#   1. macOS + Node.js sanity check
#   2. package-manager auto-detection (pnpm > npm > yarn > bun)
#   3. dependency install
#   4. build + drop the .app into /Applications
#   5. launch
#
# Idempotent: rerun anytime to update — the existing app is quit and
# replaced. Settings persist across updates.

set -euo pipefail

# ── pretty output ─────────────────────────────────
if [ -t 1 ]; then
  B=$(tput bold 2>/dev/null || echo "")
  G=$(tput setaf 2 2>/dev/null || echo "")
  Y=$(tput setaf 3 2>/dev/null || echo "")
  R=$(tput setaf 1 2>/dev/null || echo "")
  D=$(tput setaf 8 2>/dev/null || echo "")
  N=$(tput sgr0 2>/dev/null || echo "")
else
  B=""; G=""; Y=""; R=""; D=""; N=""
fi

step() { printf "${B}→${N} %s\n" "$1"; }
ok()   { printf "${G}✓${N} %s\n" "$1"; }
fail() { printf "${R}✗${N} %s\n" "$1" >&2; exit 1; }

cd "$(dirname "$0")"

# ── 1. preflight ──────────────────────────────────
[ "$(uname)" = "Darwin" ] || fail "InsomniKit is macOS-only (detected $(uname))."

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Install it first, then rerun:
    ${B}brew install node${N}    (Homebrew)
    or grab an installer from https://nodejs.org/"
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js ≥ 18 required — you have $(node -v). Upgrade and rerun."
fi

# ── 2. pick a package manager ─────────────────────
# Prefer pnpm (the project default), fall back to whatever's installed.
PM=""
for candidate in pnpm npm yarn bun; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PM="$candidate"
    break
  fi
done
[ -n "$PM" ] || fail "No package manager found. Install one of: pnpm / npm / yarn / bun."

step "Using ${B}${PM}${N} for dependencies"

# ── 3. install dependencies ───────────────────────
# Skip if node_modules + .bin/tsc already there AND no lockfile change.
# Cheap heuristic: just always install — it's fast when up-to-date.
step "Installing dependencies..."
case "$PM" in
  pnpm) pnpm install --silent ;;
  npm)  npm install --silent ;;
  yarn) yarn install --silent ;;
  bun)  bun install ;;  # bun has no --silent equivalent
esac

# Verify the binaries we need actually landed.
if [ ! -x ./node_modules/.bin/electron-builder ] || [ ! -x ./node_modules/.bin/tsc ]; then
  fail "Dependency install didn't produce the expected binaries. Try deleting node_modules and rerunning."
fi

# ── 4. build + install the .app ───────────────────
# `scripts/install-app.sh` handles: stop running, build, move to
# /Applications (or ~/Applications), strip quarantine, launch.
step "Building and installing InsomniKit.app..."
bash scripts/install-app.sh
