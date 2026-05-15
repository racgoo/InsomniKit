import { Emitter } from "../utils/emitter";
import {
  AppState,
  BatterySnapshot,
  BatteryThreshold,
  DEFAULT_STATE,
  Duration,
  SleepStrategyKind,
  TimerSnapshot,
} from "./types";

/**
 * Single source of truth for runtime state.
 *
 * Services mutate the store via the small, typed methods below; the
 * tray subscribes to `change` and re-renders the menu. Keeping the
 * surface narrow (instead of exposing the raw object) lets us guarantee
 * an event is emitted on every meaningful update and makes the
 * persistence layer trivial — it just listens to `change`.
 */

export type StoreEvents = {
  change: AppState;
};

export class Store extends Emitter<StoreEvents> {
  private state: AppState;

  constructor(initial: Partial<AppState> = {}) {
    super();
    this.state = { ...DEFAULT_STATE, ...initial };
  }

  /** Immutable view. Callers must not mutate the returned object. */
  get(): AppState {
    return this.state;
  }

  setActive(active: boolean): void {
    if (this.state.active === active) return;
    this.state = { ...this.state, active };
    this.emit("change", this.state);
  }

  setStrategy(strategy: SleepStrategyKind): void {
    if (this.state.strategy === strategy) return;
    this.state = { ...this.state, strategy };
    this.emit("change", this.state);
  }

  setDuration(duration: Duration): void {
    if (this.state.duration === duration) return;
    this.state = { ...this.state, duration };
    this.emit("change", this.state);
  }

  setBatteryThreshold(threshold: BatteryThreshold): void {
    if (this.state.batteryThreshold === threshold) return;
    this.state = { ...this.state, batteryThreshold: threshold };
    this.emit("change", this.state);
  }

  setLaunchAtLogin(enabled: boolean): void {
    if (this.state.launchAtLogin === enabled) return;
    this.state = { ...this.state, launchAtLogin: enabled };
    this.emit("change", this.state);
  }

  setLidClosedMode(enabled: boolean): void {
    if (this.state.lidClosedMode === enabled) return;
    this.state = { ...this.state, lidClosedMode: enabled };
    this.emit("change", this.state);
  }

  setBattery(battery: BatterySnapshot): void {
    const prev = this.state.battery;
    if (
      prev.percent === battery.percent &&
      prev.charging === battery.charging &&
      prev.onACOnly === battery.onACOnly &&
      prev.timeRemainingMin === battery.timeRemainingMin
    ) {
      return;
    }
    this.state = { ...this.state, battery };
    this.emit("change", this.state);
  }

  setTimer(timer: TimerSnapshot): void {
    const prev = this.state.timer;
    if (prev.duration === timer.duration && prev.endsAt === timer.endsAt) {
      return;
    }
    this.state = { ...this.state, timer };
    this.emit("change", this.state);
  }
}
