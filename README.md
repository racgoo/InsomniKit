<div align="center">

# Insomniac

**Keep your Mac awake — exactly as long as you want.**

A tiny menu-bar utility for macOS. No Dock icon. No windows. No telemetry.

![platform](https://img.shields.io/badge/platform-macOS%2012%2B-1d1d1f?style=flat-square)
![arch](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-1d1d1f?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-1d1d1f?style=flat-square)
![status](https://img.shields.io/badge/status-stable-22c55e?style=flat-square)

English · [한국어](./README.ko.md)

</div>

---

## What it does

Click the moon in your menu bar → pick a duration → your Mac stays awake.
When the timer ends — or the battery dips below your threshold — sleep comes back automatically.

```text
  ●  Active
  Battery: 82% ⚡
  Timer: 54m remaining
  Auto-disable: ≤ 30%
  ───────────────────
  Disable
  ───────────────────
  Duration             ▸  15m · 30m · 1h · 2h · ∞
  Battery Auto-Disable ▸  Off · ≤50% · ≤30% · ≤20%
  ───────────────────
  ☑  Launch at Login
  ───────────────────
  Quit
```

## Why

`caffeinate` from a terminal is great until:

- You close the terminal and your Mac sleeps mid-render.
- You forget it's running and your battery drains overnight.
- You actually want it to stop after the build finishes.

Insomniac is the same idea, wrapped in two clicks — and it cleans itself up.
Crash, force-quit, kill -9: there's no orphaned `caffeinate` process and no leftover `pmset` state.

## Install (permanent)

Build it once, drop it in `/Applications`, forget it exists.

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
pnpm install            # or: npm install / yarn / bun install
pnpm run pack           # ~10 seconds on Apple Silicon
```

Then drag the `.app` to Applications:

```bash
mv release/mac-arm64/Insomniac.app /Applications/
xattr -dr com.apple.quarantine /Applications/Insomniac.app
open /Applications/Insomniac.app
```

> Intel Macs: replace `mac-arm64` with `mac`.

In the menu, toggle **Launch at Login** if you want it to come back automatically after every reboot.

## Use

| When you want to…                                     | Do this                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| Stay awake for a long build / download                | **Enable** + **Duration → 1h** (or 2h)   |
| Keep watching a movie without locking                 | **Enable** + **Duration → ∞**            |
| Auto-stop when the battery gets low                   | **Battery Auto-Disable → ≤ 30%**         |
| Stop immediately                                      | **Disable** (or just **Quit**)           |

Your duration, threshold, and Launch-at-Login choices are remembered across restarts.

## Dev

```bash
pnpm install
pnpm run dev      # tsc + electron, hot relaunch with `pnpm run dev` again
```

Works identically with **npm**, **yarn**, and **bun** — scripts inline their commands and don't assume a package manager.

## Build for distribution

```bash
pnpm run dist     # arm64 + x64, .dmg + .zip in release/
```

No code signing. No notarization. This is open source meant to be cloned and built locally — sign it yourself if you want to ship it.

## License

MIT — do whatever you want.
