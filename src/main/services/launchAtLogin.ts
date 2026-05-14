import { app } from "electron";
import { createLogger } from "../utils/logger";

const log = createLogger("launch-at-login");

/**
 * Thin wrapper over Electron's `app.setLoginItemSettings`.
 *
 * On macOS this uses the SMAppService / login items API under the hood
 * — no extra entitlements, no helper bundle. `openAsHidden` keeps the
 * relaunch true to the menu-bar UX (no flash of a window that doesn't
 * exist anyway).
 *
 * `getLoginItemSettings()` is the source of truth, not the store — the
 * user can disable the item from System Settings without telling us.
 * We reconcile on startup.
 */

export function getLaunchAtLogin(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    log.warn("getLoginItemSettings failed", err);
    return false;
  }
}

export function setLaunchAtLogin(enabled: boolean): void {
  if (process.platform !== "darwin") return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
    log.info("setLoginItemSettings", { enabled });
  } catch (err) {
    log.warn("setLoginItemSettings failed", err);
  }
}
