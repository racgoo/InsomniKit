#!/usr/bin/env bash
# Build InsomniKit, install it to /Applications, strip quarantine, and launch.
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

APP_NAME="InsomniKit"
APP_BUNDLE="$APP_NAME.app"

# --- preflight ---
if [ "$(uname)" != "Darwin" ]; then
  fail "InsomniKit is macOS-only (detected $(uname))."
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

# --- 1. stop any running instance (current name + legacy name) ---
step "Stopping any running $APP_NAME..."
for name in "$APP_NAME" "Insomniac"; do
  osascript -e "tell application \"$name\" to quit" >/dev/null 2>&1 || true
  pkill -TERM -f "$name.app/Contents/MacOS/$name" >/dev/null 2>&1 || true
done
sleep 1
for name in "$APP_NAME" "Insomniac"; do
  pkill -KILL -f "$name.app/Contents/MacOS/$name" >/dev/null 2>&1 || true
done

# Remove the legacy v0.1 bundle if present — preferences are migrated
# automatically inside the app, but the old bundle would otherwise sit
# in /Applications forever.
for legacy_dir in "/Applications/Insomniac.app" "$HOME/Applications/Insomniac.app"; do
  if [ -d "$legacy_dir" ]; then
    step "Removing legacy bundle $legacy_dir..."
    rm -rf "$legacy_dir"
  fi
done

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
printf "\n  ${D}To update later — either:${N}\n"
printf "    ${B}git pull && ./install.sh${N}                              ${D}(one-shot)${N}\n"
printf "    ${B}git pull && pnpm install && pnpm run install:app${N}      ${D}(or npm / yarn / bun)${N}\n"
