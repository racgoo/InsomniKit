import { app, Menu, MenuItem, Tray } from "electron";
import { BatteryMonitor } from "../services/battery";
import { setLaunchAtLogin } from "../services/launchAtLogin";
import { LidClosedService } from "../services/lidClosed";
import { SleepManager } from "../services/sleep";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import {
  BatteryThreshold,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  DURATION_PRESETS,
  Duration,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_MIN_PERCENT,
  THRESHOLD_PRESETS,
  isDurationPreset,
  isThresholdPreset,
  parseDurationInput,
  parseThresholdInput,
} from "../state/types";
import { createLogger } from "../utils/logger";
import { promptText } from "../utils/prompt";
import {
  formatBattery,
  formatBatteryEstimate,
  formatDuration,
  formatPower,
  formatStatusLine,
  formatThresholdLine,
  formatTimerLine,
  formatTrayTitle,
  lidCloseWarning,
} from "./format";
import { getActiveIcon, getInactiveIcon } from "./icons";

const log = createLogger("tray");

/**
 * Owns the macOS menu-bar Tray.
 *
 * Live-update strategy:
 *   The menu is built ONCE in `start()`. After that we only ever
 *   *mutate* properties (`label`, `checked`, `visible`) on the existing
 *   MenuItem instances — never call `setContextMenu` again.
 *
 *   Reason: macOS's native NSMenu freezes when displayed. Calling
 *   `setContextMenu(newMenu)` while the menu is open is a no-op for
 *   the user — they have to close and reopen to see the new menu.
 *   But mutating an existing MenuItem's `.title` / `.state` / `.hidden`
 *   IS reflected live by NSMenu, even with the menu open.
 *
 *   So we maintain stable refs to every dynamic item and tweak their
 *   properties in `applyState()`. Conditional rows (e.g. the battery-
 *   time-remaining line, the on-battery warning) are always present
 *   but toggle `visible`.
 *
 *   `tray.setImage` and `tray.setTitle` are unaffected — they update
 *   live regardless and don't need this dance.
 */
export class TrayController {
  private tray: Tray | null = null;
  private menu: Menu | null = null;
  private tickHandle: NodeJS.Timeout | null = null;
  private disposeStoreListener: (() => void) | null = null;

  // Stable refs to every dynamic item, so `applyState` can mutate them
  // in place. Initialized in createMenu().
  private mi!: {
    status: MenuItem;
    power: MenuItem;
    battery: MenuItem;
    estimate: MenuItem;
    timer: MenuItem;
    threshold: MenuItem;
    warning: MenuItem;
    enableDisable: MenuItem;
    launchAtLogin: MenuItem;
    durationOptions: Map<string, MenuItem>; // keyed by `${minutes}` or "infinite"
    durationCustomShown: MenuItem;
    thresholdOptions: Map<string, MenuItem>; // keyed by `${percent}` or "off"
    thresholdCustomShown: MenuItem;
    lidClosedRoot: MenuItem; // top-level "Stay Awake When Closed: ..." row
    lidClosedStatus: MenuItem; // "Currently: ..." inside the submenu
    lidClosedDescOff: MenuItem[]; // 6 description items shown when OFF
    lidClosedDescOn: MenuItem[]; // 5 description items shown when ON
    lidClosedAction: MenuItem; // "Turn on…" / "Turn off"
  };

  constructor(
    private readonly store: Store,
    private readonly sleep: SleepManager,
    private readonly timer: TimerManager,
    private readonly battery: BatteryMonitor,
    private readonly lidClosed: LidClosedService,
  ) {}

  start(): void {
    if (this.tray) return;
    this.tray = new Tray(getInactiveIcon());
    this.tray.setToolTip("InsomniKit");

    this.menu = this.createMenu();
    this.tray.setContextMenu(this.menu);
    this.applyState();

    // Re-apply on every state change. We never rebuild the menu —
    // applyState mutates properties on the existing MenuItem refs,
    // which macOS reflects even while the menu is open.
    this.disposeStoreListener = this.store.on("change", () =>
      this.applyState(),
    );

    // Tick so the "X remaining" line decrements while the menu is open.
    // 15s is fine — the line displays minutes.
    this.tickHandle = setInterval(() => this.applyState(), 15_000);
    this.tickHandle.unref?.();

    log.info("tray started");
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.disposeStoreListener?.();
    this.disposeStoreListener = null;
    this.tray?.destroy();
    this.tray = null;
    this.menu = null;
  }

  /**
   * Build the menu and every dynamic MenuItem once. Click handlers are
   * bound here so closures capture `this` cleanly. Items keep their
   * roles for the lifetime of the tray.
   */
  private createMenu(): Menu {
    const menu = new Menu();

    menu.append(new MenuItem({ label: "InsomniKit", enabled: false }));
    menu.append(new MenuItem({ type: "separator" }));

    const status = new MenuItem({ label: "", enabled: false });
    const power = new MenuItem({ label: "", enabled: false });
    const battery = new MenuItem({ label: "", enabled: false });
    const estimate = new MenuItem({ label: "", enabled: false, visible: false });
    const timer = new MenuItem({ label: "", enabled: false });
    const threshold = new MenuItem({ label: "", enabled: false });
    const warning = new MenuItem({ label: "", enabled: false, visible: false });
    [status, power, battery, estimate, timer, threshold, warning].forEach((m) =>
      menu.append(m),
    );

    menu.append(new MenuItem({ type: "separator" }));

    const enableDisable = new MenuItem({
      label: "Enable",
      click: () => void this.handleToggle(),
    });
    menu.append(enableDisable);

    menu.append(new MenuItem({ type: "separator" }));

    // Duration submenu
    const durationOptions = new Map<string, MenuItem>();
    const durationSubmenu = new Menu();
    for (const opt of DURATION_PRESETS) {
      const mi = new MenuItem({
        label: opt.label,
        type: "radio",
        checked: false,
        click: () => this.handleDuration(opt.minutes),
      });
      durationOptions.set(durationKey(opt.minutes), mi);
      durationSubmenu.append(mi);
    }
    durationSubmenu.append(new MenuItem({ type: "separator" }));
    const durationCustomShown = new MenuItem({
      label: "",
      type: "radio",
      checked: true,
      enabled: false,
      visible: false,
    });
    durationSubmenu.append(durationCustomShown);
    durationSubmenu.append(
      new MenuItem({
        label: "Custom…",
        click: () => void this.handleDurationCustom(),
      }),
    );
    menu.append(
      new MenuItem({ label: "Duration", submenu: durationSubmenu }),
    );

    // Battery threshold submenu
    const thresholdOptions = new Map<string, MenuItem>();
    const thresholdSubmenu = new Menu();
    for (const opt of THRESHOLD_PRESETS) {
      const mi = new MenuItem({
        label: opt.label,
        type: "radio",
        checked: false,
        click: () => this.handleThreshold(opt.percent),
      });
      thresholdOptions.set(thresholdKey(opt.percent), mi);
      thresholdSubmenu.append(mi);
    }
    thresholdSubmenu.append(new MenuItem({ type: "separator" }));
    const thresholdCustomShown = new MenuItem({
      label: "",
      type: "radio",
      checked: true,
      enabled: false,
      visible: false,
    });
    thresholdSubmenu.append(thresholdCustomShown);
    thresholdSubmenu.append(
      new MenuItem({
        label: "Custom…",
        click: () => void this.handleThresholdCustom(),
      }),
    );
    menu.append(
      new MenuItem({
        label: "Battery Auto-Disable",
        submenu: thresholdSubmenu,
      }),
    );

    // Stay Awake When Closed submenu — see comment in this file's
    // header about why all description rows are always present and
    // toggled via .visible rather than spliced in.
    const lidClosedSubmenu = new Menu();
    const lidClosedStatus = new MenuItem({ label: "", enabled: false });
    lidClosedSubmenu.append(lidClosedStatus);
    lidClosedSubmenu.append(new MenuItem({ type: "separator" }));

    const lidClosedDescOff: MenuItem[] = [
      new MenuItem({
        label: "Keeps your Mac awake when you close",
        enabled: false,
      }),
      new MenuItem({ label: "the laptop — even on battery.", enabled: false }),
      new MenuItem({ type: "separator" }),
      new MenuItem({
        label: "macOS normally sleeps when closed.",
        enabled: false,
      }),
      new MenuItem({
        label: "This overrides that, system-wide.",
        enabled: false,
      }),
      new MenuItem({
        label: "You'll be asked for your password.",
        enabled: false,
      }),
    ];
    const lidClosedDescOn: MenuItem[] = [
      new MenuItem({
        label: "Your Mac stays awake even when you",
        enabled: false,
      }),
      new MenuItem({
        label: "close it — including on battery.",
        enabled: false,
      }),
      new MenuItem({ type: "separator" }),
      new MenuItem({
        label: "Note: this persists across app quit.",
        enabled: false,
      }),
      new MenuItem({
        label: "Turn it off here when you're done.",
        enabled: false,
      }),
    ];
    for (const m of lidClosedDescOff) lidClosedSubmenu.append(m);
    for (const m of lidClosedDescOn) lidClosedSubmenu.append(m);

    lidClosedSubmenu.append(new MenuItem({ type: "separator" }));
    const lidClosedAction = new MenuItem({
      label: "Turn on…",
      click: () => void this.handleLidClosedToggle(),
    });
    lidClosedSubmenu.append(lidClosedAction);

    const lidClosedRoot = new MenuItem({
      label: "Stay Awake When Closed: Off",
      submenu: lidClosedSubmenu,
    });
    menu.append(lidClosedRoot);

    menu.append(new MenuItem({ type: "separator" }));

    const launchAtLoginItem = new MenuItem({
      label: "Launch at Login",
      type: "checkbox",
      checked: false,
      click: (item) => this.handleLaunchAtLogin(item.checked),
    });
    menu.append(launchAtLoginItem);

    menu.append(new MenuItem({ type: "separator" }));
    menu.append(
      new MenuItem({
        label: "Quit InsomniKit",
        click: () => app.quit(),
      }),
    );

    this.mi = {
      status,
      power,
      battery,
      estimate,
      timer,
      threshold,
      warning,
      enableDisable,
      launchAtLogin: launchAtLoginItem,
      durationOptions,
      durationCustomShown,
      thresholdOptions,
      thresholdCustomShown,
      lidClosedRoot,
      lidClosedStatus,
      lidClosedDescOff,
      lidClosedDescOn,
      lidClosedAction,
    };

    return menu;
  }

  /**
   * Mutate the existing MenuItem refs to reflect current state. macOS
   * picks up these property changes live, even with the menu open.
   *
   * Also updates the tray icon image and the title text (which always
   * update live regardless).
   */
  private applyState(): void {
    if (!this.tray || !this.mi) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();
    const lidApplied = this.lidClosed.isActive();

    // tray image + title
    this.tray.setImage(state.active ? getActiveIcon() : getInactiveIcon());
    this.tray.setTitle(formatTrayTitle(state, remainingMs, lidApplied));

    // top status block
    this.mi.status.label = formatStatusLine(state);
    this.mi.power.label = formatPower(state.battery);
    this.mi.battery.label = formatBattery(state.battery);

    const estimateLabel = formatBatteryEstimate(state.battery);
    if (estimateLabel) {
      this.mi.estimate.label = estimateLabel;
      this.mi.estimate.visible = true;
    } else {
      this.mi.estimate.visible = false;
    }

    this.mi.timer.label = formatTimerLine(state, remainingMs);
    this.mi.threshold.label = formatThresholdLine(state);

    const warningLabel = state.active ? lidCloseWarning(state.battery) : null;
    if (warningLabel) {
      this.mi.warning.label = warningLabel;
      this.mi.warning.visible = true;
    } else {
      this.mi.warning.visible = false;
    }

    // main toggle
    this.mi.enableDisable.label = state.active ? "Disable" : "Enable";

    // duration submenu
    const dShowsCustom = !isDurationPreset(state.duration);
    for (const opt of DURATION_PRESETS) {
      const mi = this.mi.durationOptions.get(durationKey(opt.minutes));
      if (mi) mi.checked = !dShowsCustom && state.duration === opt.minutes;
    }
    if (dShowsCustom) {
      this.mi.durationCustomShown.label = `Custom: ${formatDuration(state.duration)}`;
      this.mi.durationCustomShown.visible = true;
    } else {
      this.mi.durationCustomShown.visible = false;
    }

    // battery threshold submenu
    const tShowsCustom = !isThresholdPreset(state.batteryThreshold);
    for (const opt of THRESHOLD_PRESETS) {
      const mi = this.mi.thresholdOptions.get(thresholdKey(opt.percent));
      if (mi) mi.checked = !tShowsCustom && state.batteryThreshold === opt.percent;
    }
    if (tShowsCustom) {
      this.mi.thresholdCustomShown.label = `Custom: ≤ ${state.batteryThreshold}%`;
      this.mi.thresholdCustomShown.visible = true;
    } else {
      this.mi.thresholdCustomShown.visible = false;
    }

    // lid-closed submenu
    const intent = state.lidClosedMode;
    const stateLabel = lidApplied
      ? "On (system-wide)"
      : intent
        ? "pending…"
        : "Off";
    this.mi.lidClosedRoot.label = `Stay Awake When Closed: ${
      stateLabel === "On (system-wide)" ? "On" : stateLabel
    }`;
    this.mi.lidClosedStatus.label = `Currently: ${stateLabel}`;
    for (const m of this.mi.lidClosedDescOff) m.visible = !lidApplied;
    for (const m of this.mi.lidClosedDescOn) m.visible = lidApplied;
    this.mi.lidClosedAction.label = lidApplied ? "Turn off" : "Turn on…";

    // launch-at-login checkbox
    this.mi.launchAtLogin.checked = state.launchAtLogin;
  }

  private async handleToggle(): Promise<void> {
    const wasActive = this.store.get().active;
    try {
      if (wasActive) {
        this.timer.cancel();
        await this.sleep.disable();
      } else {
        await this.sleep.enable();
        this.timer.start(this.store.get().duration, { restart: true });
        void this.battery.refresh();
      }
    } catch (err) {
      log.error("toggle failed", err);
    }
  }

  private handleDuration(duration: Duration): void {
    this.store.setDuration(duration);
    if (this.store.get().active) {
      this.timer.start(duration, { restart: true });
    }
  }

  private async handleDurationCustom(): Promise<void> {
    const current = this.store.get().duration;
    const defaultValue = current === null ? "60" : String(current);
    const raw = await promptText({
      title: "InsomniKit · Custom duration",
      message: `Enter duration in minutes (${DURATION_MIN_MINUTES}–${DURATION_MAX_MINUTES}):`,
      defaultValue,
    });
    if (raw === null) return;
    const parsed = parseDurationInput(raw);
    if (parsed === undefined) {
      log.info("invalid custom duration input", { raw });
      void this.handleInvalid("duration");
      return;
    }
    this.handleDuration(parsed);
  }

  private handleThreshold(threshold: BatteryThreshold): void {
    this.store.setBatteryThreshold(threshold);
    this.battery.resetThresholdLatch();
  }

  private async handleThresholdCustom(): Promise<void> {
    const current = this.store.get().batteryThreshold;
    const defaultValue = current === null ? "30" : String(current);
    const raw = await promptText({
      title: "InsomniKit · Custom battery threshold",
      message: `Auto-disable when battery is at or below this percent (${THRESHOLD_MIN_PERCENT}–${THRESHOLD_MAX_PERCENT}):`,
      defaultValue,
    });
    if (raw === null) return;
    const parsed = parseThresholdInput(raw);
    if (parsed === undefined) {
      log.info("invalid custom threshold input", { raw });
      void this.handleInvalid("threshold");
      return;
    }
    this.handleThreshold(parsed);
  }

  /** Single-retry error sheet for invalid Custom… input. */
  private async handleInvalid(
    which: "duration" | "threshold",
  ): Promise<void> {
    const hint =
      which === "duration"
        ? `Please enter a whole number of minutes between ${DURATION_MIN_MINUTES} and ${DURATION_MAX_MINUTES}.`
        : `Please enter a whole percent between ${THRESHOLD_MIN_PERCENT} and ${THRESHOLD_MAX_PERCENT}.`;
    const raw = await promptText({
      title: "InsomniKit · Invalid value",
      message: hint,
      defaultValue: "",
    });
    if (raw === null) return;
    if (which === "duration") {
      const parsed = parseDurationInput(raw);
      if (parsed !== undefined) this.handleDuration(parsed);
    } else {
      const parsed = parseThresholdInput(raw);
      if (parsed !== undefined) this.handleThreshold(parsed);
    }
  }

  private handleLaunchAtLogin(enabled: boolean): void {
    setLaunchAtLogin(enabled);
    this.store.setLaunchAtLogin(enabled);
  }

  private async handleLidClosedToggle(): Promise<void> {
    const wantActive = !this.lidClosed.isActive();
    this.store.setLidClosedMode(wantActive);
    this.applyState();

    try {
      if (wantActive) {
        await this.lidClosed.enable();
      } else {
        await this.lidClosed.disable();
      }
    } catch (err) {
      log.warn("lid-closed toggle failed", err);
      this.store.setLidClosedMode(this.lidClosed.isActive());
    } finally {
      this.applyState();
    }
  }
}

/** Key for the durationOptions Map — `null` becomes the string "infinite". */
function durationKey(d: Duration): string {
  return d === null ? "infinite" : String(d);
}

/** Key for the thresholdOptions Map — `null` becomes the string "off". */
function thresholdKey(t: BatteryThreshold): string {
  return t === null ? "off" : String(t);
}
