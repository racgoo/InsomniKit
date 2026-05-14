import { spawn, spawnSync } from "child_process";
import { Emitter } from "../utils/emitter";
import { createLogger } from "../utils/logger";

const log = createLogger("lid-closed");

/**
 * Lid-Closed Mode — uses `pmset -c disablesleep` so the system keeps
 * running even when the lid is shut on battery.
 *
 * Why this lives outside the SleepStrategy interface:
 * - SleepStrategy switches a single "preventing sleep" knob. Lid-Closed
 *   is an *additional* layer that can stack on top of caffeinate. Users
 *   typically want both: caffeinate for the per-process timer +
 *   battery-threshold logic, and `pmset disablesleep` purely to defeat
 *   the lid-close hardware path.
 * - It requires admin privileges, which the caffeinate strategy never
 *   does. Mixing the two would punish every caffeinate toggle with a
 *   password prompt.
 *
 * Privilege flow:
 *   We never run sudo directly. Instead we ask macOS via
 *   `osascript … with administrator privileges`, which shows the
 *   standard password sheet attributed to InsomniKit. The user can
 *   cancel — we treat that as "didn't change anything" and rely on the
 *   caller to keep the persisted state consistent.
 *
 * State source of truth:
 *   `this.active` reflects what we last successfully wrote. The store's
 *   `lidClosedMode` is the *user intent*. The tray reconciles by
 *   reading both and only persists `true` once a write succeeded.
 *
 * Cleanup safety:
 *   `restoreOnExit()` does a SYNCHRONOUS osascript call so the
 *   before-quit handler can wait for it. If the user dismisses the
 *   sheet at quit time, the flag stays set — we log loudly and the
 *   user can revert with `sudo pmset -c disablesleep 0` or by
 *   relaunching the app.
 */
export type LidClosedEvents = {
  changed: { active: boolean };
};

export class LidClosedService extends Emitter<LidClosedEvents> {
  private active = false;
  /** True while an enable/disable admin prompt is in flight. */
  private busy = false;

  isActive(): boolean {
    return this.active;
  }

  /**
   * Read the current system value of `disablesleep` (no admin needed
   * for read). Used on startup to reconcile our state with what the
   * system actually thinks.
   */
  async readSystemValue(): Promise<0 | 1> {
    return new Promise((resolve) => {
      const proc = spawn("/usr/bin/pmset", ["-g"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      let settled = false;
      const settle = (v: 0 | 1) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      proc.stdout.on("data", (d) => (out += d.toString()));
      // `close`, not `exit` — wait for stdout to be fully drained.
      proc.on("close", () => {
        const m = out.match(/SleepDisabled\s+(\d)/);
        settle(m && m[1] === "1" ? 1 : 0);
      });
      proc.on("error", () => settle(0));
    });
  }

  /**
   * Adopt the current system state on startup without prompting.
   * If pmset already says disablesleep=1 (e.g. user enabled it via
   * another tool, or we set it pre-crash and the system rebooted with
   * it still set), treat ourselves as active so the UI is honest.
   */
  async syncFromSystem(): Promise<boolean> {
    const current = await this.readSystemValue();
    this.active = current === 1;
    return this.active;
  }

  async enable(): Promise<void> {
    if (this.active) return;
    // Guard against a second prompt — e.g. the startup reconcile and a
    // user menu click both calling enable() before the first sheet
    // returns. Without this the user gets two stacked password sheets.
    if (this.busy) {
      throw new Error("An admin authorization is already in progress");
    }
    this.busy = true;
    try {
      const ok = await this.runWithAdmin(
        "/usr/bin/pmset -c disablesleep 1",
        "InsomniKit needs admin access to keep your Mac awake when the lid is closed.",
      );
      if (!ok) {
        throw new Error("Admin authorization was cancelled or failed");
      }
      this.active = true;
      log.info("enabled (pmset disablesleep=1)");
      this.emit("changed", { active: true });
    } finally {
      this.busy = false;
    }
  }

  async disable(): Promise<void> {
    if (!this.active) return;
    if (this.busy) {
      throw new Error("An admin authorization is already in progress");
    }
    this.busy = true;
    try {
      const ok = await this.runWithAdmin(
        "/usr/bin/pmset -c disablesleep 0",
        "InsomniKit needs admin access to restore the default sleep behavior.",
      );
      if (!ok) {
        throw new Error("Admin authorization was cancelled or failed");
      }
      this.active = false;
      log.info("disabled (pmset disablesleep=0)");
      this.emit("changed", { active: false });
    } finally {
      this.busy = false;
    }
  }

  /**
   * Synchronous restore for the before-quit path. Blocks until osascript
   * exits (or the 60s timeout) so the quit sequence can actually wait
   * for the user to enter their password. Best-effort: if the user
   * cancels, the flag stays set — we log it and the user can revert
   * on next launch.
   */
  restoreOnExit(): void {
    if (!this.active) return;
    const script = osascriptScript(
      "/usr/bin/pmset -c disablesleep 0",
      "InsomniKit is quitting and needs admin access to restore the default sleep behavior.",
    );
    try {
      const res = spawnSync("/usr/bin/osascript", ["-e", script], {
        stdio: "ignore",
        timeout: 60_000,
      });
      if (res.status === 0) {
        this.active = false;
        log.info("restored on exit");
      } else {
        log.warn(
          "exit restore was cancelled — disablesleep is still set. " +
            "Run `sudo pmset -c disablesleep 0` to revert, or relaunch InsomniKit.",
        );
      }
    } catch (err) {
      log.warn("exit restore threw", err);
    }
  }

  private async runWithAdmin(cmd: string, prompt: string): Promise<boolean> {
    return new Promise((resolve) => {
      const script = osascriptScript(cmd, prompt);
      const proc = spawn("/usr/bin/osascript", ["-e", script], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      // `close`, not `exit` — guarantees stderr is fully drained.
      proc.on("close", (code) => {
        if (code !== 0) {
          // osascript exits non-zero when the user cancels. Log the
          // reason for `-128` (user-cancelled) vs other failures so we
          // can debug PII-free.
          log.info("admin auth declined or failed", {
            code,
            stderr: stderr.trim(),
          });
        }
        settle(code === 0);
      });
      proc.on("error", (err) => {
        log.error("osascript spawn failed", err);
        settle(false);
      });
    });
  }
}

/**
 * Build the AppleScript one-liner. Escapes embedded double-quotes
 * defensively even though we currently only pass hardcoded commands.
 */
function osascriptScript(cmd: string, prompt: string): string {
  const escapedCmd = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `do shell script "${escapedCmd}" with prompt "${escapedPrompt}" with administrator privileges`;
}
