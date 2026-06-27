import { setLocale as setI18nLocale } from "../i18n";
import { BatteryMonitor } from "../services/battery";
import { setLaunchAtLogin } from "../services/launchAtLogin";
import { LidClosedService } from "../services/lidClosed";
import { SleepManager } from "../services/sleep";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import {
  BatteryThreshold,
  Duration,
  LocalePref,
} from "../state/types";
import { createLogger } from "../utils/logger";

const log = createLogger("actions");

/**
 * The shared user-action layer. The tray menu drives the same services
 * directly (it predates this and its menu handlers also do prompt
 * sheets), but every action reachable from the *window* and the
 * *widget* funnels through here so there's one definition of "toggle",
 * "set duration", etc. Each method mutates the {@link Store}; the store's
 * `change` event then re-renders every surface (tray + windows).
 */
export class AppActions {
  constructor(
    private readonly store: Store,
    private readonly sleep: SleepManager,
    private readonly timer: TimerManager,
    private readonly battery: BatteryMonitor,
    private readonly lidClosed: LidClosedService,
  ) {}

  /** Enable ↔ disable sleep prevention, mirroring the tray's toggle. */
  async toggleActive(): Promise<void> {
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

  setDuration(duration: Duration): void {
    this.store.setDuration(duration);
    if (this.store.get().active) {
      this.timer.start(duration, { restart: true });
    }
  }

  setThreshold(threshold: BatteryThreshold): void {
    this.store.setBatteryThreshold(threshold);
    this.battery.resetThresholdLatch();
  }

  setLaunchAtLogin(enabled: boolean): void {
    setLaunchAtLogin(enabled);
    this.store.setLaunchAtLogin(enabled);
  }

  setAnimateIcon(enabled: boolean): void {
    this.store.setAnimateIcon(enabled);
  }

  setLocale(pref: LocalePref): void {
    if (this.store.get().locale === pref) return;
    setI18nLocale(pref);
    this.store.setLocale(pref);
  }

  /**
   * Toggle "Stay Awake When Closed". This shows the admin password sheet
   * (osascript) and can be cancelled — on failure we snap the persisted
   * intent back to whatever actually got applied, same as the tray.
   */
  async setLidClosed(want: boolean): Promise<void> {
    if (want === this.lidClosed.isActive()) {
      this.store.setLidClosedMode(want);
      return;
    }
    this.store.setLidClosedMode(want);
    try {
      if (want) {
        await this.lidClosed.enable();
      } else {
        await this.lidClosed.disable();
      }
    } catch (err) {
      log.warn("lid-closed toggle failed", err);
      this.store.setLidClosedMode(this.lidClosed.isActive());
    }
  }
}
