/**
 * Domain types shared across services, state, and tray.
 *
 * Keeping these in one place avoids circular imports between
 * `services/*` and `state/*` and makes future strategies / modes easy to
 * slot in without touching every file.
 */

export type DurationPreset = "15m" | "30m" | "1h" | "2h" | "infinite";

export type BatteryThreshold = "off" | "50" | "30" | "20";

/**
 * Sleep prevention strategy.
 *
 * - `caffeinate`: spawn the `caffeinate` binary (per-process, no system
 *   state mutation, safest default).
 * - `pmset`: toggle `pmset -c disablesleep` (system-wide, requires
 *   careful restore on quit/crash).
 *
 * Step 3 introduces the strategy implementations; the state layer only
 * needs the discriminator now so persisted settings stay forward-
 * compatible.
 */
export type SleepStrategyKind = "caffeinate" | "pmset";

export interface BatterySnapshot {
  /** 0–100, or `null` when no battery is present (desktop Mac). */
  percent: number | null;
  /** True when running on AC power. */
  charging: boolean;
  /** True when no battery hardware is reported by pmset. */
  onACOnly: boolean;
}

export interface TimerSnapshot {
  preset: DurationPreset;
  /** Wall-clock ms when the timer fires. `null` for infinite or idle. */
  endsAt: number | null;
}

export interface AppState {
  active: boolean;
  strategy: SleepStrategyKind;
  duration: DurationPreset;
  batteryThreshold: BatteryThreshold;
  launchAtLogin: boolean;
  /**
   * "User intent" for Lid-Closed Mode. The LidClosedService also tracks
   * an `active` flag for what's currently applied; they can diverge
   * mid-prompt and the tray reconciles by reading both.
   */
  lidClosedMode: boolean;
  battery: BatterySnapshot;
  timer: TimerSnapshot;
}

export const DEFAULT_STATE: AppState = {
  active: false,
  strategy: "caffeinate",
  duration: "infinite",
  batteryThreshold: "off",
  launchAtLogin: false,
  lidClosedMode: false,
  battery: { percent: null, charging: false, onACOnly: false },
  timer: { preset: "infinite", endsAt: null },
};

/**
 * Convert a duration preset to milliseconds. `infinite` returns `null`,
 * meaning "no auto-disable timer".
 */
export function durationToMs(preset: DurationPreset): number | null {
  switch (preset) {
    case "15m":
      return 15 * 60 * 1000;
    case "30m":
      return 30 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "2h":
      return 2 * 60 * 60 * 1000;
    case "infinite":
      return null;
  }
}

export function batteryThresholdToPercent(t: BatteryThreshold): number | null {
  return t === "off" ? null : Number(t);
}
