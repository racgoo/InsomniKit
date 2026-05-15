import { t } from "../i18n";
import { AppState, BatterySnapshot, Duration } from "../state/types";

/**
 * Thin adapters over the i18n catalog. The controller / icon tick code
 * keeps calling `formatX(state)` for readability; the actual strings
 * live in `i18n.ts` per locale.
 */

export function formatBattery(b: BatterySnapshot): string {
  return t().batteryLine(b);
}

export function formatPower(b: BatterySnapshot): string {
  return t().powerLine(b);
}

export function lidCloseWarning(b: BatterySnapshot): string | null {
  return t().lidCloseWarning(b);
}

export function formatDuration(d: Duration): string {
  return t().durationPresetLabel(d);
}

export function formatTimerLine(
  state: AppState,
  remainingMs: number | null,
): string {
  return t().timerLine(state.duration, remainingMs);
}

export function formatThresholdLine(state: AppState): string {
  return t().thresholdLine(state.batteryThreshold);
}

export function formatStatusLine(state: AppState): string {
  return t().status(state.active);
}

export function formatBatteryEstimate(b: BatterySnapshot): string | null {
  return t().batteryEstimate(b);
}

/**
 * Short status string for the tray title (the text next to the icon).
 * Carries only the timer countdown — the "Stay Awake When Closed" badge
 * lives in the icon itself.
 */
export function formatTrayTitle(
  state: AppState,
  remainingMs: number | null,
  _lidClosedActive: boolean,
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
