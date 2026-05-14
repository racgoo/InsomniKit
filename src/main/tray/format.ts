import { AppState, BatterySnapshot, Duration } from "../state/types";

/**
 * Pure helpers for rendering menu labels. Kept dependency-free and
 * synchronous so they're trivial to unit-test later.
 */

export function formatBattery(b: BatterySnapshot): string {
  if (b.onACOnly && b.percent === null) return "Battery: n/a (desktop)";
  if (b.percent === null) return "Battery: …";
  const suffix = b.charging ? " ⚡" : "";
  return `Battery: ${b.percent}%${suffix}`;
}

/**
 * Human label for the current power source. Used to set expectations
 * about what closing the lid will do — on AC caffeinate keeps the
 * system awake; on battery macOS sleeps on lid-close regardless.
 */
export function formatPower(b: BatterySnapshot): string {
  if (b.onACOnly) return "Power: AC (desktop)";
  return b.charging ? "Power: AC" : "Power: Battery";
}

/**
 * Returns a one-line caveat when the current setup means closing the
 * lid will still sleep the Mac, or `null` when no warning is needed.
 */
export function lidCloseWarning(b: BatterySnapshot): string | null {
  if (b.onACOnly) return null;
  if (b.charging) return null;
  return "⚠︎  Lid-close sleeps on battery";
}

/**
 * Render a duration as a friendly label.
 *
 * - null         → "Infinite"
 * - 1            → "1 minute"
 * - 59           → "59 minutes"
 * - 60           → "1 hour"
 * - 90           → "1h 30m"
 * - 120          → "2 hours"
 */
export function formatDuration(d: Duration): string {
  if (d === null) return "Infinite";
  if (d < 60) return d === 1 ? "1 minute" : `${d} minutes`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

/**
 * Render a human-friendly "Xh Ym remaining" / "Xm remaining" /
 * "<1m remaining" string from a millisecond delta.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "<1m remaining";
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) {
    if (totalMin < 1) return "<1m remaining";
    return `${totalMin}m remaining`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h remaining` : `${h}h ${m}m remaining`;
}

export function formatTimerLine(
  state: AppState,
  remainingMs: number | null,
): string {
  if (state.duration === null) return "Timer: Infinite";
  if (remainingMs === null) return `Timer: ${formatDuration(state.duration)} (idle)`;
  return `Timer: ${formatRemaining(remainingMs)}`;
}

export function formatThresholdLine(state: AppState): string {
  if (state.batteryThreshold === null) return "Auto-disable: Off";
  return `Auto-disable: ≤ ${state.batteryThreshold}%`;
}

export function formatStatusLine(state: AppState): string {
  return state.active ? "● Active" : "○ Inactive";
}

/**
 * Short status string for the tray title (next to the icon).
 */
export function formatTrayTitle(
  state: AppState,
  remainingMs: number | null,
): string {
  if (!state.active) return "";
  if (state.duration === null) return "∞";
  if (remainingMs === null) return "";
  const totalMin = Math.ceil(remainingMs / 60_000);
  if (totalMin < 60) return `${Math.max(1, totalMin)}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
