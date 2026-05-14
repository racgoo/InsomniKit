import { app } from "electron";
import { BatteryMonitor } from "./services/battery";
import { SleepManager } from "./services/sleep";
import { TimerManager } from "./services/timer";
import { Store } from "./state";
import { TrayController } from "./tray";
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
const timer = new TimerManager(store);
const battery = new BatteryMonitor(store);
const tray = new TrayController(store, sleep, timer, battery);

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
  });
});

app.whenReady().then(() => {
  log.info("ready", { platform: process.platform, arch: process.arch });
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
  sleep.restoreOnExit();
});
