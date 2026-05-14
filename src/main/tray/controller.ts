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
 * Owns the macOS menu-bar Tray and the menu rebuild loop.
 *
 * Rebuild strategy: we re-`buildFromTemplate` whenever the store
 * changes. The menu is small and macOS only renders it when opened,
 * so this is cheap and avoids the bookkeeping of mutating individual
 * MenuItem properties.
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
    this.tray = new Tray(getInactiveIcon());
    this.tray.setToolTip("InsomniKit");

    this.disposeStoreListener = this.store.on("change", () => this.render());
    this.render();

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

  private render(): void {
    if (!this.tray) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();

    this.tray.setImage(state.active ? getActiveIcon() : getInactiveIcon());
    this.tray.setTitle(formatTrayTitle(state, remainingMs));
    this.tray.setContextMenu(this.buildMenu(state, remainingMs));
  }

  private buildMenu(
    state: AppState,
    remainingMs: number | null,
  ): Menu {
    const warning = state.active ? lidCloseWarning(state.battery) : null;

    const template: MenuItemConstructorOptions[] = [
      { label: "InsomniKit", enabled: false },
      { type: "separator" },
      { label: formatStatusLine(state), enabled: false },
      { label: formatPower(state.battery), enabled: false },
      { label: formatBattery(state.battery), enabled: false },
      { label: formatTimerLine(state, remainingMs), enabled: false },
      { label: formatThresholdLine(state), enabled: false },
      ...(warning
        ? ([{ label: warning, enabled: false }] as MenuItemConstructorOptions[])
        : []),
      { type: "separator" },
      {
        label: state.active ? "Disable" : "Enable",
        click: () => {
          void this.handleToggle();
        },
      },
      { type: "separator" },
      this.buildDurationMenu(state),
      this.buildThresholdMenu(state),
      this.buildLidClosedMenu(),
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
    // Show the active custom value as its own radio so the user can see
    // what's currently set even when it's not one of the presets.
    const showsCustomBranch = !isDurationPreset(state.duration);

    const submenu: MenuItemConstructorOptions[] = [
      ...DURATION_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        label: opt.label,
        type: "radio" as const,
        checked: !showsCustomBranch && state.duration === opt.minutes,
        click: () => this.handleDuration(opt.minutes),
      })),
      { type: "separator" },
      ...(showsCustomBranch
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
        click: () => {
          void this.handleDurationCustom();
        },
      },
    ];

    return { label: "Duration", submenu };
  }

  private buildThresholdMenu(state: AppState): MenuItemConstructorOptions {
    const showsCustomBranch = !isThresholdPreset(state.batteryThreshold);

    const submenu: MenuItemConstructorOptions[] = [
      ...THRESHOLD_PRESETS.map<MenuItemConstructorOptions>((opt) => ({
        label: opt.label,
        type: "radio" as const,
        checked: !showsCustomBranch && state.batteryThreshold === opt.percent,
        click: () => this.handleThreshold(opt.percent),
      })),
      { type: "separator" },
      ...(showsCustomBranch
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
        click: () => {
          void this.handleThresholdCustom();
        },
      },
    ];

    return { label: "Battery Auto-Disable", submenu };
  }

  /**
   * Lid-Closed Mode is a power-user toggle with admin-prompt cost and
   * a non-obvious benefit ("why would I want this?"). The whole feature
   * lives in a submenu so:
   *  1. The top-level menu doesn't truncate long admin labels (and the
   *     status stays visible at a glance — "Lid-Closed Mode: Off ▸").
   *  2. There's room inside to explain what it does and when to use
   *     it without cluttering the main menu for users who don't care.
   */
  private buildLidClosedMenu(): MenuItemConstructorOptions {
    const applied = this.lidClosed.isActive();
    const intent = this.store.get().lidClosedMode;
    const stateLabel = applied
      ? "On (system-wide)"
      : intent
        ? "pending…"
        : "Off";

    // Each "paragraph" line is its own disabled menu item — macOS doesn't
    // render \n inside a label. Kept short so they don't truncate the
    // submenu width.
    const description: MenuItemConstructorOptions[] = applied
      ? [
          { label: "Your Mac stays awake even when the", enabled: false },
          { label: "lid is closed — including on battery.", enabled: false },
          { type: "separator" },
          { label: "Note: this persists across app quit.", enabled: false },
          { label: "Turn it off here when you're done.", enabled: false },
        ]
      : [
          { label: "Keeps your Mac awake when you close", enabled: false },
          { label: "the lid — even on battery.", enabled: false },
          { type: "separator" },
          { label: "macOS normally sleeps on lid-close.", enabled: false },
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
        click: () => {
          void this.handleLidClosedToggle();
        },
      },
    ];

    return {
      label: `Lid-Closed Mode: ${stateLabel === "On (system-wide)" ? "On" : stateLabel}`,
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
    const defaultValue =
      current === null
        ? "60"
        : String(current);
    const raw = await promptText({
      title: "InsomniKit · Custom duration",
      message: `Enter duration in minutes (${DURATION_MIN_MINUTES}–${DURATION_MAX_MINUTES}):`,
      defaultValue,
    });
    if (raw === null) return; // cancelled
    const parsed = parseDurationInput(raw);
    if (parsed === undefined) {
      log.info("invalid custom duration input", { raw });
      // Loop the prompt with a hint so the user understands what's wrong.
      void this.handleDurationInvalid("duration");
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
      void this.handleDurationInvalid("threshold");
      return;
    }
    this.handleThreshold(parsed);
  }

  /**
   * Show a single error sheet and bounce the user back to the right
   * prompt. We don't infinite-loop — one retry is enough; if they
   * still cancel, we drop it.
   */
  private async handleDurationInvalid(
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
