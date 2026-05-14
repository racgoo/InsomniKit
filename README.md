<div align="center">

<br>

# ◐ &nbsp; InsomniKit

### Keep your Mac awake — *exactly* as long as you want.

Close the lid, walk away, let your agent keep coding.
A tiny macOS menu-bar utility. No Dock icon. No windows. No telemetry. No nonsense.

<br>

![platform](https://img.shields.io/badge/platform-macOS%2012+-1d1d1f?style=for-the-badge&logo=apple&logoColor=white)
![arch](https://img.shields.io/badge/Apple%20Silicon%20·%20Intel-1d1d1f?style=for-the-badge)
![license](https://img.shields.io/badge/license-MIT-1d1d1f?style=for-the-badge)
![status](https://img.shields.io/badge/status-stable-22c55e?style=for-the-badge)
![vibe-coded](https://img.shields.io/badge/vibe--coded%20with-Claude%20Code-d97757?style=for-the-badge)

**English** · [한국어](./README.ko.md)

<br>

</div>

---

<div align="center">

<img src="https://github.com/user-attachments/assets/920f5ed0-16f3-4a8f-928f-f3f485597db4" alt="Six months ago vs now: how developers carry their laptops" width="660" />

**Six months ago you closed the lid and walked off.**
**Now you tiptoe around with it cracked open like it's made of glass — just so the agent doesn't die.**

### Close it. For real. InsomniKit keeps the run alive.

</div>

---

## ⚡ 30-second start

```bash
git clone https://github.com/racgoo/InsomniKit.git
cd InsomniKit
pnpm install && pnpm run install:app
```

That's it. The script:

1. **Builds** the app and **installs it to your `Applications` folder** (`/Applications/InsomniKit.app`).
2. **Launches it** for you automatically.
3. The icon — a small moon — appears at the **top-right of your menu bar**, alongside Wi-Fi, battery, and the clock. **There is no Dock icon and no window** — that's by design.

Click the moon → pick a duration → your Mac stays awake.

> Works with **npm**, **yarn**, and **bun** too — pick your poison.

---

## What you get

|  | |
|---|---|
| **One-click toggle** | Awake on. Awake off. That's the whole interaction. |
| **Timers** | 15m · 30m · 1h · 2h · ∞ — or type any value up to 24h. |
| **Battery-aware** | Auto-stops when the battery dips below your threshold. Set it to 50 / 30 / 20 % or anything 1–99. |
| **Stay Awake When Closed** | Opt-in: keep the system running when you shut the laptop, even on battery. |
| **Bulletproof cleanup** | Crash, force-quit, `kill -9` — no orphaned `caffeinate`, no stuck `pmset` state. Ever. |
| **Remembers everything** | Duration, threshold, Launch-at-Login — all restored on next launch. |

<br>

<div align="center">

<img src="https://github.com/user-attachments/assets/bd8a47de-ded4-418b-99e1-ea0eabebf9ae" alt="InsomniKit menu-bar dropdown" width="340" />

<sub>The whole app — one click from the menu bar.</sub>

</div>

---

## Made for the agent era

You kick off a Claude Code / Cursor agent on a long refactor, stand up, and walk to the couch — lid half-closed, laptop under your arm. Ten minutes later the agent's done... except it isn't, because your Mac slept the moment the lid dropped and the run died halfway through.

That's the whole reason this exists.

```
  ▸ Enable → Duration ∞ → close the lid → agent keeps grinding
  ▸ On battery? "Stay Awake When Closed" keeps the run alive while you move
  ▸ Battery Auto-Disable so a forgotten agent doesn't drain you to 0%
```

Long builds, dataset downloads, model pulls, overnight test suites — same story. If it needs to *keep running while you're not looking at it*, InsomniKit is the seatbelt.

---

## Why not just `caffeinate`?

You can. Until:

- You close the terminal — and your Mac sleeps mid-render.
- You forget it's running — and your battery drains overnight.
- You wanted it to stop after the build finished — but it didn't.

InsomniKit is the same IOKit assertion, wrapped in two clicks, with a timer, a battery guard, and cleanup that *actually* runs no matter how the app dies.

---

## How to use it

| You want to…                              | Do this                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Let an AI agent run while you walk away    | **Enable** → **Duration → ∞** → close the laptop (plug in, or use **Stay Awake When Closed**) |
| Stay awake for a long build / download    | **Enable** → **Duration → 1h** (or 2h)                                 |
| Watch something without the screen locking| **Enable** → **Duration → ∞**                                          |
| Auto-stop when the battery gets low       | **Battery Auto-Disable → ≤ 30%**                                       |
| Use a value the presets don't cover       | **Duration → Custom…** (1–1440 min) · **Battery Auto-Disable → Custom…** (1–99 %) |
| Stop right now                            | **Disable** — or just **Quit**                                         |

The menu always shows your current custom value (`Custom: 47 minutes`) so you're never guessing.

---

## Updating

```bash
git pull && pnpm install && pnpm run install:app
```

Same command as install. It quits the running app, rebuilds, reinstalls, relaunches — and your settings carry over untouched.

<details>
<summary><b>What <code>install:app</code> actually does</b></summary>

<br>

1. Gracefully quits any running InsomniKit (SIGKILLs stragglers).
2. Builds for your architecture only (`electron-builder --mac --dir`) — fast, no `.dmg`.
3. Moves the `.app` to `/Applications` — or `~/Applications` on managed Macs where `/Applications` isn't writable.
4. Strips `com.apple.quarantine` so Gatekeeper doesn't block the unsigned bundle.
5. Launches it.

</details>

---

## About closing the lid

This one trips up everyone, so here's the truth:

> **Closing the lid always turns off the screen.** That's hardware — the display is physically covered. *No* software (not InsomniKit, not `caffeinate`, not `pmset`) can keep it lit.

The real question is whether the **system** keeps running:

| Power source                          | Lid closed → sleeps? | Reality                                                                 |
| -------------------------------------- | :------------------: | ----------------------------------------------------------------------- |
| **AC** + InsomniKit active             |          No          | Screen off, but downloads / builds / sync keep running.                 |
| **Battery** + InsomniKit active        |       **Yes**        | macOS forces sleep when you close it. `caffeinate -s` is AC-only. The menu warns you: `⚠︎ Sleeps when closed on battery`. |
| **AC + external display**              |   No (clamshell)     | Native macOS clamshell mode — InsomniKit isn't even needed.             |

**TL;DR** — On AC, just close the laptop; your work continues. On battery, plug in first — *or* turn on **Stay Awake When Closed**.

<details>
<summary><b>Stay Awake When Closed — for battery + lid-shut (advanced, opt-in)</b></summary>

<br>

Need the system awake with the laptop closed **on battery**? InsomniKit can flip `pmset -a disablesleep 1` for you. Menu → **Stay Awake When Closed → Turn on…**

**What happens**

- macOS shows a native password sheet — enter your admin password.
- The setting is **system-wide** — every app sees it.
- It's remembered: the next launch adopts the state silently, no second prompt.
- Turn it off from the same submenu (one more password sheet, then reverted).

**What it does *not* do**

- It can't keep the screen on with the lid shut — nothing can.
- It can't override macOS thermal limits — a too-hot closed Mac still sleeps for safety.
- It doesn't auto-revert on quit. Quit with it on and the system stays that way until you relaunch and toggle off — or run `sudo pmset -a disablesleep 0` yourself.

</details>

---

## For developers

```bash
pnpm install
pnpm run dev      # tsc + electron — rerun the same command to hot-relaunch
```

| Script                  | Does                                                      |
| ----------------------- | --------------------------------------------------------- |
| `pnpm run dev`          | Build + launch from source                                |
| `pnpm run install:app`  | Build + install to `/Applications` + launch               |
| `pnpm run dist`         | Full `.dmg` + `.zip` for arm64 & x64 in `release/`        |
| `pnpm run lint`         | Type-check only                                           |

No code signing, no notarization — this is open source meant to be cloned and built locally. Sign it yourself if you want to ship it.

**Stack:** Electron · TypeScript · zero runtime dependencies. The whole thing is `caffeinate` / `pmset` / `osascript` orchestrated from the main process — no renderer, no framework.

---

## Roadmap

- [ ] Strategy picker — choose `caffeinate` vs `pmset` from the menu
- [ ] AC-power-only mode
- [ ] External-display detection
- [ ] Activity-based wake lock

## Built with Claude Code

InsomniKit was built collaboratively with [Claude Code](https://claude.com/claude-code) — a human shapes the direction and reviews every PR; the agent writes most of the code. The project is also a small experiment in this style of development, so real-world feedback genuinely helps. If you spot something that could be better, an issue or PR is very welcome.

---

<div align="center">

**MIT** — do whatever you want.

<sub>Built because <code>caffeinate &amp;</code> in a terminal tab deserved better.</sub>

</div>
