import { app } from "electron";
import {
  BatterySnapshot,
  BatteryThreshold,
  Duration,
  LocalePref,
} from "./state/types";
import { createLogger } from "./utils/logger";

const log = createLogger("i18n");

/**
 * Every user-facing string in the menu, the prompt sheets, and the
 * tray title lives here. Adding a locale = one more entry in the
 * locale map + a matching rule in `initI18n`.
 *
 * Functions instead of placeholder strings: it keeps the call sites
 * trivial (`t().battery(snapshot)` rather than printf) and lets each
 * locale shape sentences differently — e.g. Korean prefers
 * "배터리: 82% (충전 중)" over English's "Battery: 82% ⚡".
 */
export interface Messages {
  // ── tray status block ──────────────────────────
  status: (active: boolean) => string;
  powerLine: (b: BatterySnapshot) => string;
  batteryLine: (b: BatterySnapshot) => string;
  batteryEstimate: (b: BatterySnapshot) => string | null;
  timerLine: (duration: Duration, remainingMs: number | null) => string;
  thresholdLine: (t: BatteryThreshold) => string;
  lidCloseWarning: (b: BatterySnapshot) => string | null;

  // ── presets ───────────────────────────────────
  durationPresetLabel: (d: Duration) => string;
  customDurationLabel: (d: Duration) => string;
  thresholdPresetLabel: (t: BatteryThreshold) => string;
  customThresholdLabel: (t: BatteryThreshold) => string;

  // ── menu actions ──────────────────────────────
  appName: string; // proper noun, unchanged
  enable: string;
  disable: string;
  durationSubmenu: string;
  thresholdSubmenu: string;
  customEllipsis: string;
  launchAtLogin: string;
  quit: string;

  // ── Language submenu ──────────────────────────
  languageSubmenu: string;
  languageSystem: string;
  /**
   * Native names for the supported languages — kept in their own
   * language ("English", "한국어") so the choice reads correctly in
   * any catalog.
   */
  languageEnglishNative: string;
  languageKoreanNative: string;

  // ── Stay Awake When Closed ────────────────────
  stayAwakeRoot: (state: LidState) => string; // top-level row
  stayAwakeStatus: (state: LidState) => string; // "Currently: ..."
  stayAwakeDescOff: ReadonlyArray<string>; // shown when OFF
  stayAwakeDescOn: ReadonlyArray<string>; // shown when ON
  stayAwakeTurnOn: string;
  stayAwakeTurnOff: string;

  // ── prompts (osascript display dialog) ────────
  promptDurationTitle: string;
  promptDurationMessage: (min: number, max: number) => string;
  promptThresholdTitle: string;
  promptThresholdMessage: (min: number, max: number) => string;
  promptInvalidTitle: string;
  promptInvalidDuration: (min: number, max: number) => string;
  promptInvalidThreshold: (min: number, max: number) => string;
  promptLidEnableReason: string;
  promptLidDisableReason: string;
  promptLidQuitReason: string;
}

export type LidState = "on" | "off" | "pending";

// ─────────────────────────────────────────────────
// Helpers shared by both catalogs
// ─────────────────────────────────────────────────

/** Pull minutes / hours pair out of a millisecond count. */
function hm(ms: number): { h: number; m: number; totalMin: number } {
  const totalMin = Math.ceil(ms / 60_000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60, totalMin };
}

// ─────────────────────────────────────────────────
// English (default + fallback)
// ─────────────────────────────────────────────────

const en: Messages = {
  status: (active) => (active ? "● Active" : "○ Inactive"),

  powerLine: (b) => {
    if (b.onACOnly) return "Power: AC (desktop)";
    return b.charging ? "Power: AC" : "Power: Battery";
  },

  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "Battery: n/a (desktop)";
    if (b.percent === null) return "Battery: …";
    return `Battery: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },

  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
    return b.charging ? `≈ ${time} to full` : `≈ ${time} on battery`;
  },

  timerLine: (duration, remainingMs) => {
    if (duration === null) return "Timer: Infinite";
    if (remainingMs === null)
      return `Timer: ${en.durationPresetLabel(duration)} (idle)`;
    if (remainingMs <= 0) return "Timer: <1m remaining";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `Timer: ${totalMin}m remaining`;
    if (m === 0) return `Timer: ${h}h remaining`;
    return `Timer: ${h}h ${m}m remaining`;
  },

  thresholdLine: (t) =>
    t === null ? "Auto-disable: Off" : `Auto-disable: ≤ ${t}%`,

  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  Sleeps when closed on battery";
  },

  durationPresetLabel: (d) => {
    if (d === null) return "Infinite";
    if (d < 60) return d === 1 ? "1 minute" : `${d} minutes`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
    return `${h}h ${m}m`;
  },
  customDurationLabel: (d) => `Custom: ${en.durationPresetLabel(d)}`,

  thresholdPresetLabel: (t) => (t === null ? "Off" : `≤ ${t}%`),
  customThresholdLabel: (t) => `Custom: ≤ ${t}%`,

  appName: "InsomniKit",
  enable: "Enable",
  disable: "Disable",
  durationSubmenu: "Duration",
  thresholdSubmenu: "Battery Auto-Disable",
  customEllipsis: "Custom…",
  launchAtLogin: "Launch at Login",
  quit: "Quit InsomniKit",

  // Bilingual + globe glyph on purpose: a user who accidentally
  // switched to a language they can't read still needs to be able to
  // find the language menu. Same string in every catalog.
  languageSubmenu: "🌐 Language / 언어",
  languageSystem: "System Default",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "Stay Awake When Closed: On"
      : state === "pending"
        ? "Stay Awake When Closed: pending…"
        : "Stay Awake When Closed: Off",

  stayAwakeStatus: (state) =>
    state === "on"
      ? "Currently: On (system-wide)"
      : state === "pending"
        ? "Currently: pending…"
        : "Currently: Off",

  stayAwakeDescOff: [
    "Keeps your Mac awake when you close",
    "the laptop — even on battery.",
    "", // separator slot
    "macOS normally sleeps when closed.",
    "This overrides that, system-wide.",
    "You'll be asked for your password.",
  ],
  stayAwakeDescOn: [
    "Your Mac stays awake even when you",
    "close it — including on battery.",
    "", // separator slot
    "Note: this persists across app quit.",
    "Turn it off here when you're done.",
  ],
  stayAwakeTurnOn: "Turn on…",
  stayAwakeTurnOff: "Turn off",

  promptDurationTitle: "InsomniKit · Custom duration",
  promptDurationMessage: (min, max) =>
    `Enter duration in minutes (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · Custom battery threshold",
  promptThresholdMessage: (min, max) =>
    `Auto-disable when battery is at or below this percent (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · Invalid value",
  promptInvalidDuration: (min, max) =>
    `Please enter a whole number of minutes between ${min} and ${max}.`,
  promptInvalidThreshold: (min, max) =>
    `Please enter a whole percent between ${min} and ${max}.`,

  promptLidEnableReason:
    "InsomniKit needs admin access to keep your Mac awake when the lid is closed.",
  promptLidDisableReason:
    "InsomniKit needs admin access to restore the default sleep behavior.",
  promptLidQuitReason:
    "InsomniKit is quitting and needs admin access to restore the default sleep behavior.",
};

// ─────────────────────────────────────────────────
// Korean
// ─────────────────────────────────────────────────

const ko: Messages = {
  status: (active) => (active ? "● 켜짐" : "○ 꺼짐"),

  powerLine: (b) => {
    if (b.onACOnly) return "전원: AC (데스크톱)";
    return b.charging ? "전원: AC" : "전원: 배터리";
  },

  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "배터리: 해당 없음 (데스크톱)";
    if (b.percent === null) return "배터리: …";
    return `배터리: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },

  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
    return b.charging ? `≈ ${time} (완충까지)` : `≈ ${time} (배터리)`;
  },

  timerLine: (duration, remainingMs) => {
    if (duration === null) return "타이머: 무제한";
    if (remainingMs === null)
      return `타이머: ${ko.durationPresetLabel(duration)} (대기)`;
    if (remainingMs <= 0) return "타이머: 1분 이하 남음";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `타이머: ${totalMin}분 남음`;
    if (m === 0) return `타이머: ${h}시간 남음`;
    return `타이머: ${h}시간 ${m}분 남음`;
  },

  thresholdLine: (t) =>
    t === null ? "자동 해제: 끔" : `자동 해제: ${t}% 이하`,

  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  배터리에서는 닫으면 잠";
  },

  durationPresetLabel: (d) => {
    if (d === null) return "무제한";
    if (d < 60) return `${d}분`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  },
  customDurationLabel: (d) => `직접 입력: ${ko.durationPresetLabel(d)}`,

  thresholdPresetLabel: (t) => (t === null ? "끔" : `${t}% 이하`),
  customThresholdLabel: (t) => `직접 입력: ${t}% 이하`,

  appName: "InsomniKit",
  enable: "켜기",
  disable: "끄기",
  durationSubmenu: "지속 시간",
  thresholdSubmenu: "배터리 자동 해제",
  customEllipsis: "직접 입력…",
  launchAtLogin: "로그인 시 실행",
  quit: "InsomniKit 종료",

  // Identical to the English catalog by design — see note there.
  languageSubmenu: "🌐 Language / 언어",
  languageSystem: "시스템 기본값",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "닫아도 깨어있기: 켜짐"
      : state === "pending"
        ? "닫아도 깨어있기: 대기 중…"
        : "닫아도 깨어있기: 꺼짐",

  stayAwakeStatus: (state) =>
    state === "on"
      ? "현재: 켜짐 (시스템 전체)"
      : state === "pending"
        ? "현재: 대기 중…"
        : "현재: 꺼짐",

  stayAwakeDescOff: [
    "노트북을 닫아도 Mac이 깨어있게",
    "합니다 — 배터리 상태에서도.",
    "",
    "macOS는 보통 닫으면 잠들지만,",
    "이걸 시스템 전체에서 무시합니다.",
    "관리자 비밀번호가 필요합니다.",
  ],
  stayAwakeDescOn: [
    "Mac이 닫혀 있어도 깨어있습니다",
    "— 배터리 상태에서도.",
    "",
    "참고: 앱을 종료해도 유지됩니다.",
    "다 쓰고 나면 여기서 꺼주세요.",
  ],
  stayAwakeTurnOn: "켜기…",
  stayAwakeTurnOff: "끄기",

  promptDurationTitle: "InsomniKit · 직접 입력 (시간)",
  promptDurationMessage: (min, max) =>
    `분 단위로 입력하세요 (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · 직접 입력 (배터리)",
  promptThresholdMessage: (min, max) =>
    `배터리가 이 퍼센트 이하면 자동 해제 (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · 유효하지 않은 값",
  promptInvalidDuration: (min, max) =>
    `${min}과 ${max} 사이의 정수를 입력하세요.`,
  promptInvalidThreshold: (min, max) =>
    `${min}과 ${max} 사이의 정수 퍼센트를 입력하세요.`,

  promptLidEnableReason:
    "노트북을 닫아도 Mac을 깨어있게 하려면 관리자 권한이 필요합니다.",
  promptLidDisableReason:
    "기본 잠자기 동작으로 되돌리려면 관리자 권한이 필요합니다.",
  promptLidQuitReason:
    "InsomniKit이 종료됩니다. 기본 잠자기 동작으로 되돌리려면 관리자 권한이 필요합니다.",
};

// ─────────────────────────────────────────────────
// Locale picker
// ─────────────────────────────────────────────────

let current: Messages = en;

function resolveFromSystem(): { messages: Messages; chosen: "ko" | "en" } {
  const sys = app.getLocale().toLowerCase();
  if (sys.startsWith("ko")) return { messages: ko, chosen: "ko" };
  return { messages: en, chosen: "en" };
}

/**
 * Apply a locale preference. `"system"` follows `app.getLocale()`;
 * `"en"` / `"ko"` force that catalog regardless of OS.
 *
 * `app.getLocale()` is only reliable after `app.whenReady`, so the
 * first call should happen from there (the bootstrap does so via
 * `initI18n`). Subsequent calls from the menu handler are safe at
 * any point — the app is already ready.
 */
export function setLocale(pref: LocalePref): void {
  if (pref === "system") {
    const { messages, chosen } = resolveFromSystem();
    current = messages;
    log.info("locale set", { pref, chosen });
  } else if (pref === "ko") {
    current = ko;
    log.info("locale set", { pref, chosen: "ko" });
  } else {
    current = en;
    log.info("locale set", { pref, chosen: "en" });
  }
}

/** Apply persisted locale at startup. Equivalent to `setLocale`. */
export function initI18n(pref: LocalePref): void {
  setLocale(pref);
}

/** Read the current locale catalog. */
export function t(): Messages {
  return current;
}
