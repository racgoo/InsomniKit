import { app, Menu, MenuItemConstructorOptions, Tray } from "electron";
import { BatteryMonitor } from "../services/battery";
import { setLaunchAtLogin } from "../services/launchAtLogin";
import { SleepManager } from "../services/sleep";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import {
  BatteryThreshold,
  DurationPreset,
  InsomniacState,
} from "../state/types";
import { createLogger } from "../utils/logger";
import {
  formatBattery,
  formatStatusLine,
  formatThresholdLine,
  formatTimerLine,
  formatTrayTitle,
} from "./format";
import { getActiveIcon, getInactiveIcon } from "./icons";

const log = createLogger("tray");

const DURATION_OPTIONS: ReadonlyArray<{ label: string; value: DurationPreset }> = [
  { label: "15 minutes", value: "15m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "2 hours", value: "2h" },
  { label: "Infinite", value: "infinite" },
];

const THRESHOLD_OPTIONS: ReadonlyArray<{ label: string; value: BatteryThreshold }> = [
  { label: "Off", value: "off" },
  { label: "≤ 50%", value: "50" },
  { label: "≤ 30%", value: "30" },
  { label: "≤ 20%", value: "20" },
];

/**
 * Owns the macOS menu-bar Tray and the menu rebuild loop.
 *
 * Rebuild strategy: we re-`buildFromTemplate` whenever the store
 * changes. The menu is small (~20 items) and macOS only renders it
 * when opened, so this is cheap and avoids the bookkeeping nightmare
 * of mutating individual `MenuItem` checked / label properties.
 *
 * A 30s "tick" interval also refreshes the menu so the "remaining"
 * line stays roughly current even when nothing else changes. The
 * interval is unref'd so it never holds the app alive on its own.
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
  ) {}

  start(): void {
    if (this.tray) return;
    this.tray = new Tray(getInactiveIcon());
    this.tray.setToolTip("Insomniac");

    this.disposeStoreListener = this.store.on("change", () => this.render());
    this.render();

    // Periodic refresh for the "remaining" line. 30s is more than
    // enough — the menu only shows minutes anyway.
    this.tickHandle = setInterval(() => this.render(), 30_000);
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

  /**
   * Rebuild icon + title + menu from the current store state.
   * Safe to call freely; cheap operations only.
   */
  private render(): void {
    if (!this.tray) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();

    this.tray.setImage(state.active ? getActiveIcon() : getInactiveIcon());
    this.tray.setTitle(formatTrayTitle(state, remainingMs));
    this.tray.setContextMenu(this.buildMenu(state, remainingMs));
  }

  private buildMenu(
    state: InsomniacState,
    remainingMs: number | null,
  ): Menu {
    const template: MenuItemConstructorOptions[] = [
      { label: "Insomniac", enabled: false },
      { type: "separator" },
      { label: formatStatusLine(state), enabled: false },
      { label: formatBattery(state.battery), enabled: false },
      { label: formatTimerLine(state, remainingMs), enabled: false },
      { label: formatThresholdLine(state), enabled: false },
      { type: "separator" },
      {
        label: state.active ? "Disable" : "Enable",
        click: () => {
          void this.handleToggle();
        },
      },
      { type: "separator" },
      {
        label: "Duration",
        submenu: DURATION_OPTIONS.map((opt) => ({
          label: opt.label,
          type: "radio",
          checked: state.duration === opt.value,
          click: () => this.handleDuration(opt.value),
        })),
      },
      {
        label: "Battery Auto-Disable",
        submenu: THRESHOLD_OPTIONS.map((opt) => ({
          label: opt.label,
          type: "radio",
          checked: state.batteryThreshold === opt.value,
          click: () => this.handleThreshold(opt.value),
        })),
      },
      { type: "separator" },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: state.launchAtLogin,
        click: (item) => this.handleLaunchAtLogin(item.checked),
      },
      { type: "separator" },
      {
        label: "Quit Insomniac",
        click: () => {
          // Use app.quit so before-quit cleanup fires.
          app.quit();
        },
      },
    ];

    return Menu.buildFromTemplate(template);
  }

  private async handleToggle(): Promise<void> {
    const wasActive = this.store.get().active;
    try {
      if (wasActive) {
        this.timer.cancel();
        await this.sleep.disable();
      } else {
        await this.sleep.enable();
        // (Re)arm the timer fresh on every enable so a previously
        // expired timer doesn't immediately auto-disable us.
        this.timer.start(this.store.get().duration, { restart: true });
        // Refresh battery immediately so the threshold check is honest
        // right after enable.
        void this.battery.refresh();
      }
    } catch (err) {
      log.error("toggle failed", err);
    }
  }

  private handleDuration(preset: DurationPreset): void {
    this.store.setDuration(preset);
    // Only re-arm the timer if currently active. While inactive we
    // just remember the preference for the next enable.
    if (this.store.get().active) {
      this.timer.start(preset, { restart: true });
    }
  }

  private handleThreshold(threshold: BatteryThreshold): void {
    this.store.setBatteryThreshold(threshold);
    // New threshold deserves a fresh edge-trigger chance.
    this.battery.resetThresholdLatch();
  }

  private handleLaunchAtLogin(enabled: boolean): void {
    setLaunchAtLogin(enabled);
    this.store.setLaunchAtLogin(enabled);
  }
}
