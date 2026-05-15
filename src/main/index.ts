import { app, powerMonitor } from "electron";
import { initI18n } from "./i18n";
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

// launchAtLogin: the OS↔store reconcile happens in whenReady() below.
// Doing it here would conflict with the "re-apply persisted intent"
// step that also runs in whenReady — the OS would get flipped on but
// the store would already have been synced to the old (off) value,
// leaving them inconsistent. The store keeps the persisted value until
// whenReady decides what's authoritative.

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

  // Resolve the catalog before the tray reads any labels. The user's
  // saved override (or "system") wins; `app.getLocale()` is only
  // reliable after whenReady fires, so this can't happen earlier.
  initI18n(store.get().locale);

  // Hidden-tray mode: re-launching InsomniKit (Spotlight, Launchpad,
  // another `open -a InsomniKit`) is the documented way to bring the
  // icon back. The OS dispatches the second-instance event to the
  // already-running primary — we reset the flag and restart the tray.
  app.on("second-instance", () => {
    if (store.get().hideTrayIcon) {
      log.info("second-instance: unhiding tray");
      store.setHideTrayIcon(false);
      tray.start();
    }
  });

  // launchAtLogin reconcile, in order:
  // 1. If the user's persisted intent was "on" but the OS forgot (e.g.
  //    they toggled the login item off in System Settings), re-apply.
  // 2. Then sync the store to whatever the OS now actually says. After
  //    step 1, the OS reflects the user's intent, so this is consistent.
  if (persisted.launchAtLogin && !getLaunchAtLogin()) {
    setLaunchAtLogin(true);
  }
  store.setLaunchAtLogin(getLaunchAtLogin());

  // Respect the persisted "hidden tray" preference. Services still
  // run regardless — only the menu-bar icon is suppressed.
  if (!store.get().hideTrayIcon) {
    tray.start();
  } else {
    log.info("tray suppressed (hideTrayIcon=true). Relaunch InsomniKit to bring it back.");
  }
  battery.start();

  // The 60s polling cadence leaves the menu showing stale battery info
  // for up to a minute after a power-source change ("≈ 1h 5m to full"
  // stuck on screen after the user unplugs). Hook Electron's
  // powerMonitor to refresh immediately when AC is plugged in or
  // removed. A follow-up refresh ~10s later catches pmset's "(no
  // estimate)" → real-number transition while macOS recalibrates,
  // without us having to crank the regular poll interval.
  // The follow-up timer is single-slot: rapid plug/unplug (or the OS
  // bouncing the event) would otherwise stack a fresh 10s timer on
  // every transition, spawning a burst of `pmset` polls later. We
  // keep only the most recent one.
  let powerFollowUp: NodeJS.Timeout | null = null;
  const refreshOnPowerChange = (reason: "on-ac" | "on-battery"): void => {
    log.info("power source changed", { reason });
    void battery.refresh();
    if (powerFollowUp) clearTimeout(powerFollowUp);
    powerFollowUp = setTimeout(() => {
      powerFollowUp = null;
      void battery.refresh();
    }, 10_000);
    powerFollowUp.unref?.();
  };
  powerMonitor.on("on-ac", () => refreshOnPowerChange("on-ac"));
  powerMonitor.on("on-battery", () => refreshOnPowerChange("on-battery"));

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
