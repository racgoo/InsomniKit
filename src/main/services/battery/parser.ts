import { BatterySnapshot } from "../../state/types";

/**
 * Parse `pmset -g batt` output into a BatterySnapshot.
 *
 * Representative outputs (macOS 14):
 *
 *   Now drawing from 'Battery Power'
 *    -InternalBattery-0 (id=4325475)	83%; discharging; 4:21 remaining present: true
 *
 *   Now drawing from 'AC Power'
 *    -InternalBattery-0 (id=4325475)	100%; charged; 0:00 remaining present: true
 *
 *   Now drawing from 'AC Power'
 *   (desktop Mac — no battery section follows)
 *
 * Strategy:
 * - "AC Power" header → charging hint, "Battery Power" → discharging hint.
 * - First `NN%` we encounter on the InternalBattery line wins.
 * - The `; charged|charging|discharging|finishing charge` token refines
 *   `charging` so we correctly report "100% on AC" as charging=true.
 * - If no battery line is found, treat as desktop / ACOnly.
 *
 * We never throw on malformed output — battery info is informational
 * only and the rest of the app must keep working.
 */
export function parseBattery(output: string): BatterySnapshot {
  const lines = output.split(/\r?\n/);

  let onACHeader = false;
  let sawDrawingHeader = false;
  let percent: number | null = null;
  let chargingHint: boolean | null = null;
  let sawBatteryLine = false;
  let timeRemainingMin: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^Now drawing from/i.test(line)) {
      sawDrawingHeader = true;
      onACHeader = /AC Power/i.test(line);
      continue;
    }

    if (/InternalBattery/i.test(line)) {
      sawBatteryLine = true;
      const pctMatch = line.match(/(\d{1,3})\s*%/);
      if (pctMatch) {
        const n = Number(pctMatch[1]);
        if (Number.isFinite(n) && n >= 0 && n <= 100) {
          percent = n;
        }
      }
      if (/;\s*charged\b/i.test(line)) chargingHint = true;
      else if (/;\s*charging\b/i.test(line)) chargingHint = true;
      else if (/;\s*finishing charge\b/i.test(line)) chargingHint = true;
      else if (/;\s*discharging\b/i.test(line)) chargingHint = false;

      // "H:MM remaining" — minutes until empty (discharging) or until
      // full (charging). pmset writes "(no estimate)" while it
      // recalibrates after a power change; we treat that and 0:00 as
      // "unknown" so the UI hides the line cleanly.
      const timeMatch = line.match(/(\d+):(\d{2})\s+remaining/i);
      if (timeMatch) {
        const h = Number(timeMatch[1]);
        const m = Number(timeMatch[2]);
        if (Number.isFinite(h) && Number.isFinite(m) && (h > 0 || m > 0)) {
          timeRemainingMin = h * 60 + m;
        }
      }
    }
  }

  if (!sawBatteryLine) {
    // No internal battery — desktop Mac or stripped output.
    return {
      percent: null,
      charging: sawDrawingHeader ? onACHeader : false,
      onACOnly: true,
      timeRemainingMin: null,
    };
  }

  const charging = chargingHint !== null ? chargingHint : onACHeader;
  return { percent, charging, onACOnly: false, timeRemainingMin };
}
