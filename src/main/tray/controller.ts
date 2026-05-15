import { app, Menu, MenuItem, MenuItemConstructorOptions, Tray } from "electron";
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
 *   The menu is built ONCE via `Menu.buildFromTemplate`. After that we
 *   only mutate properties (`label`, `checked`, `visible`) on the
 *   existing MenuItem instances — never call `setContextMenu` again.
 *
 *   Why buildFromTemplate (vs `new MenuItem` + `menu.append`):
 *   only items registered through buildFromTemplate are properly
 *   bridged to the native NSMenu on macOS. Items created standalone
 *   and `append`-ed can render but later property mutations don't
 *   propagate to the live NSMenu — the visible labels stay frozen at
 *   their construction-time values. (Empirically: an earlier refactor
 *   that used the standalone-construct pattern produced a menu where
 *   every dynamic row showed up blank.)
 *
 *   So: build via template with stable `id`s, look up MenuItem refs
 *   via `menu.getMenuItemById`, then mutate properties from
 *   `applyState`.
 *
 *   `applyState` is also called BEFORE `setContextMenu` at startup so
 *   the menu's first-ever appearance already has correct labels.
 */
export class TrayController {
  private tray: Tray | null = null;
  private menu: Menu | null = null;
  private tickHandle: NodeJS.Timeout | null = null;
  private disposeStoreListener: (() => void) | null = null;

  // Stable refs to every dynamic item, resolved from the menu via id.
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
    durationOptions: Map<string, MenuItem>;
    durationCustomShown: MenuItem;
    thresholdOptions: Map<string, MenuItem>;
    thresholdCustomShown: MenuItem;
    lidClosedRoot: MenuItem;
    lidClosedStatus: MenuItem;
    lidClosedDescOff: MenuItem[];
    lidClosedDescOn: MenuItem[];
    lidClosedAction: MenuItem;
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
    this.resolveItemRefs(this.menu);

    // Seed labels BEFORE setContextMenu so the very first menu display
    // already has correct text (buildFromTemplate registers items with
    // their initial labels — we want those initial labels to be real,
    // not empty placeholders).
    this.applyState();
    this.tray.setContextMenu(this.menu);

    this.disposeStoreListener = this.store.on("change", () =>
      this.applyState(),
    );

    // Tick so the "X remaining" line decrements while the menu is open.
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
   * Construct the menu via `Menu.buildFromTemplate`. Every dynamic item
   * carries a stable `id` so `applyState` can find and mutate it.
   */
  private createMenu(): Menu {
    const durationSubmenu: MenuItemConstructorOptions[] = [
      ...DURATION_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        id: `duration:${durationKey(opt.minutes)}`,
        label: opt.label,
        type: "radio" as const,
        checked: false,
        click: () => this.handleDuration(opt.minutes),
      })),
      { type: "separator" },
      {
        id: "duration:customShown",
        label: "Custom",
        type: "radio" as const,
        checked: true,
        enabled: false,
        visible: false,
      },
      {
        label: "Custom…",
        click: () => void this.handleDurationCustom(),
      },
    ];

    const thresholdSubmenu: MenuItemConstructorOptions[] = [
      ...THRESHOLD_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        id: `threshold:${thresholdKey(opt.percent)}`,
        label: opt.label,
        type: "radio" as const,
        checked: false,
        click: () => this.handleThreshold(opt.percent),
      })),
      { type: "separator" },
      {
        id: "threshold:customShown",
        label: "Custom",
        type: "radio" as const,
        checked: true,
        enabled: false,
        visible: false,
      },
      {
        label: "Custom…",
        click: () => void this.handleThresholdCustom(),
      },
    ];

    const lidClosedSubmenu: MenuItemConstructorOptions[] = [
      { id: "lid:status", label: "Currently: Off", enabled: false },
      { type: "separator" },
      // 6-item OFF description block (always present, hidden when ON).
      { id: "lid:descOff:0", label: "Keeps your Mac awake when you close", enabled: false },
      { id: "lid:descOff:1", label: "the laptop — even on battery.", enabled: false },
      { id: "lid:descOff:2", type: "separator" },
      { id: "lid:descOff:3", label: "macOS normally sleeps when closed.", enabled: false },
      { id: "lid:descOff:4", label: "This overrides that, system-wide.", enabled: false },
      { id: "lid:descOff:5", label: "You'll be asked for your password.", enabled: false },
      // 5-item ON description block (always present, hidden when OFF).
      { id: "lid:descOn:0", label: "Your Mac stays awake even when you", enabled: false, visible: false },
      { id: "lid:descOn:1", label: "close it — including on battery.", enabled: false, visible: false },
      { id: "lid:descOn:2", type: "separator", visible: false },
      { id: "lid:descOn:3", label: "Note: this persists across app quit.", enabled: false, visible: false },
      { id: "lid:descOn:4", label: "Turn it off here when you're done.", enabled: false, visible: false },
      { type: "separator" },
      {
        id: "lid:action",
        label: "Turn on…",
        click: () => void this.handleLidClosedToggle(),
      },
    ];

    const template: MenuItemConstructorOptions[] = [
      { label: "InsomniKit", enabled: false },
      { type: "separator" },
      { id: "status", label: "○ Inactive", enabled: false },
      { id: "power", label: "Power: …", enabled: false },
      { id: "battery", label: "Battery: …", enabled: false },
      { id: "estimate", label: "", enabled: false, visible: false },
      { id: "timer", label: "Timer: Infinite", enabled: false },
      { id: "threshold", label: "Auto-disable: Off", enabled: false },
      { id: "warning", label: "", enabled: false, visible: false },
      { type: "separator" },
      {
        id: "enableDisable",
        label: "Enable",
        click: () => void this.handleToggle(),
      },
      { type: "separator" },
      { label: "Duration", submenu: durationSubmenu },
      { label: "Battery Auto-Disable", submenu: thresholdSubmenu },
      {
        id: "lid:root",
        label: "Stay Awake When Closed: Off",
        submenu: lidClosedSubmenu,
      },
      { type: "separator" },
      {
        id: "launchAtLogin",
        label: "Launch at Login",
        type: "checkbox",
        checked: false,
        click: (item) => this.handleLaunchAtLogin(item.checked),
      },
      { type: "separator" },
      {
        label: "Quit InsomniKit",
        click: () => app.quit(),
      },
    ];

    return Menu.buildFromTemplate(template);
  }

  /** Resolve every dynamic id once into `this.mi` for fast access. */
  private resolveItemRefs(menu: Menu): void {
    const get = (id: string): MenuItem => {
      const item = menu.getMenuItemById(id);
      if (!item) throw new Error(`menu item not found: ${id}`);
      return item;
    };

    const durationOptions = new Map<string, MenuItem>();
    for (const opt of DURATION_PRESETS) {
      durationOptions.set(
        durationKey(opt.minutes),
        get(`duration:${durationKey(opt.minutes)}`),
      );
    }
    const thresholdOptions = new Map<string, MenuItem>();
    for (const opt of THRESHOLD_PRESETS) {
      thresholdOptions.set(
        thresholdKey(opt.percent),
        get(`threshold:${thresholdKey(opt.percent)}`),
      );
    }

    this.mi = {
      status: get("status"),
      power: get("power"),
      battery: get("battery"),
      estimate: get("estimate"),
      timer: get("timer"),
      threshold: get("threshold"),
      warning: get("warning"),
      enableDisable: get("enableDisable"),
      launchAtLogin: get("launchAtLogin"),
      durationOptions,
      durationCustomShown: get("duration:customShown"),
      thresholdOptions,
      thresholdCustomShown: get("threshold:customShown"),
      lidClosedRoot: get("lid:root"),
      lidClosedStatus: get("lid:status"),
      lidClosedDescOff: [
        get("lid:descOff:0"),
        get("lid:descOff:1"),
        get("lid:descOff:2"),
        get("lid:descOff:3"),
        get("lid:descOff:4"),
        get("lid:descOff:5"),
      ],
      lidClosedDescOn: [
        get("lid:descOn:0"),
        get("lid:descOn:1"),
        get("lid:descOn:2"),
        get("lid:descOn:3"),
        get("lid:descOn:4"),
      ],
      lidClosedAction: get("lid:action"),
    };
  }

  /**
   * Mutate the existing MenuItem refs to reflect current state. macOS
   * NSMenu picks up these property changes live, even with the menu
   * open. Also updates the tray icon image and the title text.
   */
  private applyState(): void {
    if (!this.tray || !this.mi) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();
    const lidApplied = this.lidClosed.isActive();

    this.tray.setImage(state.active ? getActiveIcon() : getInactiveIcon());
    this.tray.setTitle(formatTrayTitle(state, remainingMs, lidApplied));

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

    this.mi.enableDisable.label = state.active ? "Disable" : "Enable";

    // Duration submenu
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

    // Battery threshold submenu
    const tShowsCustom = !isThresholdPreset(state.batteryThreshold);
    for (const opt of THRESHOLD_PRESETS) {
      const mi = this.mi.thresholdOptions.get(thresholdKey(opt.percent));
      if (mi)
        mi.checked = !tShowsCustom && state.batteryThreshold === opt.percent;
    }
    if (tShowsCustom) {
      this.mi.thresholdCustomShown.label = `Custom: ≤ ${state.batteryThreshold}%`;
      this.mi.thresholdCustomShown.visible = true;
    } else {
      this.mi.thresholdCustomShown.visible = false;
    }

    // Stay Awake When Closed
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

  private async handleInvalid(which: "duration" | "threshold"): Promise<void> {
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

function durationKey(d: Duration): string {
  return d === null ? "infinite" : String(d);
}

function thresholdKey(t: BatteryThreshold): string {
  return t === null ? "off" : String(t);
}
