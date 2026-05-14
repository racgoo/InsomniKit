import { app } from "electron";
import { SleepManager } from "./services/sleep";
import { Store } from "./state";
import { rootLogger } from "./utils/logger";

const log = rootLogger.child("main");

if (process.platform === "darwin" && app.dock) {
  app.dock.hide();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const store = new Store();
const sleep = new SleepManager(store);

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
  // Step 5 wires the tray here; Step 4 starts the battery monitor and
  // timer manager. SleepManager is already instantiated so they can
  // call sleep.enable()/disable() once wired up.
});

app.on("window-all-closed", (event: Electron.Event) => {
  event.preventDefault();
});

// Final restore safety net — Step 6 replaces this with the full set of
// SIGINT/SIGTERM/uncaughtException handlers. Keeping a minimal hook now
// means a Ctrl-C in dev already kills caffeinate cleanly.
app.on("before-quit", () => {
  sleep.restoreOnExit();
});
