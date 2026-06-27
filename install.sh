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
# Idempotent: rerun anytime to update. It pulls the latest `main` from
# git, rebuilds, and reinstalls — the running app is quit and replaced,
# and your settings persist across updates. (The git pull is skipped if
# you have uncommitted local changes, or if you set INSOMNIKIT_NO_PULL=1.)

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
warn() { printf "${Y}!${N} %s\n" "$1"; }
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

# ── 2. self-update: pull the latest main so install == update ─────
# General users won't think to `git pull` first, so do it for them. We
# only fast-forward `main` when the working tree is clean, then re-exec
# so the freshly-pulled installer logic actually runs. Opt out with
# INSOMNIKIT_NO_PULL=1 (also set on the re-exec to avoid a second pull).
if [ -z "${INSOMNIKIT_NO_PULL:-}" ] && [ -d .git ] && command -v git >/dev/null 2>&1; then
  step "Checking for updates (git main)..."
  if [ -n "$(git status --porcelain)" ]; then
    warn "Local changes detected — skipping auto-update so nothing is overwritten."
  elif git fetch --quiet origin 2>/dev/null; then
    BEFORE=$(git rev-parse HEAD 2>/dev/null || echo none)
    if git checkout --quiet main 2>/dev/null && git merge --ff-only --quiet origin/main 2>/dev/null; then
      AFTER=$(git rev-parse HEAD 2>/dev/null || echo none)
      if [ "$BEFORE" != "$AFTER" ]; then
        ok "Updated to the latest main — relaunching installer."
        export INSOMNIKIT_NO_PULL=1
        exec bash "$0" "$@"
      fi
      ok "Already on the latest version."
    else
      warn "Couldn't fast-forward main (diverged?) — installing the current checkout."
    fi
  else
    warn "Couldn't reach the git remote — installing the current checkout (offline?)."
  fi
fi

# ── 3. pick a package manager ─────────────────────
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

# ── 4. install dependencies ───────────────────────
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

# ── 5. build + install the .app ───────────────────
# `scripts/install-app.sh` handles: stop running, build, move to
# /Applications (or ~/Applications), strip quarantine, launch.
step "Building and installing InsomniKit.app..."
bash scripts/install-app.sh
