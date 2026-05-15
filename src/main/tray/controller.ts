import { app, Menu, MenuItemConstructorOptions, Tray } from "electron";
import { BatteryMonitor } from "../services/battery";
import { setLaunchAtLogin } from "../services/launchAtLogin";
import { LidClosedService } from "../services/lidClosed";
import { SleepManager } from "../services/sleep";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import {
  AppState,
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
import { getTrayIcon } from "./icons";

const log = createLogger("tray");

/**
 * Owns the macOS menu-bar Tray.
 *
 * Rebuild strategy:
 *   On every store change (and on a 15s tick for the countdown), we
 *   rebuild the entire menu from a fresh template and call
 *   `tray.setContextMenu`. Cheap on a small menu, and it's the
 *   pattern macOS reliably reflects.
 *
 *   Why not "build once, mutate items": empirically, on macOS,
 *   mutating a `MenuItem.label` after `setContextMenu` does not
 *   propagate to the live NSMenu — labels stay frozen at the values
 *   they had when the menu was installed. v1.1.9–v1.1.10 tried the
 *   stable-refs / mutation approach and produced a menu where every
 *   dynamic row was blank. Rebuild is the proven path.
 *
 *   Known limitation of this approach: macOS NSMenu freezes once
 *   displayed, so changes that happen *while the menu is open* don't
 *   appear until the user closes and re-opens it. Live updates
 *   while-open would need a custom popover (not a native menu) — a
 *   much bigger change than is justified here.
 */
export class TrayController {
  private tray: Tray | null = null;
  private tickHandle: NodeJS.Timeout | null = null;
  private disposeStoreListener: (() => void) | null = null;

  constructor(
    private readonly store: Store,
    private readonly sleep: SleepManager,
    private readonly timer: TimerManager,
    private readonly battery: BatteryMonitor,
    private readonly lidClosed: LidClosedService,
  ) {}

  start(): void {
    if (this.tray) return;
    this.tray = new Tray(getTrayIcon(false, false));
    this.tray.setToolTip("InsomniKit");

    this.disposeStoreListener = this.store.on("change", () => this.render());
    this.render();

    // Tick so the "X remaining" line decrements at least every 15s
    // (matters when the user opens the menu again — fresh value).
    this.tickHandle = setInterval(() => this.render(), 15_000);
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
  }

  private render(): void {
    if (!this.tray) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();
    const lidApplied = this.lidClosed.isActive();

    this.tray.setImage(getTrayIcon(state.active, lidApplied));
    this.tray.setTitle(formatTrayTitle(state, remainingMs, lidApplied));
    this.tray.setContextMenu(this.buildMenu(state, remainingMs, lidApplied));
  }

  private buildMenu(
    state: AppState,
    remainingMs: number | null,
    lidApplied: boolean,
  ): Menu {
    const estimate = formatBatteryEstimate(state.battery);
    const warning = state.active ? lidCloseWarning(state.battery) : null;

    const template: MenuItemConstructorOptions[] = [
      { label: "InsomniKit", enabled: false },
      { type: "separator" },
      { label: formatStatusLine(state), enabled: false },
      { label: formatPower(state.battery), enabled: false },
      { label: formatBattery(state.battery), enabled: false },
      ...(estimate
        ? ([{ label: estimate, enabled: false }] as MenuItemConstructorOptions[])
        : []),
      { label: formatTimerLine(state, remainingMs), enabled: false },
      { label: formatThresholdLine(state), enabled: false },
      ...(warning
        ? ([{ label: warning, enabled: false }] as MenuItemConstructorOptions[])
        : []),
      { type: "separator" },
      {
        label: state.active ? "Disable" : "Enable",
        click: () => void this.handleToggle(),
      },
      { type: "separator" },
      this.buildDurationMenu(state),
      this.buildThresholdMenu(state),
      this.buildLidClosedMenu(state, lidApplied),
      { type: "separator" },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: state.launchAtLogin,
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

  private buildDurationMenu(state: AppState): MenuItemConstructorOptions {
    const showsCustom = !isDurationPreset(state.duration);
    const submenu: MenuItemConstructorOptions[] = [
      ...DURATION_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        label: opt.label,
        type: "radio" as const,
        checked: !showsCustom && state.duration === opt.minutes,
        click: () => this.handleDuration(opt.minutes),
      })),
      { type: "separator" },
      ...(showsCustom
        ? ([
            {
              label: `Custom: ${formatDuration(state.duration)}`,
              type: "radio" as const,
              checked: true,
              enabled: false,
            },
          ] as MenuItemConstructorOptions[])
        : []),
      {
        label: "Custom…",
        click: () => void this.handleDurationCustom(),
      },
    ];
    return { label: "Duration", submenu };
  }

  private buildThresholdMenu(state: AppState): MenuItemConstructorOptions {
    const showsCustom = !isThresholdPreset(state.batteryThreshold);
    const submenu: MenuItemConstructorOptions[] = [
      ...THRESHOLD_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        label: opt.label,
        type: "radio" as const,
        checked: !showsCustom && state.batteryThreshold === opt.percent,
        click: () => this.handleThreshold(opt.percent),
      })),
      { type: "separator" },
      ...(showsCustom
        ? ([
            {
              label: `Custom: ≤ ${state.batteryThreshold}%`,
              type: "radio" as const,
              checked: true,
              enabled: false,
            },
          ] as MenuItemConstructorOptions[])
        : []),
      {
        label: "Custom…",
        click: () => void this.handleThresholdCustom(),
      },
    ];
    return { label: "Battery Auto-Disable", submenu };
  }

  private buildLidClosedMenu(
    state: AppState,
    applied: boolean,
  ): MenuItemConstructorOptions {
    const intent = state.lidClosedMode;
    const stateLabel = applied
      ? "On (system-wide)"
      : intent
        ? "pending…"
        : "Off";

    const description: MenuItemConstructorOptions[] = applied
      ? [
          { label: "Your Mac stays awake even when you", enabled: false },
          { label: "close it — including on battery.", enabled: false },
          { type: "separator" },
          { label: "Note: this persists across app quit.", enabled: false },
          { label: "Turn it off here when you're done.", enabled: false },
        ]
      : [
          { label: "Keeps your Mac awake when you close", enabled: false },
          { label: "the laptop — even on battery.", enabled: false },
          { type: "separator" },
          { label: "macOS normally sleeps when closed.", enabled: false },
          { label: "This overrides that, system-wide.", enabled: false },
          { label: "You'll be asked for your password.", enabled: false },
        ];

    const submenu: MenuItemConstructorOptions[] = [
      { label: `Currently: ${stateLabel}`, enabled: false },
      { type: "separator" },
      ...description,
      { type: "separator" },
      {
        label: applied ? "Turn off" : "Turn on…",
        click: () => void this.handleLidClosedToggle(),
      },
    ];

    return {
      label: `Stay Awake When Closed: ${
        stateLabel === "On (system-wide)" ? "On" : stateLabel
      }`,
      submenu,
    };
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
    this.render();

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
      this.render();
    }
  }
}
