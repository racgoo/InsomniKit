import { ChildProcess, spawn, spawnSync } from "child_process";
import { createLogger } from "../../utils/logger";
import { SleepStrategy } from "./strategy";

const log = createLogger("sleep:caffeinate");

/**
 * caffeinate-based sleep prevention.
 *
 * Why these flags:
 * - `-d` prevents display sleep
 * - `-i` prevents idle sleep
 * - `-m` prevents disk idle sleep
 * - `-s` prevents system sleep on AC power (closest analogue to what
 *   the Insomniac UI promises)
 *
 * We intentionally skip `-w <pid>` since we own the lifecycle ourselves
 * — if Electron crashes, `restoreOnExit()` + the SIGTERM handler in
 * Step 6 will reap the process.
 *
 * Zombie prevention:
 * - We never `unref()` the child, so the parent stays attached until
 *   `disable()` or process exit.
 * - On `disable()` we send SIGTERM, then verify exit; if a stray
 *   caffeinate has somehow outlived us, the sync `restoreOnExit()` uses
 *   `pkill -P` to clean up our own children only (never global).
 */
export class CaffeinateStrategy implements SleepStrategy {
  readonly kind = "caffeinate" as const;
  private child: ChildProcess | null = null;

  isEnabled(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  async enable(): Promise<void> {
    if (this.isEnabled()) {
      log.debug("already enabled, skipping spawn");
      return;
    }
    // Clean up any tracked-but-dead handle before respawning.
    this.child = null;

    const proc = spawn("/usr/bin/caffeinate", ["-dims"], {
      stdio: "ignore",
      detached: false,
    });

    proc.on("error", (err) => {
      log.error("caffeinate spawn error:", err);
      this.child = null;
    });
    proc.on("exit", (code, signal) => {
      log.info("caffeinate exited", { code, signal });
      if (this.child === proc) this.child = null;
    });

    this.child = proc;
    log.info("caffeinate spawned", { pid: proc.pid });
  }

  async disable(): Promise<void> {
    const proc = this.child;
    if (!proc) return;

    this.child = null;
    if (proc.exitCode !== null) return; // Already gone.

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      proc.once("exit", done);
      proc.kill("SIGTERM");

      // Escalate to SIGKILL if caffeinate refuses to exit. caffeinate
      // is well-behaved, so this is purely defensive.
      const timer = setTimeout(() => {
        if (proc.exitCode === null) {
          log.warn("caffeinate didn't exit on SIGTERM, sending SIGKILL");
          try {
            proc.kill("SIGKILL");
          } catch {
            // Already gone between the check and the kill — ignore.
          }
        }
      }, 1500);
    });
  }

  /**
   * Sync, fire-and-forget kill for crash / signal paths. Must not throw
   * — process is already on its way out.
   */
  restoreOnExit(): void {
    const proc = this.child;
    if (!proc || proc.exitCode !== null) return;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    // Belt-and-braces: also pkill anything we spawned in case the handle
    // got detached somehow. Scoped to OUR pid as parent — never global.
    try {
      spawnSync("/usr/bin/pkill", ["-TERM", "-P", String(process.pid), "caffeinate"], {
        stdio: "ignore",
      });
    } catch {
      /* ignore */
    }
    this.child = null;
  }
}
