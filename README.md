# Insomniac

A minimal macOS menu bar utility that prevents your Mac from going to sleep, with timer- and battery-based auto-disable.

> Status: **work in progress** — being implemented step by step.

## Features (target)

- Lives entirely in the macOS menu bar (no Dock icon, no windows)
- Enable / disable sleep prevention with one click
- Duration timer (15m / 30m / 1h / 2h / Infinite) with automatic restore
- Battery threshold auto-disable (≤ 50% / 30% / 20%)
- Safe cleanup on quit / crash — never leaves `caffeinate` orphans or `pmset disablesleep` set
- Pluggable sleep strategies (`caffeinate`, `pmset`)
- Launch at Login (optional)

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js ≥ 18
- npm

## Development

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
npm install
npm run dev
```

`npm run dev` compiles TypeScript to `dist/` and launches Electron. The app appears in the menu bar only — there is no Dock icon and no window.

### Useful scripts

| Script           | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run build`  | Compile TypeScript to `dist/`                 |
| `npm run start`  | Build + launch Electron                       |
| `npm run lint`   | Type-check only (no emit)                     |
| `npm run dist`   | Produce signed-less `.dmg` / `.zip` artifacts |
| `npm run clean`  | Remove `dist/` and `release/`                 |

## Building a local distributable

```bash
npm run dist
```

Outputs to `release/`. No code signing or notarization is performed — this is intentional. The project is open source and meant to be cloned and built locally. To run an unsigned `.app` on macOS, you may need to right-click → Open the first time, or remove the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/Insomniac.app
```

## Project structure

```
src/
  main/
    tray/        # Tray icon + menu
    services/    # Sleep strategies, battery, timer
    state/       # Central event-driven state store
    utils/       # Logger, shell helpers
    index.ts     # App entry
assets/          # Tray icons
```

## License

MIT — see [LICENSE](./LICENSE).
