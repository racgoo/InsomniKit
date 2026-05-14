import { spawn } from "child_process";
import { createLogger } from "./logger";

const log = createLogger("prompt");

export interface PromptOptions {
  title: string;
  message: string;
  defaultValue?: string;
}

/**
 * Show a native macOS text-input dialog via `osascript`.
 *
 * Why osascript instead of a BrowserWindow:
 * - InsomniKit is intentionally window-less — a BrowserWindow just for
 *   a one-line input would mean creating a renderer process, an HTML
 *   page, IPC, focus handling, and Esc-to-cancel logic. osascript's
 *   `display dialog … default answer …` gives all of that for free
 *   and renders as a native sheet.
 * - The dialog is attributed to "osascript" by default; we work around
 *   the inability to customize this by putting the app name in the
 *   title bar text.
 *
 * Resolves to the user's entered string on OK, or `null` on cancel /
 * error. Never throws — the menu code can `if (result === null) return`.
 */
export async function promptText(opts: PromptOptions): Promise<string | null> {
  const message = escapeAppleScript(opts.message);
  const def = escapeAppleScript(opts.defaultValue ?? "");
  const title = escapeAppleScript(opts.title);
  const script =
    `display dialog "${message}" default answer "${def}" ` +
    `with title "${title}" buttons {"Cancel", "OK"} default button "OK" cancel button "Cancel"`;

  return new Promise((resolve) => {
    const proc = spawn("/usr/bin/osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let settled = false;
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => {
      log.error("osascript spawn failed", e);
      settle(null);
    });
    // `close` (not `exit`) — guarantees stdout/stderr are fully drained
    // before we parse them. `exit` can fire with data still buffered.
    proc.on("close", (code) => {
      if (code !== 0) {
        // -128 = "user cancelled" — expected, don't log as error.
        if (!/User cancel(l|)ed/i.test(err)) {
          log.warn("osascript returned non-zero", { code, stderr: err.trim() });
        }
        return settle(null);
      }
      // Format: "button returned:OK, text returned:60\n"
      // `.` doesn't match \n by default so this captures up to the EOL.
      const m = out.match(/text returned:(.*)/);
      settle(m ? m[1].trim() : null);
    });
  });
}

/** AppleScript only escapes \\ and " — backslash first, then quotes. */
function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
