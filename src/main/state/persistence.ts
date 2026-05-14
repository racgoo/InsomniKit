import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../utils/logger";
import { Store } from "./store";
import {
  BatteryThreshold,
  DurationPreset,
  AppState,
  SleepStrategyKind,
} from "./types";

const log = createLogger("persistence");

/**
 * Subset of state we persist between launches.
 *
 * We deliberately do NOT persist `active` — the user opting in to sleep
 * prevention is an explicit action and shouldn't survive a reboot
 * silently. Battery snapshot and live timer are also runtime-only.
 */
interface PersistedSettings {
  strategy: SleepStrategyKind;
  duration: DurationPreset;
  batteryThreshold: BatteryThreshold;
  launchAtLogin: boolean;
  lidClosedMode: boolean;
}

const VALID_STRATEGIES: ReadonlyArray<SleepStrategyKind> = [
  "caffeinate",
  "pmset",
];
const VALID_DURATIONS: ReadonlyArray<DurationPreset> = [
  "15m",
  "30m",
  "1h",
  "2h",
  "infinite",
];
const VALID_THRESHOLDS: ReadonlyArray<BatteryThreshold> = [
  "off",
  "50",
  "30",
  "20",
];

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/**
 * Path the v0.1 app (productName "Insomniac") wrote to. Electron derives
 * userData from `app.getName()`, so renaming the productName moves us
 * to a fresh directory and the user would otherwise silently lose
 * their preferences. We do a one-shot copy on first launch after the
 * rename and leave the old file in place — non-destructive.
 */
function legacySettingsPath(): string {
  const appData = path.dirname(app.getPath("userData"));
  return path.join(appData, "insomniac", "settings.json");
}

function migrateFromLegacyIfPresent(target: string): void {
  if (fs.existsSync(target)) return;
  const legacy = legacySettingsPath();
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(legacy, target);
    log.info("migrated settings from legacy Insomniac path", { from: legacy });
  } catch (err) {
    log.warn("legacy settings migration failed", err);
  }
}

/**
 * Strict-but-forgiving validator. Any malformed / missing field falls
 * back to its default — a corrupt settings file should never prevent
 * the app from starting.
 */
function validate(input: unknown): Partial<PersistedSettings> {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const out: Partial<PersistedSettings> = {};

  if (
    typeof o.strategy === "string" &&
    (VALID_STRATEGIES as ReadonlyArray<string>).includes(o.strategy)
  ) {
    out.strategy = o.strategy as SleepStrategyKind;
  }
  if (
    typeof o.duration === "string" &&
    (VALID_DURATIONS as ReadonlyArray<string>).includes(o.duration)
  ) {
    out.duration = o.duration as DurationPreset;
  }
  if (
    typeof o.batteryThreshold === "string" &&
    (VALID_THRESHOLDS as ReadonlyArray<string>).includes(o.batteryThreshold)
  ) {
    out.batteryThreshold = o.batteryThreshold as BatteryThreshold;
  }
  if (typeof o.launchAtLogin === "boolean") {
    out.launchAtLogin = o.launchAtLogin;
  }
  if (typeof o.lidClosedMode === "boolean") {
    out.lidClosedMode = o.lidClosedMode;
  }
  return out;
}

export function loadSettings(): Partial<AppState> {
  try {
    const file = settingsPath();
    migrateFromLegacyIfPresent(file);
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    const valid = validate(parsed);
    log.info("loaded settings", valid);
    return valid;
  } catch (err) {
    log.warn("failed to load settings; using defaults", err);
    return {};
  }
}

/**
 * Wire the store to disk. Persists on every `change` event, debounced
 * lightly so a burst of toggles writes once.
 *
 * The write is best-effort: a disk failure should never crash the app.
 */
export function attachPersistence(store: Store): () => void {
  let writeTimer: NodeJS.Timeout | null = null;

  const write = (): void => {
    const s = store.get();
    const payload: PersistedSettings = {
      strategy: s.strategy,
      duration: s.duration,
      batteryThreshold: s.batteryThreshold,
      launchAtLogin: s.launchAtLogin,
      lidClosedMode: s.lidClosedMode,
    };
    try {
      const file = settingsPath();
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      // Atomic-ish: write to tmp then rename, so a crash mid-write
      // can't leave a half-truncated settings.json.
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmp, file);
    } catch (err) {
      log.warn("failed to write settings", err);
    }
  };

  const dispose = store.on("change", () => {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      write();
    }, 200);
    writeTimer.unref?.();
  });

  return () => {
    dispose();
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
      // Flush pending change synchronously on detach.
      write();
    }
  };
}
