import { app } from "electron";
import { BatteryMonitor } from "./services/battery";
import {
  getLaunchAtLogin,
  setLaunchAtLogin,
} from "./services/launchAtLogin";
import { LidClosedService } from "./services/lidClosed";
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

// A primary instance already running? Bail immediately — before we
// construct any services, register exit handlers, or attach the
// persistence writer. Otherwise this doomed second instance would
// race the primary on settings.json during its own before-quit.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const persisted = loadSettings();
const store = new Store(persisted);

// Reconcile launchAtLogin with the OS — the user may have toggled it
// off in System Settings while we weren't running.
store.setLaunchAtLogin(getLaunchAtLogin());

const sleep = new SleepManager(store);
const timer = new TimerManager(store);
const battery = new BatteryMonitor(store);
const lidClosed = new LidClosedService();
const tray = new TrayController(store, sleep, timer, battery, lidClosed);
const detachPersistence = attachPersistence(store);

// Crash safety — restore caffeinate / pmset on every conceivable exit
// path. Installed BEFORE anything else can throw on startup.
//
// Note: we deliberately do NOT call lidClosed.restoreOnExit() from the
// signal-handler / crash path. Lid-Closed Mode is an explicit, opt-in,
// admin-authenticated session — if the app dies mid-session, the user
// asked for the pmset state and our next launch will adopt it without
// prompting. Forcing a password sheet during SIGINT/SIGTERM is hostile.
installCleanupHandlers(() => {
  sleep.restoreOnExit();
});

// If sleep prevention dies on its own (caffeinate killed externally,
// crashed), SleepManager already corrected the store's `active` flag —
// here we also cancel the now-meaningless countdown timer.
sleep.setOnUnexpectedStop(() => {
  log.warn("sleep prevention stopped unexpectedly — cancelling timer");
  timer.cancel();
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
    lidClosedMode: next.lidClosedMode,
  });
});

app.whenReady().then(async () => {
  log.info("ready", { platform: process.platform, arch: process.arch });
  if (persisted.launchAtLogin && !getLaunchAtLogin()) {
    setLaunchAtLogin(true);
  }
  tray.start();
  battery.start();

  // Lid-Closed Mode reconcile:
  // 1. Sync from current system state (no prompt).
  // 2. If user intent says it should be on and system isn't, prompt once.
  // 3. If user intent says off but system has it on (leftover from
  //    crash or external tooling), don't touch — just reflect reality.
  await lidClosed.syncFromSystem();
  const intent = store.get().lidClosedMode;
  if (intent && !lidClosed.isActive()) {
    log.info("re-applying Lid-Closed Mode from persisted intent");
    try {
      await lidClosed.enable();
    } catch (err) {
      log.warn(
        "could not re-apply Lid-Closed Mode at startup; user cancelled or denied",
        err,
      );
      store.setLidClosedMode(false);
    }
  } else if (!intent && lidClosed.isActive()) {
    // System has disablesleep=1 from somewhere we didn't set — adopt
    // the state silently so the UI doesn't lie, but DON'T try to
    // revert (might be another app or the user's manual setting).
    log.warn(
      "system has disablesleep=1 but no persisted intent — adopting as-is",
    );
    store.setLidClosedMode(true);
  }
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
  // Lid-Closed Mode persists across quit by design: the pmset flag
  // stays set, the user's intent stays in settings.json, and the
  // next launch adopts the state silently via syncFromSystem(). If
  // they want it off, they explicitly toggle off in the menu (which
  // runs the disable() prompt and persists intent=false).
});
