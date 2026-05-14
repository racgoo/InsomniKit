import { app } from "electron";
import { BatteryMonitor } from "./services/battery";
import {
  getLaunchAtLogin,
  setLaunchAtLogin,
} from "./services/launchAtLogin";
import { SleepManager } from "./services/sleep";
import { TimerManager } from "./services/timer";
import { Store, attachPersistence, loadSettings } from "./state";
import { TrayController } from "./tray";
import { installCleanupHandlers } from "./utils/cleanup";
import { rootLogger } from "./utils/logger";

const log = rootLogger.child("main");

if (process.platform === "darwin" && app.dock) {
  app.dock.hide();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Hydrate from disk BEFORE constructing the store so SleepManager picks
// the user's preferred strategy on first use. Settings are written
// back via `attachPersistence` on every store change.
const persisted = loadSettings();
const store = new Store(persisted);

// Reconcile launchAtLogin with the OS — the user may have toggled it
// off in System Settings while we weren't running.
store.setLaunchAtLogin(getLaunchAtLogin());

const sleep = new SleepManager(store);
const timer = new TimerManager(store);
const battery = new BatteryMonitor(store);
const tray = new TrayController(store, sleep, timer, battery);
const detachPersistence = attachPersistence(store);

// Crash safety — restore caffeinate / pmset on every conceivable exit
// path. Installed BEFORE anything else can throw on startup.
installCleanupHandlers(() => {
  sleep.restoreOnExit();
});

timer.on("expired", () => {
  log.info("auto-disable: timer expired");
  void sleep.disable();
});

battery.on("thresholdHit", ({ percent, threshold }) => {
  log.info("auto-disable: battery threshold hit", { percent, threshold });
  void sleep.disable();
});

store.on("change", (next) => {
  log.debug("state changed", {
    active: next.active,
    strategy: next.strategy,
    duration: next.duration,
    threshold: next.batteryThreshold,
    launchAtLogin: next.launchAtLogin,
  });
});

app.whenReady().then(() => {
  log.info("ready", { platform: process.platform, arch: process.arch });
  // If persisted settings include launchAtLogin=true but the OS
  // disagrees, re-apply (handles fresh-install + first toggle).
  if (persisted.launchAtLogin && !getLaunchAtLogin()) {
    setLaunchAtLogin(true);
  }
  tray.start();
  battery.start();
});

app.on("window-all-closed", (event: Electron.Event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  tray.stop();
  battery.stop();
  timer.cancel();
  detachPersistence();
  sleep.restoreOnExit();
});
