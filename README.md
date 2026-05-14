# Insomniac

A minimal macOS menu-bar utility that keeps your Mac awake — with timer- and battery-based auto-disable, and safe cleanup even if the app crashes.

Lives in the menu bar only. No Dock icon, no windows.

## Features

- **One-click enable / disable** sleep prevention
- **Duration timer**: 15m / 30m / 1h / 2h / ∞ — auto-disables when it expires
- **Battery threshold auto-disable**: ≤ 50% / 30% / 20% (edge-triggered)
- **Pluggable sleep strategies**:
  - `caffeinate` (default, per-process, safest)
  - `pmset` (system-wide, survives lid close; restores original setting on quit)
- **Crash-safe cleanup**: SIGINT / SIGTERM / SIGHUP / `uncaughtException` / `before-quit` all route through a synchronous restore — no orphan `caffeinate`, no leftover `disablesleep`
- **Launch at Login** toggle
- **Settings persistence**: duration / threshold / strategy / launch-at-login restored on next start
- **Live tray title** showing remaining time (`15m`, `1h 5m`, `∞`)
- **Single-instance**: two Insomniacs can never fight over the same caffeinate process

## Requirements

- macOS 12+ (Apple Silicon or Intel)
- Node.js ≥ 18
- npm, pnpm, yarn, or bun — pick any; the scripts don't assume a specific manager

> **pnpm note:** pnpm blocks dependency install scripts by default. Electron downloads its binary in a `postinstall`, so the package's `pnpm.onlyBuiltDependencies` config explicitly allows it. If you ran `pnpm install` against an older revision and see `Electron failed to install correctly`, just run `pnpm install` again (or `pnpm rebuild electron`).

## Getting started

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit

# pick whichever you have installed:
npm install   # or: pnpm install   /   yarn install   /   bun install
npm run dev   # or: pnpm dev       /   yarn dev       /   bun run dev
```

The app appears in the menu bar within ~1 second. There is no Dock icon and no window. Click the icon to open the menu.

### Scripts

All scripts work with any package manager — they inline their commands rather than calling `npm run` recursively.

| Script         | What it does                                                         |
| -------------- | -------------------------------------------------------------------- |
| `build`        | Compile TypeScript to `dist/`                                        |
| `build:watch`  | Incremental compile                                                  |
| `lint`         | Strict `tsc --noEmit` (no other linter, intentionally)               |
| `dev` / `start`| Build + launch Electron (uses `env -u ELECTRON_RUN_AS_NODE` for safety) |
| `dist`         | Build a local `.dmg` + `.zip` for arm64 and x64                      |
| `dist:dir`     | Build the unpacked `.app` only (faster, for testing)                 |
| `clean`        | Remove `dist/` and `release/`                                        |

## Building a local app

```bash
npm run dist   # or: pnpm dist / yarn dist / bun run dist
```

Artifacts land in `release/`. No code signing, no notarization — this is deliberate. The project is intended to be cloned and built locally per the project goals.

To run the unsigned `.app` on macOS for the first time, either right-click → Open, or strip the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/Insomniac.app
```

## Architecture

```
src/main/
  index.ts              # Entry: wires everything, installs cleanup handlers
  state/
    types.ts            # InsomniacState, presets, helpers
    store.ts            # Typed event-driven store (single source of truth)
    persistence.ts      # Atomic JSON settings persistence
  services/
    sleep/
      strategy.ts       # SleepStrategy interface
      caffeinate.ts     # `caffeinate -dims` lifecycle
      pmset.ts          # `pmset -c disablesleep` with original-value restore
      manager.ts        # SleepManager (owns both strategies)
    battery/
      parser.ts         # Robust `pmset -g batt` parser
      monitor.ts        # Polling + edge-triggered threshold detection
    timer/manager.ts    # Single-slot countdown
    launchAtLogin.ts    # app.setLoginItemSettings wrapper
  tray/
    icons.ts            # Template icon loading (auto dark/light)
    format.ts           # Pure label formatters
    controller.ts       # Tray + Menu rebuild loop
  utils/
    cleanup.ts          # SIGINT/SIGTERM/SIGHUP/uncaught handlers
    emitter.ts          # Tiny typed event emitter
    exec.ts             # Promisified execFile (no shell)
    logger.ts           # Prefixed leveled logger
```

### Why two sleep strategies?

`caffeinate` is per-process and goes away the moment our binary does — safest choice for a default. But `caffeinate` alone does **not** keep a MacBook awake with the lid closed. `pmset -c disablesleep 1` does, but it's a **system-wide** setting that can leave the user stuck if the app crashes without restoring it.

`PmsetStrategy` reads the original value via `pmset -g custom` **before** writing, only flips it if the user wasn't already running with `disablesleep=1`, and uses `spawnSync` in its `restoreOnExit()` path so signal handlers can safely call it.

The `SleepStrategy` interface is the seam where future modes plug in — lid-close-aware mode, AC-only mode, external-display-attached mode, etc.

### Why edge-triggered battery threshold?

A naive "battery ≤ 30% → disable" check would fire on every poll while sitting at 19%, repeatedly calling `sleep.disable()` even after the user manually re-enabled. The monitor latches after the first crossing and re-arms only when the battery rises >2% above the threshold (or the user changes the threshold setting).

## Logging

Set `INSOMNIAC_LOG_LEVEL=debug` to see verbose output:

```bash
INSOMNIAC_LOG_LEVEL=debug npm run dev
```

## Roadmap

Extension points already in place (interfaces / structure) but not yet exposed in the UI:

- Lid-close-aware mode (auto-switch caffeinate → pmset when lid closes)
- AC-power-only mode (disable on battery regardless of threshold)
- External-display detection
- Per-trigger strategy choice
- Activity-based wake lock

The `SleepStrategy` and event-driven store make these additive rather than rewrites.

## License

MIT — see [LICENSE](./LICENSE).
