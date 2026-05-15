import { app, dialog, Menu, MenuItemConstructorOptions, Tray } from "electron";
import { LidState, setLocale as setI18nLocale, t } from "../i18n";
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
  LocalePref,
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
  formatPower,
  formatStatusLine,
  formatThresholdLine,
  formatTimerLine,
  formatTrayTitle,
  lidCloseWarning,
} from "./format";
import {
  getPulseFrames,
  getStaticTrayIcon,
  getTrayIcon,
  PULSE_FRAME_COUNT,
} from "./icons";

const log = createLogger("tray");

/** Lid-closed UI state derived from `(applied, intent)`. */
function lidState(applied: boolean, intent: boolean): LidState {
  if (applied) return "on";
  if (intent) return "pending";
  return "off";
}

export class TrayController {
  private tray: Tray | null = null;
  private tickHandle: NodeJS.Timeout | null = null;
  private disposeStoreListener: (() => void) | null = null;
  /** Pulse-animation interval, only ticking when sleep prevention is active. */
  private pulseHandle: NodeJS.Timeout | null = null;
  private pulseFrame = 0;

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
    this.tray.setToolTip(t().appName);

    this.disposeStoreListener = this.store.on("change", () => this.render());
    this.render();

    this.tickHandle = setInterval(() => this.render(), 15_000);
    this.tickHandle.unref?.();
    log.info("tray started");
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.stopPulse();
    this.disposeStoreListener?.();
    this.disposeStoreListener = null;
    this.tray?.destroy();
    this.tray = null;
  }

  /**
   * Start (or restart) the breathing animation on the active variant.
   * Cycles through `PULSE_FRAME_COUNT` pre-rendered alpha levels —
   * macOS handles the partial alpha on template images correctly so
   * the icon visibly "breathes" in both dark and light menu bars.
   */
  private startPulse(locked: boolean): void {
    this.stopPulse();
    const frames = getPulseFrames(locked);
    this.pulseFrame = 0;
    this.pulseHandle = setInterval(() => {
      if (!this.tray) return;
      this.pulseFrame = (this.pulseFrame + 1) % PULSE_FRAME_COUNT;
      this.tray.setImage(frames[this.pulseFrame]);
    }, 250);
    this.pulseHandle.unref?.();
  }

  private stopPulse(): void {
    if (this.pulseHandle) {
      clearInterval(this.pulseHandle);
      this.pulseHandle = null;
    }
  }

  private render(): void {
    if (!this.tray) return;
    const state = this.store.get();
    const remainingMs = this.timer.getRemainingMs();
    const lidApplied = this.lidClosed.isActive();

    if (state.active) {
      // Animated state: kick the pulse loop. startPulse calls setImage
      // immediately for the first frame and keeps cycling.
      this.startPulse(lidApplied);
    } else {
      // Idle: stop the pulse and show a single static frame.
      this.stopPulse();
      this.tray.setImage(getStaticTrayIcon(lidApplied));
    }

    this.tray.setTitle(formatTrayTitle(state, remainingMs, lidApplied));
    this.tray.setContextMenu(this.buildMenu(state, remainingMs, lidApplied));
  }

  private buildMenu(
    state: AppState,
    remainingMs: number | null,
    lidApplied: boolean,
  ): Menu {
    const m = t();
    const estimate = formatBatteryEstimate(state.battery);
    const warning = state.active ? lidCloseWarning(state.battery) : null;

    const template: MenuItemConstructorOptions[] = [
      { label: m.appName, enabled: false },
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
        label: state.active ? m.disable : m.enable,
        click: () => void this.handleToggle(),
      },
      { type: "separator" },
      this.buildDurationMenu(state),
      this.buildThresholdMenu(state),
      this.buildLidClosedMenu(state, lidApplied),
      { type: "separator" },
      this.buildLanguageMenu(state),
      {
        label: m.launchAtLogin,
        type: "checkbox",
        checked: state.launchAtLogin,
        click: (item) => this.handleLaunchAtLogin(item.checked),
      },
      {
        label: m.hideTrayIcon,
        click: () => this.handleHideTrayIcon(),
      },
      { type: "separator" },
      {
        label: m.quit,
        click: () => app.quit(),
      },
    ];

    return Menu.buildFromTemplate(template);
  }

  private buildDurationMenu(state: AppState): MenuItemConstructorOptions {
    const m = t();
    const showsCustom = !isDurationPreset(state.duration);
    const submenu: MenuItemConstructorOptions[] = [
      ...DURATION_PRESETS.map<MenuItemConstructorOptions>((d) => ({
        label: m.durationPresetLabel(d),
        type: "radio" as const,
        checked: !showsCustom && state.duration === d,
        click: () => this.handleDuration(d),
      })),
      { type: "separator" },
      ...(showsCustom
        ? ([
            {
              label: m.customDurationLabel(state.duration),
              type: "radio" as const,
              checked: true,
              enabled: false,
            },
          ] as MenuItemConstructorOptions[])
        : []),
      {
        label: m.customEllipsis,
        click: () => void this.handleDurationCustom(),
      },
    ];
    return { label: m.durationSubmenu, submenu };
  }

  private buildThresholdMenu(state: AppState): MenuItemConstructorOptions {
    const m = t();
    const showsCustom = !isThresholdPreset(state.batteryThreshold);
    const submenu: MenuItemConstructorOptions[] = [
      ...THRESHOLD_PRESETS.map<MenuItemConstructorOptions>((th) => ({
        label: m.thresholdPresetLabel(th),
        type: "radio" as const,
        checked: !showsCustom && state.batteryThreshold === th,
        click: () => this.handleThreshold(th),
      })),
      { type: "separator" },
      ...(showsCustom
        ? ([
            {
              label: m.customThresholdLabel(state.batteryThreshold),
              type: "radio" as const,
              checked: true,
              enabled: false,
            },
          ] as MenuItemConstructorOptions[])
        : []),
      {
        label: m.customEllipsis,
        click: () => void this.handleThresholdCustom(),
      },
    ];
    return { label: m.thresholdSubmenu, submenu };
  }

  private buildLanguageMenu(state: AppState): MenuItemConstructorOptions {
    const m = t();
    const options: { pref: LocalePref; label: string }[] = [
      { pref: "system", label: m.languageSystem },
      { pref: "en", label: m.languageEnglishNative },
      { pref: "ko", label: m.languageKoreanNative },
    ];
    const submenu: MenuItemConstructorOptions[] = options.map((opt) => ({
      label: opt.label,
      type: "radio" as const,
      checked: state.locale === opt.pref,
      click: () => this.handleLocale(opt.pref),
    }));
    return { label: m.languageSubmenu, submenu };
  }

  private handleLocale(pref: LocalePref): void {
    if (this.store.get().locale === pref) return;
    setI18nLocale(pref);
    this.store.setLocale(pref);
    // setLocale fires `change` → render() → menu rebuilt with the new
    // catalog, so all visible labels switch in place. (User still has
    // to close + reopen if the menu was open — macOS NSMenu limitation
    // we've already documented.)
  }

  private buildLidClosedMenu(
    state: AppState,
    applied: boolean,
  ): MenuItemConstructorOptions {
    const m = t();
    const lstate = lidState(applied, state.lidClosedMode);
    const descLines = applied ? m.stayAwakeDescOn : m.stayAwakeDescOff;

    // i18n description blocks include "" entries to mark separator slots.
    const description: MenuItemConstructorOptions[] = descLines.map((line) =>
      line === "" ? { type: "separator" } : { label: line, enabled: false },
    );

    const submenu: MenuItemConstructorOptions[] = [
      { label: m.stayAwakeStatus(lstate), enabled: false },
      { type: "separator" },
      ...description,
      { type: "separator" },
      {
        label: applied ? m.stayAwakeTurnOff : m.stayAwakeTurnOn,
        click: () => void this.handleLidClosedToggle(),
      },
    ];

    return { label: m.stayAwakeRoot(lstate), submenu };
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
    const m = t();
    const current = this.store.get().duration;
    const defaultValue = current === null ? "60" : String(current);
    const raw = await promptText({
      title: m.promptDurationTitle,
      message: m.promptDurationMessage(DURATION_MIN_MINUTES, DURATION_MAX_MINUTES),
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
    const m = t();
    const current = this.store.get().batteryThreshold;
    const defaultValue = current === null ? "30" : String(current);
    const raw = await promptText({
      title: m.promptThresholdTitle,
      message: m.promptThresholdMessage(THRESHOLD_MIN_PERCENT, THRESHOLD_MAX_PERCENT),
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
    const m = t();
    const hint =
      which === "duration"
        ? m.promptInvalidDuration(DURATION_MIN_MINUTES, DURATION_MAX_MINUTES)
        : m.promptInvalidThreshold(THRESHOLD_MIN_PERCENT, THRESHOLD_MAX_PERCENT);
    const raw = await promptText({
      title: m.promptInvalidTitle,
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

  /**
   * Show a confirmation, hide the tray on OK. The user gets the icon
   * back by relaunching InsomniKit (Spotlight / Launchpad), which the
   * `second-instance` handler in index.ts converts into a tray-show.
   */
  private handleHideTrayIcon(): void {
    const m = t();
    const result = dialog.showMessageBoxSync({
      type: "info",
      message: m.hideTrayConfirmTitle,
      detail: m.hideTrayConfirmDetail,
      buttons: [m.hideTrayConfirmHide, m.hideTrayConfirmCancel],
      defaultId: 0,
      cancelId: 1,
    });
    if (result !== 0) return;
    this.store.setHideTrayIcon(true);
    this.stop();
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
