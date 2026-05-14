import { app } from "electron";
import { createLogger } from "./logger";

const log = createLogger("cleanup");

/**
 * Install process-level safety nets so caffeinate and pmset are
 * restored even when Electron's normal shutdown path doesn't run.
 *
 * Why every signal:
 * - SIGINT: Ctrl-C in dev
 * - SIGTERM: orderly OS shutdown / `kill <pid>`
 * - SIGHUP: terminal closed while detached
 * - uncaughtException / unhandledRejection: bugs in our own code
 * - 'exit': last-resort sync hook before the process is gone
 *
 * `cleanup` MUST be idempotent — multiple signals can fire in quick
 * succession (e.g. force quit) and we don't want double-toggles or
 * double-spawns of pmset.
 */
export function installCleanupHandlers(cleanup: () => void): void {
  let ran = false;
  const safeCleanup = (reason: string): void => {
    if (ran) return;
    ran = true;
    log.info("cleanup running", { reason });
    try {
      cleanup();
    } catch (err) {
      // Last-line-of-defense: swallow so we can still exit.
      log.error("cleanup threw", err);
    }
  };

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const sig of signals) {
    process.on(sig, () => {
      safeCleanup(sig);
      // Let Electron tear down gracefully; if it refuses, fall back to
      // a hard exit after a short grace period so we don't hang.
      try {
        app.quit();
      } catch {
        /* ignore */
      }
      setTimeout(() => process.exit(0), 1500).unref?.();
    });
  }

  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", err);
    safeCleanup("uncaughtException");
    setTimeout(() => process.exit(1), 500).unref?.();
  });

  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", reason);
    // We don't exit on unhandled rejections — they're often async noise
    // (e.g. a transient pmset failure) and the user shouldn't lose
    // their session over one. But we DO run cleanup if it cascades
    // into an uncaughtException afterwards.
  });

  // Truly last chance — must be synchronous, no async I/O survives this hook.
  process.on("exit", () => {
    safeCleanup("exit");
  });
}
