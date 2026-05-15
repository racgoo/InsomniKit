/**
 * Domain types shared across services, state, and tray.
 *
 * Keeping these in one place avoids circular imports between
 * `services/*` and `state/*` and makes future strategies / modes easy to
 * slot in without touching every file.
 */

/**
 * Duration the user wants to keep their Mac awake for, in **minutes**.
 * `null` means "infinite" (no auto-disable timer).
 *
 * Why a plain number instead of an enum:
 *   The previous `"15m" | "30m" | "1h" | "2h" | "infinite"` shape forced
 *   us to ship a new build to add a preset and ruled out custom values.
 *   A number subsumes both — presets become labels for fixed values and
 *   the "Custom…" menu item can persist anything the user types.
 */
export type Duration = number | null;

/**
 * Battery percentage at-or-below which auto-disable fires. `null` means
 * "off". Stored as an integer 1–99.
 */
export type BatteryThreshold = number | null;

/**
 * Sleep prevention strategy.
 *
 * - `caffeinate`: spawn the `caffeinate` binary (per-process, no system
 *   state mutation, safest default).
 * - `pmset`: toggle `pmset -c disablesleep` (system-wide, requires
 *   careful restore on quit/crash).
 *
 * The state layer only needs the discriminator now so persisted
 * settings stay forward-compatible.
 */
export type SleepStrategyKind = "caffeinate" | "pmset";

/**
 * Locale override choice:
 *   - `"system"`: follow the macOS system locale (default)
 *   - `"en"` / `"ko"`: force that catalog regardless of OS
 */
export type LocalePref = "system" | "en" | "ko";

export const LOCALE_PREFS: ReadonlyArray<LocalePref> = ["system", "en", "ko"];

export interface BatterySnapshot {
  /** 0–100, or `null` when no battery is present (desktop Mac). */
  percent: number | null;
  /** True when running on AC power. */
  charging: boolean;
  /** True when no battery hardware is reported by pmset. */
  onACOnly: boolean;
  /**
   * Minutes remaining per macOS's own estimate (`pmset -g batt`'s
   * `H:MM remaining` field). Meaning depends on `charging`:
   * - discharging → minutes until empty
   * - charging    → minutes until full
   * `null` when pmset reports `(no estimate)` (right after a power
   * change, while it recalibrates) or when the figure is 0:00 / N/A.
   */
  timeRemainingMin: number | null;
}

export interface TimerSnapshot {
  /** Minutes, or null for infinite. Matches AppState.duration. */
  duration: Duration;
  /** Wall-clock ms when the timer fires. `null` for infinite or idle. */
  endsAt: number | null;
}

export interface AppState {
  active: boolean;
  strategy: SleepStrategyKind;
  duration: Duration;
  batteryThreshold: BatteryThreshold;
  launchAtLogin: boolean;
  /**
   * "User intent" for Lid-Closed Mode. The LidClosedService also tracks
   * an `active` flag for what's currently applied; they can diverge
   * mid-prompt and the tray reconciles by reading both.
   */
  lidClosedMode: boolean;
  /** User's chosen UI language. `"system"` follows macOS. */
  locale: LocalePref;
  /**
   * When true, the menu-bar icon is not shown. The app keeps running
   * in the background; the user brings the tray back by launching
   * InsomniKit again (Spotlight / Launchpad) — the second-instance
   * event resets this flag.
   */
  hideTrayIcon: boolean;
  battery: BatterySnapshot;
  timer: TimerSnapshot;
}

export const DEFAULT_STATE: AppState = {
  active: false,
  strategy: "caffeinate",
  duration: null,
  batteryThreshold: null,
  launchAtLogin: false,
  lidClosedMode: false,
  locale: "system",
  hideTrayIcon: false,
  battery: { percent: null, charging: false, onACOnly: false, timeRemainingMin: null },
  timer: { duration: null, endsAt: null },
};

/**
 * Preset values shown in the menu. The user can also enter any value via
 * "Custom…". Labels are produced by the i18n catalog at render time so
 * the same set works in every locale.
 */
export const DURATION_PRESETS: ReadonlyArray<Duration> = [15, 30, 60, 120, null];
export const THRESHOLD_PRESETS: ReadonlyArray<BatteryThreshold> = [null, 50, 30, 20];

/** Hard limits for custom user input. */
export const DURATION_MIN_MINUTES = 1;
export const DURATION_MAX_MINUTES = 24 * 60; // 24 hours
export const THRESHOLD_MIN_PERCENT = 1;
export const THRESHOLD_MAX_PERCENT = 99;

/**
 * Convert a duration (minutes) to milliseconds. `null` returns `null`,
 * meaning "no auto-disable timer".
 */
export function durationToMs(d: Duration): number | null {
  return d === null ? null : d * 60 * 1000;
}

/** True when a Duration matches one of the built-in presets. */
export function isDurationPreset(d: Duration): boolean {
  return DURATION_PRESETS.includes(d);
}

/** True when a threshold matches one of the built-in presets. */
export function isThresholdPreset(t: BatteryThreshold): boolean {
  return THRESHOLD_PRESETS.includes(t);
}

/** Coerce arbitrary user input into a valid Duration or return null on failure. */
export function parseDurationInput(raw: string): Duration | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  if (n < DURATION_MIN_MINUTES || n > DURATION_MAX_MINUTES) return undefined;
  return n;
}

/** Coerce user input into a valid BatteryThreshold or return undefined. */
export function parseThresholdInput(raw: string): BatteryThreshold | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  if (n < THRESHOLD_MIN_PERCENT || n > THRESHOLD_MAX_PERCENT) return undefined;
  return n;
}
