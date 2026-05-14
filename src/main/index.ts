import { app } from "electron";
import { Store } from "./state";
import { rootLogger } from "./utils/logger";

const log = rootLogger.child("main");

// Insomniac is a tray-only utility — no Dock icon, no windows.
// LSUIElement is also set in electron-builder mac.extendInfo so packaged
// builds match this runtime behavior.
if (process.platform === "darwin" && app.dock) {
  app.dock.hide();
}

// Single instance: prevent two trays from fighting over caffeinate / pmset.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Central store. Services (Step 3+) and the tray (Step 5) attach to this
// single instance so menu state and runtime state can never diverge.
const store = new Store();

store.on("change", (next) => {
  log.debug("state changed", {
    active: next.active,
    strategy: next.strategy,
    duration: next.duration,
    threshold: next.batteryThreshold,
  });
});

app.whenReady().then(() => {
  log.info("ready", { platform: process.platform, arch: process.arch });
  // Subsequent steps wire the tray + services here.
});

app.on("window-all-closed", (event: Electron.Event) => {
  event.preventDefault();
});
