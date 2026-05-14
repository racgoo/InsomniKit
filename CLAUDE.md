# Claude rules for InsomniKit

Project conventions for any AI agent working in this repo.

## Versioning & PRs

- **Every PR bumps the minor version by 1** in `package.json` (e.g. `1.0.0` → `1.1.0` → `1.2.0`).
  Include the version bump in the same PR as the change.
- One logical change per PR. Branch → commit → push → open PR → squash-merge → delete branch.
- Verify before merging: `pnpm run lint` and a build must pass.

## Workflow

- Default package manager in examples is `pnpm`, but scripts must stay package-manager agnostic
  (no `npm run …` calls inside `package.json` scripts).
- Run Electron in dev with `ELECTRON_RUN_AS_NODE` unset — the `dev` / `start` scripts already handle this.

## Architecture invariants

- Tray-only app: no Dock icon, no windows. UI is the Electron `Menu` API only.
- Central `Store` is the single source of truth; services mutate it via typed setters and the
  tray re-renders on `change`.
- Every exit path (SIGINT/SIGTERM/SIGHUP/uncaughtException/before-quit) must restore system state —
  no orphaned `caffeinate`, no stuck `pmset disablesleep`.
- Reading child-process stdout/stderr: wait for the `close` event, not `exit` (exit can fire before
  stdio is fully drained).
