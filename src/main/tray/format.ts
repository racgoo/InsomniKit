import { BatterySnapshot, InsomniacState } from "../state/types";

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
  state: InsomniacState,
  remainingMs: number | null,
): string {
  if (state.duration === "infinite") return "Timer: Infinite";
  if (remainingMs === null) return "Timer: —";
  return `Timer: ${formatRemaining(remainingMs)}`;
}

export function formatThresholdLine(state: InsomniacState): string {
  return state.batteryThreshold === "off"
    ? "Auto-disable: Off"
    : `Auto-disable: ≤ ${state.batteryThreshold}%`;
}

export function formatStatusLine(state: InsomniacState): string {
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
  state: InsomniacState,
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
