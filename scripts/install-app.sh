#!/usr/bin/env bash
# Build Insomniac, install it to /Applications, strip quarantine, and launch.
# Idempotent: rerun anytime to update (pulls handled separately by the user).

set -euo pipefail

# --- pretty output ---
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

step()  { printf "${B}→${N} %s\n" "$1"; }
ok()    { printf "${G}✓${N} %s\n" "$1"; }
warn()  { printf "${Y}!${N} %s\n" "$1"; }
fail()  { printf "${R}✗${N} %s\n" "$1" >&2; exit 1; }

APP_NAME="Insomniac"
APP_BUNDLE="$APP_NAME.app"

# --- preflight ---
if [ "$(uname)" != "Darwin" ]; then
  fail "Insomniac is macOS-only (detected $(uname))."
fi

ARCH=$(uname -m)
case "$ARCH" in
  arm64)  BUILD_DIR="release/mac-arm64" ;;
  x86_64) BUILD_DIR="release/mac"       ;;
  *)      fail "Unsupported architecture: $ARCH" ;;
esac
BUILD_PATH="$BUILD_DIR/$APP_BUNDLE"

# Pick an installable location: /Applications when writable,
# ~/Applications otherwise (managed Macs / non-admin users).
if [ -w /Applications ]; then
  TARGET_DIR="/Applications"
elif mkdir -p "$HOME/Applications" 2>/dev/null && [ -w "$HOME/Applications" ]; then
  TARGET_DIR="$HOME/Applications"
  warn "/Applications is not writable; installing to $TARGET_DIR instead."
else
  fail "No writable Applications directory found."
fi
TARGET_PATH="$TARGET_DIR/$APP_BUNDLE"

# We need node_modules — the user runs their PM's install once first.
if [ ! -x ./node_modules/.bin/electron-builder ] || [ ! -x ./node_modules/.bin/tsc ]; then
  fail "Dependencies not installed. Run ${B}pnpm install${N} (or npm install / yarn / bun install) first, then retry."
fi

# --- 1. stop any running instance ---
step "Stopping any running $APP_NAME..."
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
# Force-kill stragglers — strategy cleanup still runs because each
# strategy handles SIGTERM in its own restoreOnExit().
pkill -TERM -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1 || true
sleep 1
pkill -KILL -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" >/dev/null 2>&1 || true

# --- 2. build ---
step "Building $APP_NAME for $ARCH..."
rm -rf dist release
./node_modules/.bin/tsc -p tsconfig.json
# electron-builder is a Node tool — ELECTRON_RUN_AS_NODE doesn't affect
# it, but we unset just in case a parent shell sets it.
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron-builder --mac --dir >/dev/null

if [ ! -d "$BUILD_PATH" ]; then
  fail "Build did not produce $BUILD_PATH. Try ${B}pnpm run pack${N} to see full electron-builder output."
fi

# --- 3. install ---
step "Installing to $TARGET_PATH..."
if [ -d "$TARGET_PATH" ]; then
  rm -rf "$TARGET_PATH"
fi
mv "$BUILD_PATH" "$TARGET_DIR/"

# --- 4. de-quarantine ---
# Without this, Gatekeeper refuses to open an unsigned app on first
# launch. Safe because the user just built it themselves.
step "Removing quarantine attribute..."
xattr -dr com.apple.quarantine "$TARGET_PATH" 2>/dev/null || true

# --- 5. launch ---
step "Launching..."
open "$TARGET_PATH"

# --- done ---
printf "\n"
ok "$APP_NAME installed to ${B}$TARGET_PATH${N}"
printf "  ${D}Look for the moon icon in your menu bar.${N}\n"
printf "  ${D}Toggle 'Launch at Login' from the menu to auto-start on boot.${N}\n"
printf "  ${D}To update: ${N}${B}git pull && pnpm install && pnpm run install:app${N}\n"
