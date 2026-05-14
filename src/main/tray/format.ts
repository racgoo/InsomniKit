import { BatterySnapshot, AppState } from "../state/types";

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
 *
 * Why this matters: with the default `caffeinate -dims` strategy, the
 * `-s` (system sleep) assertion is documented as "valid only when the
 * system is running on AC power". On battery + lid-close, macOS will
 * sleep the system even with our caffeinate running. Users tend to
 * blame InsomniKit for this; the menu now spells it out.
 */
export function lidCloseWarning(b: BatterySnapshot): string | null {
  if (b.onACOnly) return null;
  if (b.charging) return null;
  return "⚠︎  Lid-close sleeps on battery";
}

/**
 * Render a human-friendly "Xh Ym remaining" / "Xm remaining" /
 * "<1m remaining" string from a millisecond delta.
 *
 * - >= 1 hour:    "1h 23m remaining"
 * - >= 1 minute:  "23m remaining"
 * - < 1 minute:   "<1m remaining"
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
  if (state.duration === "infinite") return "Timer: Infinite";
  if (remainingMs === null) return "Timer: —";
  return `Timer: ${formatRemaining(remainingMs)}`;
}

export function formatThresholdLine(state: AppState): string {
  return state.batteryThreshold === "off"
    ? "Auto-disable: Off"
    : `Auto-disable: ≤ ${state.batteryThreshold}%`;
}

export function formatStatusLine(state: AppState): string {
  return state.active ? "● Active" : "○ Inactive";
}

/**
 * Short status string for the tray title (next to the icon).
 *
 * Visible cues to the user without clicking the menu:
 * - inactive: empty (icon-only is cleaner)
 * - infinite: "∞"
 * - active timer: "Xm" / "Xh"
 */
export function formatTrayTitle(
  state: AppState,
  remainingMs: number | null,
): string {
  if (!state.active) return "";
  if (state.duration === "infinite") return "∞";
  if (remainingMs === null) return "";
  const totalMin = Math.ceil(remainingMs / 60_000);
  if (totalMin < 60) return `${Math.max(1, totalMin)}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
