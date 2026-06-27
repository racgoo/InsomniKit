# Claude rules for InsomniKit

Project conventions for any AI agent working in this repo.

## Versioning & PRs

- **Every PR bumps the patch version by 1** in `package.json` (e.g. `1.1.0` → `1.1.1` → `1.1.2`).
  Include the version bump in the same PR as the change.
- The **major and minor** components are bumped *only* by the maintainer editing them directly —
  an agent must never touch them.
- One logical change per PR. Branch → commit → push → open PR → squash-merge → delete branch.
- Verify before merging: `pnpm run lint` and a build must pass.

## Workflow

- Default package manager in examples is `pnpm`, but scripts must stay package-manager agnostic
  (no `npm run …` calls inside `package.json` scripts).
- Run Electron in dev with `ELECTRON_RUN_AS_NODE` unset — the `dev` / `start` scripts already handle this.

## Architecture invariants

- Tray-first app: it runs with no window open and the Dock icon hidden (`LSUIElement`). The tray
  `Menu` is always available. Two *optional* surfaces exist on top — a main window and a floating
  desktop widget — created lazily by `WindowManager`. The Dock icon is shown **only while the main
  window is visible**, then hidden again when it closes.
- Central `Store` is the single source of truth. All UI surfaces are *views*: the tray re-renders on
  `change`; the window/widget renderers are context-isolated and never touch services directly —
  the main process builds a fully pre-formatted `ViewModel` (`core/viewModel.ts`, same i18n +
  `tray/format.ts` helpers as the menu) and pushes it over IPC, and they send back coarse
  `ActionMessage`s handled through `core/actions.ts` (`AppActions`).
- Keep formatting/i18n/service logic in the main process — renderers stay dumb. Window/widget UI
  strings live in `i18n.ts`'s `WINDOW_LABELS` (one row per locale), parallel to the tray `Messages`.
- Renderer scripts are plain `<script>` files (not ES modules); they reach the main process only via
  the `window.insomnikit` bridge in `preload/`. Renderer HTML/CSS is copied into `dist/` by
  `scripts/copy-renderer.js` (the `build`/`start`/`dev`/`dist` scripts run it after `tsc`).
- Every exit path (SIGINT/SIGTERM/SIGHUP/uncaughtException/before-quit) must restore system state —
  no orphaned `caffeinate`, no stuck `pmset disablesleep`.
- Reading child-process stdout/stderr: wait for the `close` event, not `exit` (exit can fire before
  stdio is fully drained).
