<div align="center">

# InsomniKit

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
  Duration             ▸  15m · 30m · 1h · 2h · ∞ · Custom…
  Battery Auto-Disable ▸  Off · ≤50% · ≤30% · ≤20% · Custom…
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

InsomniKit is the same idea, wrapped in two clicks — and it cleans itself up.
Crash, force-quit, kill -9: there's no orphaned `caffeinate` process and no leftover `pmset` state.

## Install (permanent)

Two commands. Done.

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
pnpm install            # or: npm install / yarn / bun install
pnpm run install:app    # builds, installs to /Applications, launches
```

That's it — InsomniKit is now in your `/Applications` folder and running in the menu bar.

In the menu, toggle **Launch at Login** if you want it to come back automatically after every reboot.

### Updating

```bash
git pull
pnpm install            # picks up new deps if any
pnpm run install:app    # closes the running app, rebuilds, reinstalls, relaunches
```

Same script. Settings are preserved across updates.

<details>
<summary>What <code>install:app</code> does</summary>

1. Gracefully quits any running InsomniKit (then SIGKILLs stragglers).
2. Builds the host architecture only (`electron-builder --mac --dir`) — fast, no `.dmg`.
3. Moves the `.app` to `/Applications` (falls back to `~/Applications` on managed Macs where `/Applications` isn't writable).
4. Strips the `com.apple.quarantine` attribute so Gatekeeper doesn't block the unsigned bundle on first launch.
5. Launches it.

</details>

## Use

| When you want to…                                     | Do this                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| Stay awake for a long build / download                | **Enable** + **Duration → 1h** (or 2h)   |
| Keep watching a movie without locking                 | **Enable** + **Duration → ∞**            |
| Auto-stop when the battery gets low                   | **Battery Auto-Disable → ≤ 30%**         |
| Stop immediately                                      | **Disable** (or just **Quit**)           |
| Pick a value the presets don't cover                   | **Duration → Custom…** (1–1440 min) or **Battery Auto-Disable → Custom…** (1–99 %) |

Your duration, threshold, and Launch-at-Login choices are remembered across restarts. Custom values persist the same way — the menu shows your current value as "Custom: 47 minutes" so you always know what's set.

## About closing the lid

This trips up everyone, so it's worth spelling out:

**Closing the lid always turns off the screen.** That's a hardware behavior of MacBooks — the display is physically covered, and no software (not InsomniKit, not `caffeinate`, not `pmset`) can keep it lit. The real question is whether the *system* keeps running.

| Power source                            | Lid closed → system sleeps? | What you'll see                                                          |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| **AC + InsomniKit active**               | No                          | Screen off, but background tasks (downloads, builds, sync) keep running. |
| **Battery + InsomniKit active**          | **Yes**                     | macOS forces sleep on lid-close regardless. `caffeinate -s` is documented as AC-only. The menu shows `⚠︎ Lid-close sleeps on battery` when you're in this state. |
| **AC + external display + lid closed** | No (native clamshell)       | Mac drives the external display normally — InsomniKit isn't even needed.   |

> **TL;DR**: On AC power, just leave it active and close the lid. Your work continues. On battery, plug in first — *or* turn on Lid-Closed Mode (below).

### Lid-Closed Mode (advanced, opt-in)

If you really need the system to stay awake with the lid closed *on battery*, InsomniKit can flip `pmset -c disablesleep 1` for you. Open the menu and click **Turn on Lid-Closed Mode… (admin)**.

What happens:

- macOS shows a native password sheet ("InsomniKit needs admin access to keep your Mac awake when the lid is closed"). Enter your password.
- The setting is **system-wide** — every app sees it.
- Your choice is remembered: the next launch silently adopts the existing state, no second prompt.
- To turn it off: click **Turn off Lid-Closed Mode…** in the menu. Another password sheet, then it's reverted.

What this **doesn't** do:

- It does **not** stop the screen turning off when the lid closes — nothing can.
- It does **not** override macOS thermal limits. If the Mac gets too hot inside a closed lid, the kernel will still sleep it for safety.
- It does **not** auto-revert on quit. If you quit InsomniKit while Lid-Closed Mode is on, the system stays in that state until you launch InsomniKit again and toggle it off, or run `sudo pmset -c disablesleep 0` manually.

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

## Roadmap

- **Strategy picker** — expose caffeinate vs pmset in the menu for power users.
- AC-power-only mode, external-display detection, activity-based wake lock.

## License

MIT — do whatever you want.
