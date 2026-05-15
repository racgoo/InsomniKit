import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../utils/logger";
import { Store } from "./store";
import {
  AppState,
  BatteryThreshold,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  Duration,
  LOCALE_PREFS,
  LocalePref,
  SleepStrategyKind,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_MIN_PERCENT,
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
  duration: Duration;
  batteryThreshold: BatteryThreshold;
  launchAtLogin: boolean;
  lidClosedMode: boolean;
  locale: LocalePref;
  animateIcon: boolean;
  hideTrayIcon: boolean;
}

const VALID_STRATEGIES: ReadonlyArray<SleepStrategyKind> = [
  "caffeinate",
  "pmset",
];

/**
 * Legacy v0.1 / v0.2 → v0.3 migration map. Older settings stored
 * duration / threshold as labeled strings; the new schema uses raw
 * numbers (minutes / percent) and `null` for off/infinite so custom
 * user input can land in the same shape.
 */
const LEGACY_DURATION_MAP: Record<string, Duration> = {
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  infinite: null,
};
const LEGACY_THRESHOLD_MAP: Record<string, BatteryThreshold> = {
  off: null,
  "50": 50,
  "30": 30,
  "20": 20,
};

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
 *
 * Also handles the v0.1/v0.2 string-form values for duration /
 * batteryThreshold so existing installs upgrade silently.
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

  // Duration: accept number (new) or string (legacy)
  if (o.duration === null) {
    out.duration = null;
  } else if (
    typeof o.duration === "number" &&
    Number.isInteger(o.duration) &&
    o.duration >= DURATION_MIN_MINUTES &&
    o.duration <= DURATION_MAX_MINUTES
  ) {
    out.duration = o.duration;
  } else if (typeof o.duration === "string" && o.duration in LEGACY_DURATION_MAP) {
    out.duration = LEGACY_DURATION_MAP[o.duration];
    log.info("migrated legacy duration string", { from: o.duration, to: out.duration });
  }

  // Battery threshold: accept number (new) or string (legacy)
  if (o.batteryThreshold === null) {
    out.batteryThreshold = null;
  } else if (
    typeof o.batteryThreshold === "number" &&
    Number.isInteger(o.batteryThreshold) &&
    o.batteryThreshold >= THRESHOLD_MIN_PERCENT &&
    o.batteryThreshold <= THRESHOLD_MAX_PERCENT
  ) {
    out.batteryThreshold = o.batteryThreshold;
  } else if (
    typeof o.batteryThreshold === "string" &&
    o.batteryThreshold in LEGACY_THRESHOLD_MAP
  ) {
    out.batteryThreshold = LEGACY_THRESHOLD_MAP[o.batteryThreshold];
    log.info("migrated legacy threshold string", {
      from: o.batteryThreshold,
      to: out.batteryThreshold,
    });
  }

  if (typeof o.launchAtLogin === "boolean") {
    out.launchAtLogin = o.launchAtLogin;
  }
  if (typeof o.lidClosedMode === "boolean") {
    out.lidClosedMode = o.lidClosedMode;
  }
  if (
    typeof o.locale === "string" &&
    (LOCALE_PREFS as ReadonlyArray<string>).includes(o.locale)
  ) {
    out.locale = o.locale as LocalePref;
  }
  if (typeof o.animateIcon === "boolean") {
    out.animateIcon = o.animateIcon;
  }
  if (typeof o.hideTrayIcon === "boolean") {
    out.hideTrayIcon = o.hideTrayIcon;
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
      locale: s.locale,
      animateIcon: s.animateIcon,
      hideTrayIcon: s.hideTrayIcon,
    };
    try {
      const file = settingsPath();
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
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
      write();
    }
  };
}
