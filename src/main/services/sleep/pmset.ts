import { spawnSync } from "child_process";
import { exec } from "../../utils/exec";
import { createLogger } from "../../utils/logger";
import { SleepStrategy } from "./strategy";

const log = createLogger("sleep:pmset");

/**
 * pmset-based sleep prevention.
 *
 * Why this strategy exists separately from caffeinate:
 *   `pmset -c disablesleep 1` is the only thing that reliably keeps a
 *   MacBook awake with the lid CLOSED (clamshell mode while connected
 *   to AC). caffeinate alone won't survive lid close.
 *
 * Why this is dangerous:
 *   It mutates SYSTEM state, not a per-process flag. If we exit
 *   without restoring it, the user's Mac will never sleep again until
 *   they discover the setting and reverse it manually.
 *
 * Safety design:
 * - We read the original value with `pmset -g custom` BEFORE writing
 *   anything, and store it on the instance.
 * - `enable()` only writes if the original was 0 (we never overwrite a
 *   user who already had disablesleep=1 — we'd lie about restoring it).
 * - `disable()` writes back the original.
 * - `restoreOnExit()` does a SYNCHRONOUS `pmset -c disablesleep <orig>`
 *   so the SIGTERM / SIGINT path doesn't need an event loop tick.
 * - `pmset -c disablesleep` typically requires root. We attempt without
 *   sudo first; if it fails we surface the error and stay disabled so
 *   the user can fall back to caffeinate. We never prompt for sudo from
 *   a menu-bar app.
 */
export class PmsetStrategy implements SleepStrategy {
  readonly kind = "pmset" as const;
  private originalDisableSleep: 0 | 1 | null = null;
  private enabled = false;

  isEnabled(): boolean {
    return this.enabled;
  }

  async enable(): Promise<void> {
    if (this.enabled) return;

    if (this.originalDisableSleep === null) {
      this.originalDisableSleep = await this.readDisableSleep();
      log.info("captured original disablesleep", {
        value: this.originalDisableSleep,
      });
    }

    if (this.originalDisableSleep === 1) {
      // User already had it set — nothing to do, and we must NOT claim
      // ownership, otherwise disable() would clear THEIR setting.
      log.info("disablesleep already 1; leaving as-is");
      this.enabled = true;
      return;
    }

    const res = await exec("/usr/bin/pmset", ["-c", "disablesleep", "1"], {
      timeoutMs: 4_000,
    });
    if (res.code !== 0) {
      log.error("pmset disablesleep 1 failed", {
        code: res.code,
        stderr: res.stderr.trim(),
      });
      throw new Error(
        `pmset disablesleep 1 failed (code ${res.code}). pmset typically requires admin privileges.`,
      );
    }
    this.enabled = true;
    log.info("pmset disablesleep set to 1");
  }

  async disable(): Promise<void> {
    if (!this.enabled) return;
    const target = this.originalDisableSleep ?? 0;
    this.enabled = false;

    if (this.originalDisableSleep === 1) {
      // We never changed it — nothing to restore.
      return;
    }

    const res = await exec(
      "/usr/bin/pmset",
      ["-c", "disablesleep", String(target)],
      { timeoutMs: 4_000 },
    );
    if (res.code !== 0) {
      log.error("pmset disablesleep restore failed", {
        code: res.code,
        stderr: res.stderr.trim(),
      });
    } else {
      log.info("pmset disablesleep restored", { value: target });
    }
  }

  /**
   * Synchronous restore for crash / signal paths. Best-effort: if pmset
   * requires admin and we don't have it, there's nothing we can do here
   * — but we always try.
   */
  restoreOnExit(): void {
    if (!this.enabled || this.originalDisableSleep === 1) {
      this.enabled = false;
      return;
    }
    const target = this.originalDisableSleep ?? 0;
    try {
      spawnSync(
        "/usr/bin/pmset",
        ["-c", "disablesleep", String(target)],
        { stdio: "ignore", timeout: 3_000 },
      );
    } catch {
      /* ignore — we're exiting */
    }
    this.enabled = false;
  }

  /**
   * Parse `pmset -g custom` to extract the AC profile's disablesleep
   * value. Falls back to 0 if anything looks off; we'd rather under-
   * restore than mis-set a flag we don't understand.
   */
  private async readDisableSleep(): Promise<0 | 1> {
    const res = await exec("/usr/bin/pmset", ["-g", "custom"], {
      timeoutMs: 4_000,
    });
    if (res.code !== 0) {
      log.warn("pmset -g custom failed; assuming disablesleep=0", {
        code: res.code,
        stderr: res.stderr.trim(),
      });
      return 0;
    }
    return parseDisableSleep(res.stdout);
  }
}

/**
 * Exported for the unit-style sanity check at the bottom of this file
 * and for future tests. `pmset -g custom` looks roughly like:
 *
 *   AC Power:
 *    System Sleep Timer       10
 *    disablesleep             0
 *    ...
 *   Battery Power:
 *    System Sleep Timer       2
 *    disablesleep             0
 *    ...
 *
 * We only care about the AC Power block because `pmset -c` writes there.
 */
export function parseDisableSleep(output: string): 0 | 1 {
  const lines = output.split(/\r?\n/);
  let inAcBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^AC Power:/i.test(line)) {
      inAcBlock = true;
      continue;
    }
    if (/^Battery Power:/i.test(line) || /^UPS Power:/i.test(line)) {
      inAcBlock = false;
      continue;
    }
    if (!inAcBlock) continue;
    const m = line.match(/^disablesleep\s+(\d+)/i);
    if (m) {
      return m[1] === "1" ? 1 : 0;
    }
  }
  return 0;
}
