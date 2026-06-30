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

  // ── submenu explanation blocks (tray) ─────────
  // Short, plain-language descriptions shown as disabled gray rows at the
  // top of the Duration / Battery-auto-off submenus — the tray's
  // equivalent of the window's tooltips. "" marks a separator slot.
  durationDesc: ReadonlyArray<string>;
  thresholdDesc: ReadonlyArray<string>;

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
  languageJapaneseNative: string;
  languageChineseNative: string;
  languageSpanishNative: string;
  languageGermanNative: string;
  languageFrenchNative: string;

  // ── Animate icon (pulse on/off) ───────────────
  animateIcon: string;

  // ── Hide tray icon ────────────────────────────
  hideTrayIcon: string;
  hideTrayConfirmTitle: string;
  hideTrayConfirmDetail: string;
  hideTrayConfirmHide: string;
  hideTrayConfirmCancel: string;

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

  thresholdLine: (t) => (t === null ? "Off" : `At ${t}% battery`),

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
  thresholdSubmenu: "Auto-Disable on Low Battery",
  customEllipsis: "Custom…",
  launchAtLogin: "Launch at Login",
  quit: "Quit InsomniKit",

  durationDesc: [
    "How long to stay awake before",
    "InsomniKit turns off automatically.",
  ],
  thresholdDesc: [
    "Turns InsomniKit off automatically",
    "when the battery drops this low —",
    "so a forgotten timer won't drain it.",
  ],

  // The English word "Language" stays in every catalog as a universal
  // escape hatch — a user who accidentally switched to a script they
  // can't read can still recognise this row. Non-English catalogs
  // append their own native word ("언어", "言語", "Sprache", …) so
  // the row reads naturally for that locale's intended speaker too.
  // The 🌐 sits at the end (not the start) — a leading emoji would
  // break the visual alignment with the other menu rows that have
  // no prefix.
  languageSubmenu: "Language 🌐",
  languageSystem: "System Default",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "Animate icon",
  hideTrayIcon: "Hide tray icon…",
  hideTrayConfirmTitle: "Hide the tray icon?",
  hideTrayConfirmDetail:
    "InsomniKit will keep running in the background. To bring the icon back, open Spotlight and launch InsomniKit again.",
  hideTrayConfirmHide: "Hide",
  hideTrayConfirmCancel: "Cancel",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "Stay Awake with Lid Closed: On"
      : state === "pending"
        ? "Stay Awake with Lid Closed: pending…"
        : "Stay Awake with Lid Closed: Off",

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
    `Turn off automatically when battery drops to this percent or below (${min}–${max}):`,
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

  thresholdLine: (t) => (t === null ? "끔" : `배터리 ${t}% 도달 시`),

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
  thresholdSubmenu: "배터리 부족 시 InsomniKit 끄기",
  customEllipsis: "직접 입력…",
  launchAtLogin: "로그인 시 실행",
  quit: "InsomniKit 종료",

  durationDesc: [
    "이 시간만큼 깨어 있다가",
    "InsomniKit이 자동으로 꺼집니다.",
  ],
  thresholdDesc: [
    "배터리가 이 값 이하로 떨어지면",
    "InsomniKit을 자동으로 꺼서,",
    "깜빡 잊어도 배터리를 지켜줍니다.",
  ],

  // Native-word suffix — see note in the English catalog above.
  languageSubmenu: "Language / 언어 🌐",
  languageSystem: "시스템 기본값",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "아이콘 애니메이션",
  hideTrayIcon: "트레이 아이콘 숨기기…",
  hideTrayConfirmTitle: "트레이 아이콘을 숨길까요?",
  hideTrayConfirmDetail:
    "InsomniKit은 백그라운드에서 계속 동작합니다. 아이콘을 다시 보이게 하려면 Spotlight에서 InsomniKit을 다시 실행하세요.",
  hideTrayConfirmHide: "숨기기",
  hideTrayConfirmCancel: "취소",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "노트북 닫아도 깨어있기: 켜짐"
      : state === "pending"
        ? "노트북 닫아도 깨어있기: 대기 중…"
        : "노트북 닫아도 깨어있기: 꺼짐",

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
    `배터리가 이 퍼센트 이하로 떨어지면 자동으로 끄기 (${min}–${max}):`,
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
// Japanese
// ─────────────────────────────────────────────────

const ja: Messages = {
  status: (active) => (active ? "● 有効" : "○ 無効"),
  powerLine: (b) => {
    if (b.onACOnly) return "電源: AC (デスクトップ)";
    return b.charging ? "電源: AC" : "電源: バッテリー";
  },
  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "バッテリー: なし (デスクトップ)";
    if (b.percent === null) return "バッテリー: …";
    return `バッテリー: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },
  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}分` : m === 0 ? `${h}時間` : `${h}時間 ${m}分`;
    return b.charging ? `≈ ${time} (満充電まで)` : `≈ ${time} (バッテリー)`;
  },
  timerLine: (duration, remainingMs) => {
    if (duration === null) return "タイマー: 無制限";
    if (remainingMs === null) return `タイマー: ${ja.durationPresetLabel(duration)} (待機)`;
    if (remainingMs <= 0) return "タイマー: 残り 1分未満";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `タイマー: 残り ${totalMin}分`;
    if (m === 0) return `タイマー: 残り ${h}時間`;
    return `タイマー: 残り ${h}時間 ${m}分`;
  },
  thresholdLine: (t) => (t === null ? "オフ" : `バッテリー ${t}% で`),
  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  バッテリー時は閉じると休止";
  },
  durationPresetLabel: (d) => {
    if (d === null) return "無制限";
    if (d < 60) return `${d}分`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return `${h}時間`;
    return `${h}時間 ${m}分`;
  },
  customDurationLabel: (d) => `カスタム: ${ja.durationPresetLabel(d)}`,
  thresholdPresetLabel: (t) => (t === null ? "オフ" : `${t}% 以下`),
  customThresholdLabel: (t) => `カスタム: ${t}% 以下`,

  appName: "InsomniKit",
  enable: "有効化",
  disable: "無効化",
  durationSubmenu: "持続時間",
  thresholdSubmenu: "バッテリー低下時に InsomniKit をオフ",
  customEllipsis: "カスタム…",
  launchAtLogin: "ログイン時に起動",
  quit: "InsomniKit を終了",

  durationDesc: [
    "この時間だけ起きていて、その後",
    "InsomniKit が自動でオフになります。",
  ],
  thresholdDesc: [
    "バッテリーがこの値以下になると",
    "InsomniKit を自動でオフにし、",
    "切り忘れても電池を守ります。",
  ],

  languageSubmenu: "Language / 言語 🌐",
  languageSystem: "システムのデフォルト",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "アイコンをアニメーション",
  hideTrayIcon: "トレイアイコンを隠す…",
  hideTrayConfirmTitle: "トレイアイコンを隠しますか？",
  hideTrayConfirmDetail:
    "InsomniKit はバックグラウンドで動作し続けます。アイコンを再表示するには、Spotlight から InsomniKit を再起動してください。",
  hideTrayConfirmHide: "隠す",
  hideTrayConfirmCancel: "キャンセル",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "フタを閉じても起きたまま: オン"
      : state === "pending"
        ? "フタを閉じても起きたまま: 待機中…"
        : "フタを閉じても起きたまま: オフ",
  stayAwakeStatus: (state) =>
    state === "on"
      ? "現在: オン (システム全体)"
      : state === "pending"
        ? "現在: 待機中…"
        : "現在: オフ",
  stayAwakeDescOff: [
    "Mac を閉じても起きたまま保ちます",
    "— バッテリー時も含めて。",
    "",
    "macOS は通常閉じると休止します。",
    "システム全体でこれを上書きします。",
    "パスワードを求められます。",
  ],
  stayAwakeDescOn: [
    "Mac は閉じても起きたままです",
    "— バッテリー時も含めて。",
    "",
    "メモ: 終了後も保持されます。",
    "完了したらここでオフにしてください。",
  ],
  stayAwakeTurnOn: "オンにする…",
  stayAwakeTurnOff: "オフにする",

  promptDurationTitle: "InsomniKit · カスタム時間",
  promptDurationMessage: (min, max) => `持続時間を分単位で入力 (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · カスタムバッテリーしきい値",
  promptThresholdMessage: (min, max) =>
    `バッテリーがこのパーセント以下になったら自動でオフ (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · 無効な値",
  promptInvalidDuration: (min, max) =>
    `${min} から ${max} の整数(分)を入力してください。`,
  promptInvalidThreshold: (min, max) =>
    `${min} から ${max} の整数パーセントを入力してください。`,
  promptLidEnableReason:
    "Mac を閉じても起きたままにするには管理者権限が必要です。",
  promptLidDisableReason:
    "デフォルトの休止動作に戻すには管理者権限が必要です。",
  promptLidQuitReason:
    "InsomniKit を終了します。デフォルトの休止動作に戻すには管理者権限が必要です。",
};

// ─────────────────────────────────────────────────
// Chinese (Simplified)
// ─────────────────────────────────────────────────

const zh: Messages = {
  status: (active) => (active ? "● 已开启" : "○ 已关闭"),
  powerLine: (b) => {
    if (b.onACOnly) return "电源: 交流 (台式机)";
    return b.charging ? "电源: 交流" : "电源: 电池";
  },
  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "电池: 无 (台式机)";
    if (b.percent === null) return "电池: …";
    return `电池: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },
  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}分钟` : m === 0 ? `${h}小时` : `${h}小时 ${m}分`;
    return b.charging ? `≈ ${time} (充满)` : `≈ ${time} (电池)`;
  },
  timerLine: (duration, remainingMs) => {
    if (duration === null) return "计时器: 无限";
    if (remainingMs === null) return `计时器: ${zh.durationPresetLabel(duration)} (空闲)`;
    if (remainingMs <= 0) return "计时器: 剩余不到 1分钟";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `计时器: 剩余 ${totalMin}分钟`;
    if (m === 0) return `计时器: 剩余 ${h}小时`;
    return `计时器: 剩余 ${h}小时 ${m}分`;
  },
  thresholdLine: (t) => (t === null ? "关" : `电量 ${t}% 时`),
  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  电池模式下合盖会休眠";
  },
  durationPresetLabel: (d) => {
    if (d === null) return "无限";
    if (d < 60) return `${d} 分钟`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return `${h} 小时`;
    return `${h}小时 ${m}分`;
  },
  customDurationLabel: (d) => `自定义: ${zh.durationPresetLabel(d)}`,
  thresholdPresetLabel: (t) => (t === null ? "关" : `≤ ${t}%`),
  customThresholdLabel: (t) => `自定义: ≤ ${t}%`,

  appName: "InsomniKit",
  enable: "开启",
  disable: "关闭",
  durationSubmenu: "持续时间",
  thresholdSubmenu: "电量低时关闭 InsomniKit",
  customEllipsis: "自定义…",
  launchAtLogin: "登录时启动",
  quit: "退出 InsomniKit",

  durationDesc: [
    "保持唤醒这段时间后，",
    "InsomniKit 会自动关闭。",
  ],
  thresholdDesc: [
    "当电量降到此水平时，",
    "自动关闭 InsomniKit，",
    "忘了关也不会耗尽电池。",
  ],

  languageSubmenu: "Language / 语言 🌐",
  languageSystem: "系统默认",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "图标动画",
  hideTrayIcon: "隐藏菜单栏图标…",
  hideTrayConfirmTitle: "隐藏菜单栏图标？",
  hideTrayConfirmDetail:
    "InsomniKit 将继续在后台运行。要重新显示图标，请通过 Spotlight 再次启动 InsomniKit。",
  hideTrayConfirmHide: "隐藏",
  hideTrayConfirmCancel: "取消",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "合盖保持唤醒: 开"
      : state === "pending"
        ? "合盖保持唤醒: 等待中…"
        : "合盖保持唤醒: 关",
  stayAwakeStatus: (state) =>
    state === "on"
      ? "当前: 开 (系统全局)"
      : state === "pending"
        ? "当前: 等待中…"
        : "当前: 关",
  stayAwakeDescOff: [
    "关闭笔记本盖子时保持 Mac 唤醒",
    "— 即使在电池模式下。",
    "",
    "macOS 通常会在合盖时休眠。",
    "这将在系统范围内覆盖此行为。",
    "需要您的密码。",
  ],
  stayAwakeDescOn: [
    "您的 Mac 在合盖时保持唤醒",
    "— 即使在电池模式下。",
    "",
    "注意: 应用退出后此设置仍保持。",
    "完成后在此处关闭。",
  ],
  stayAwakeTurnOn: "开启…",
  stayAwakeTurnOff: "关闭",

  promptDurationTitle: "InsomniKit · 自定义时长",
  promptDurationMessage: (min, max) => `请输入以分钟为单位的持续时间 (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · 自定义电池阈值",
  promptThresholdMessage: (min, max) => `当电池低于此百分比时自动关闭 (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · 无效值",
  promptInvalidDuration: (min, max) =>
    `请输入 ${min} 到 ${max} 之间的整数分钟。`,
  promptInvalidThreshold: (min, max) =>
    `请输入 ${min} 到 ${max} 之间的整数百分比。`,
  promptLidEnableReason:
    "InsomniKit 需要管理员权限才能在合盖时保持 Mac 唤醒。",
  promptLidDisableReason:
    "InsomniKit 需要管理员权限才能恢复默认的休眠行为。",
  promptLidQuitReason:
    "InsomniKit 正在退出，需要管理员权限恢复默认的休眠行为。",
};

// ─────────────────────────────────────────────────
// Spanish
// ─────────────────────────────────────────────────

const es: Messages = {
  status: (active) => (active ? "● Activo" : "○ Inactivo"),
  powerLine: (b) => {
    if (b.onACOnly) return "Energía: CA (escritorio)";
    return b.charging ? "Energía: CA" : "Energía: Batería";
  },
  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "Batería: n/d (escritorio)";
    if (b.percent === null) return "Batería: …";
    return `Batería: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },
  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
    return b.charging ? `≈ ${time} hasta carga completa` : `≈ ${time} con batería`;
  },
  timerLine: (duration, remainingMs) => {
    if (duration === null) return "Temporizador: Infinito";
    if (remainingMs === null) return `Temporizador: ${es.durationPresetLabel(duration)} (en espera)`;
    if (remainingMs <= 0) return "Temporizador: <1m restante";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `Temporizador: ${totalMin}m restante${totalMin === 1 ? "" : "s"}`;
    if (m === 0) return `Temporizador: ${h}h restante${h === 1 ? "" : "s"}`;
    return `Temporizador: ${h}h ${m}m restantes`;
  },
  thresholdLine: (t) => (t === null ? "Desactivado" : `Al ${t}% de batería`),
  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  Se duerme al cerrar con batería";
  },
  durationPresetLabel: (d) => {
    if (d === null) return "Infinito";
    if (d < 60) return d === 1 ? "1 minuto" : `${d} minutos`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return h === 1 ? "1 hora" : `${h} horas`;
    return `${h}h ${m}m`;
  },
  customDurationLabel: (d) => `Personalizado: ${es.durationPresetLabel(d)}`,
  thresholdPresetLabel: (t) => (t === null ? "Desactivado" : `≤ ${t}%`),
  customThresholdLabel: (t) => `Personalizado: ≤ ${t}%`,

  appName: "InsomniKit",
  enable: "Activar",
  disable: "Desactivar",
  durationSubmenu: "Duración",
  thresholdSubmenu: "Desactivar con batería baja",
  customEllipsis: "Personalizado…",
  launchAtLogin: "Iniciar al iniciar sesión",
  quit: "Salir de InsomniKit",

  durationDesc: [
    "Tiempo despierto antes de que",
    "InsomniKit se apague solo.",
  ],
  thresholdDesc: [
    "Apaga InsomniKit automáticamente",
    "cuando la batería baja tanto —",
    "un temporizador olvidado no la agota.",
  ],

  languageSubmenu: "Language / Idioma 🌐",
  languageSystem: "Predeterminado del sistema",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "Animar icono",
  hideTrayIcon: "Ocultar icono de la barra de menús…",
  hideTrayConfirmTitle: "¿Ocultar el icono?",
  hideTrayConfirmDetail:
    "InsomniKit seguirá ejecutándose en segundo plano. Para volver a mostrar el icono, abre Spotlight y reinicia InsomniKit.",
  hideTrayConfirmHide: "Ocultar",
  hideTrayConfirmCancel: "Cancelar",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "Despierto con la tapa cerrada: Activado"
      : state === "pending"
        ? "Despierto con la tapa cerrada: pendiente…"
        : "Despierto con la tapa cerrada: Desactivado",
  stayAwakeStatus: (state) =>
    state === "on"
      ? "Actualmente: Activado (en todo el sistema)"
      : state === "pending"
        ? "Actualmente: pendiente…"
        : "Actualmente: Desactivado",
  stayAwakeDescOff: [
    "Mantiene tu Mac despierto cuando",
    "cierras el portátil — incluso con batería.",
    "",
    "macOS normalmente se duerme al cerrar.",
    "Esto lo anula, en todo el sistema.",
    "Se te pedirá tu contraseña.",
  ],
  stayAwakeDescOn: [
    "Tu Mac sigue despierto incluso cuando",
    "lo cierras — incluso con batería.",
    "",
    "Nota: persiste tras cerrar la app.",
    "Desactívalo aquí cuando termines.",
  ],
  stayAwakeTurnOn: "Activar…",
  stayAwakeTurnOff: "Desactivar",

  promptDurationTitle: "InsomniKit · Duración personalizada",
  promptDurationMessage: (min, max) => `Introduce la duración en minutos (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · Umbral de batería personalizado",
  promptThresholdMessage: (min, max) =>
    `Apagar automáticamente cuando la batería baje a este porcentaje o menos (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · Valor inválido",
  promptInvalidDuration: (min, max) =>
    `Por favor introduce un número entero de minutos entre ${min} y ${max}.`,
  promptInvalidThreshold: (min, max) =>
    `Por favor introduce un porcentaje entero entre ${min} y ${max}.`,
  promptLidEnableReason:
    "InsomniKit necesita permisos de administrador para mantener tu Mac despierto cuando se cierra la tapa.",
  promptLidDisableReason:
    "InsomniKit necesita permisos de administrador para restaurar el comportamiento de suspensión predeterminado.",
  promptLidQuitReason:
    "InsomniKit se está cerrando y necesita permisos de administrador para restaurar el comportamiento de suspensión predeterminado.",
};

// ─────────────────────────────────────────────────
// German
// ─────────────────────────────────────────────────

const de: Messages = {
  status: (active) => (active ? "● Aktiv" : "○ Inaktiv"),
  powerLine: (b) => {
    if (b.onACOnly) return "Stromversorgung: Netzteil (Desktop)";
    return b.charging ? "Stromversorgung: Netzteil" : "Stromversorgung: Akku";
  },
  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "Akku: nicht verfügbar (Desktop)";
    if (b.percent === null) return "Akku: …";
    return `Akku: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },
  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
    return b.charging ? `≈ ${time} bis voll` : `≈ ${time} im Akkubetrieb`;
  },
  timerLine: (duration, remainingMs) => {
    if (duration === null) return "Timer: Unbegrenzt";
    if (remainingMs === null) return `Timer: ${de.durationPresetLabel(duration)} (Leerlauf)`;
    if (remainingMs <= 0) return "Timer: <1m verbleibend";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `Timer: ${totalMin}m verbleibend`;
    if (m === 0) return `Timer: ${h}h verbleibend`;
    return `Timer: ${h}h ${m}m verbleibend`;
  },
  thresholdLine: (t) => (t === null ? "Aus" : `Bei ${t}% Akku`),
  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  Schläft im Akkubetrieb beim Schließen";
  },
  durationPresetLabel: (d) => {
    if (d === null) return "Unbegrenzt";
    if (d < 60) return d === 1 ? "1 Minute" : `${d} Minuten`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return h === 1 ? "1 Stunde" : `${h} Stunden`;
    return `${h}h ${m}m`;
  },
  customDurationLabel: (d) => `Benutzerdefiniert: ${de.durationPresetLabel(d)}`,
  thresholdPresetLabel: (t) => (t === null ? "Aus" : `≤ ${t}%`),
  customThresholdLabel: (t) => `Benutzerdefiniert: ≤ ${t}%`,

  appName: "InsomniKit",
  enable: "Aktivieren",
  disable: "Deaktivieren",
  durationSubmenu: "Dauer",
  thresholdSubmenu: "InsomniKit bei wenig Akku ausschalten",
  customEllipsis: "Benutzerdefiniert…",
  launchAtLogin: "Beim Anmelden starten",
  quit: "InsomniKit beenden",

  durationDesc: [
    "So lange wach bleiben, dann",
    "schaltet sich InsomniKit selbst aus.",
  ],
  thresholdDesc: [
    "Schaltet InsomniKit automatisch aus,",
    "wenn der Akku so weit fällt —",
    "ein vergessener Timer leert ihn nicht.",
  ],

  languageSubmenu: "Language / Sprache 🌐",
  languageSystem: "Systemstandard",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "Symbol animieren",
  hideTrayIcon: "Menüleisten-Symbol ausblenden…",
  hideTrayConfirmTitle: "Symbol ausblenden?",
  hideTrayConfirmDetail:
    "InsomniKit läuft weiter im Hintergrund. Um das Symbol wieder einzublenden, öffne Spotlight und starte InsomniKit erneut.",
  hideTrayConfirmHide: "Ausblenden",
  hideTrayConfirmCancel: "Abbrechen",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "Bei geschlossenem Deckel wach: Ein"
      : state === "pending"
        ? "Bei geschlossenem Deckel wach: wird übernommen…"
        : "Bei geschlossenem Deckel wach: Aus",
  stayAwakeStatus: (state) =>
    state === "on"
      ? "Aktuell: Ein (systemweit)"
      : state === "pending"
        ? "Aktuell: wird übernommen…"
        : "Aktuell: Aus",
  stayAwakeDescOff: [
    "Hält deinen Mac wach, wenn du",
    "das Notebook schließt — auch im Akkubetrieb.",
    "",
    "macOS schläft normalerweise beim Schließen.",
    "Dies überschreibt das systemweit.",
    "Du wirst nach deinem Passwort gefragt.",
  ],
  stayAwakeDescOn: [
    "Dein Mac bleibt wach, auch wenn du",
    "ihn schließt — auch im Akkubetrieb.",
    "",
    "Hinweis: bleibt nach App-Beendigung erhalten.",
    "Hier deaktivieren, wenn du fertig bist.",
  ],
  stayAwakeTurnOn: "Aktivieren…",
  stayAwakeTurnOff: "Deaktivieren",

  promptDurationTitle: "InsomniKit · Benutzerdefinierte Dauer",
  promptDurationMessage: (min, max) => `Gib die Dauer in Minuten ein (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · Benutzerdefinierter Akku-Schwellwert",
  promptThresholdMessage: (min, max) =>
    `Automatisch ausschalten, wenn der Akku auf diesen Prozentwert oder darunter fällt (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · Ungültiger Wert",
  promptInvalidDuration: (min, max) =>
    `Bitte gib eine ganze Zahl an Minuten zwischen ${min} und ${max} ein.`,
  promptInvalidThreshold: (min, max) =>
    `Bitte gib einen ganzzahligen Prozentwert zwischen ${min} und ${max} ein.`,
  promptLidEnableReason:
    "InsomniKit benötigt Administratorrechte, um deinen Mac wach zu halten, wenn das Display geschlossen ist.",
  promptLidDisableReason:
    "InsomniKit benötigt Administratorrechte, um das Standard-Ruhezustandsverhalten wiederherzustellen.",
  promptLidQuitReason:
    "InsomniKit wird beendet und benötigt Administratorrechte, um das Standard-Ruhezustandsverhalten wiederherzustellen.",
};

// ─────────────────────────────────────────────────
// French
// ─────────────────────────────────────────────────

const fr: Messages = {
  status: (active) => (active ? "● Actif" : "○ Inactif"),
  powerLine: (b) => {
    if (b.onACOnly) return "Alimentation: Secteur (bureau)";
    return b.charging ? "Alimentation: Secteur" : "Alimentation: Batterie";
  },
  batteryLine: (b) => {
    if (b.onACOnly && b.percent === null) return "Batterie: non disponible (bureau)";
    if (b.percent === null) return "Batterie: …";
    return `Batterie: ${b.percent}%${b.charging ? " ⚡" : ""}`;
  },
  batteryEstimate: (b) => {
    if (b.onACOnly || b.timeRemainingMin === null) return null;
    const h = Math.floor(b.timeRemainingMin / 60);
    const m = b.timeRemainingMin % 60;
    const time = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
    return b.charging ? `≈ ${time} jusqu'à pleine charge` : `≈ ${time} sur batterie`;
  },
  timerLine: (duration, remainingMs) => {
    if (duration === null) return "Minuteur: Illimité";
    if (remainingMs === null) return `Minuteur: ${fr.durationPresetLabel(duration)} (en attente)`;
    if (remainingMs <= 0) return "Minuteur: <1m restant";
    const { h, m, totalMin } = hm(remainingMs);
    if (totalMin < 60) return `Minuteur: ${totalMin}m restant${totalMin === 1 ? "" : "es"}`;
    if (m === 0) return `Minuteur: ${h}h restante${h === 1 ? "" : "s"}`;
    return `Minuteur: ${h}h ${m}m restantes`;
  },
  thresholdLine: (t) => (t === null ? "Désactivé" : `À ${t}% de batterie`),
  lidCloseWarning: (b) => {
    if (b.onACOnly || b.charging) return null;
    return "⚠︎  Dort en fermant le capot sur batterie";
  },
  durationPresetLabel: (d) => {
    if (d === null) return "Illimité";
    if (d < 60) return d === 1 ? "1 minute" : `${d} minutes`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    if (m === 0) return h === 1 ? "1 heure" : `${h} heures`;
    return `${h}h ${m}m`;
  },
  customDurationLabel: (d) => `Personnalisé: ${fr.durationPresetLabel(d)}`,
  thresholdPresetLabel: (t) => (t === null ? "Désactivé" : `≤ ${t}%`),
  customThresholdLabel: (t) => `Personnalisé: ≤ ${t}%`,

  appName: "InsomniKit",
  enable: "Activer",
  disable: "Désactiver",
  durationSubmenu: "Durée",
  thresholdSubmenu: "Désactiver si batterie faible",
  customEllipsis: "Personnalisé…",
  launchAtLogin: "Lancer à la connexion",
  quit: "Quitter InsomniKit",

  durationDesc: [
    "Rester éveillé ce temps, puis",
    "InsomniKit s'arrête automatiquement.",
  ],
  thresholdDesc: [
    "Arrête InsomniKit automatiquement",
    "quand la batterie descend si bas —",
    "un minuteur oublié ne la vide pas.",
  ],

  languageSubmenu: "Language / Langue 🌐",
  languageSystem: "Par défaut du système",
  languageEnglishNative: "English",
  languageKoreanNative: "한국어",
  languageJapaneseNative: "日本語",
  languageChineseNative: "中文 (简体)",
  languageSpanishNative: "Español",
  languageGermanNative: "Deutsch",
  languageFrenchNative: "Français",

  animateIcon: "Animer l'icône",
  hideTrayIcon: "Masquer l'icône de la barre de menus…",
  hideTrayConfirmTitle: "Masquer l'icône ?",
  hideTrayConfirmDetail:
    "InsomniKit continuera à fonctionner en arrière-plan. Pour réafficher l'icône, ouvrez Spotlight et relancez InsomniKit.",
  hideTrayConfirmHide: "Masquer",
  hideTrayConfirmCancel: "Annuler",

  stayAwakeRoot: (state) =>
    state === "on"
      ? "Éveillé capot fermé: Activé"
      : state === "pending"
        ? "Éveillé capot fermé: en attente…"
        : "Éveillé capot fermé: Désactivé",
  stayAwakeStatus: (state) =>
    state === "on"
      ? "Actuellement: Activé (système entier)"
      : state === "pending"
        ? "Actuellement: en attente…"
        : "Actuellement: Désactivé",
  stayAwakeDescOff: [
    "Garde votre Mac éveillé quand vous",
    "fermez le capot — même sur batterie.",
    "",
    "macOS s'endort normalement à la fermeture.",
    "Cela l'écrase, à l'échelle du système.",
    "Votre mot de passe sera demandé.",
  ],
  stayAwakeDescOn: [
    "Votre Mac reste éveillé même quand",
    "vous le fermez — même sur batterie.",
    "",
    "Note: persiste après fermeture de l'app.",
    "Désactivez ici une fois terminé.",
  ],
  stayAwakeTurnOn: "Activer…",
  stayAwakeTurnOff: "Désactiver",

  promptDurationTitle: "InsomniKit · Durée personnalisée",
  promptDurationMessage: (min, max) => `Entrez la durée en minutes (${min}–${max}):`,
  promptThresholdTitle: "InsomniKit · Seuil de batterie personnalisé",
  promptThresholdMessage: (min, max) =>
    `S'arrêter automatiquement quand la batterie descend à ce pourcentage ou en dessous (${min}–${max}):`,
  promptInvalidTitle: "InsomniKit · Valeur invalide",
  promptInvalidDuration: (min, max) =>
    `Veuillez entrer un nombre entier de minutes entre ${min} et ${max}.`,
  promptInvalidThreshold: (min, max) =>
    `Veuillez entrer un pourcentage entier entre ${min} et ${max}.`,
  promptLidEnableReason:
    "InsomniKit a besoin des droits administrateur pour garder votre Mac éveillé lorsque le capot est fermé.",
  promptLidDisableReason:
    "InsomniKit a besoin des droits administrateur pour rétablir le comportement de mise en veille par défaut.",
  promptLidQuitReason:
    "InsomniKit se ferme et a besoin des droits administrateur pour rétablir le comportement de mise en veille par défaut.",
};

// ─────────────────────────────────────────────────
// Locale picker
// ─────────────────────────────────────────────────

const CATALOGS: Record<Exclude<LocalePref, "system">, Messages> = {
  en, ko, ja, zh, es, de, fr,
};

let current: Messages = en;
/** The resolved catalog key (never "system") — drives WINDOW_LABELS. */
let currentKey: Exclude<LocalePref, "system"> = "en";

function resolveFromSystem(): { messages: Messages; chosen: string } {
  const sys = app.getLocale().toLowerCase();
  if (sys.startsWith("ko")) return { messages: ko, chosen: "ko" };
  if (sys.startsWith("ja")) return { messages: ja, chosen: "ja" };
  if (sys.startsWith("zh")) return { messages: zh, chosen: "zh" };
  if (sys.startsWith("es")) return { messages: es, chosen: "es" };
  if (sys.startsWith("de")) return { messages: de, chosen: "de" };
  if (sys.startsWith("fr")) return { messages: fr, chosen: "fr" };
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
    currentKey = chosen as Exclude<LocalePref, "system">;
    log.info("locale set", { pref, chosen });
    return;
  }
  current = CATALOGS[pref];
  currentKey = pref;
  log.info("locale set", { pref, chosen: pref });
}

/** Apply persisted locale at startup. Equivalent to `setLocale`. */
export function initI18n(pref: LocalePref): void {
  setLocale(pref);
}

/** Read the current locale catalog. */
export function t(): Messages {
  return current;
}

/**
 * Native name of the language `app.getLocale()` would resolve to right
 * now — independent of the user's persisted override. Used to show
 * "System Default · 한국어" in the Language submenu so the user can
 * see at a glance what "system" actually means on this Mac.
 *
 * Returns native names from the English catalog (which has them all
 * defined identically across catalogs) so the function is locale-
 * agnostic.
 */
export function getSystemResolvedNativeName(): string {
  const { chosen } = resolveFromSystem();
  switch (chosen) {
    case "ko": return en.languageKoreanNative;
    case "ja": return en.languageJapaneseNative;
    case "zh": return en.languageChineseNative;
    case "es": return en.languageSpanishNative;
    case "de": return en.languageGermanNative;
    case "fr": return en.languageFrenchNative;
    default:   return en.languageEnglishNative;
  }
}

// ─────────────────────────────────────────────────
// Window / widget UI strings
//
// Kept separate from `Messages` (the tray catalog) because these labels
// only exist for the app window and the desktop widget. Same per-locale
// shape; resolved through `currentKey` so they switch in lockstep with
// the tray when the user changes language.
// ─────────────────────────────────────────────────
export interface WindowLabels {
  openWindow: string; // tray menu row: bring the window up
  showWidget: string; // tray menu + window button
  hideWidget: string; // tray menu + window button
  statusSection: string;
  settingsSection: string;
  stayAwakeWhenClosed: string;
  stayAwakeHint: string; // one-line explanation under the toggle
  tagline: string;
  custom: string;
  minutesAbbrev: string;
  percentAbbrev: string;

  // ── inline hints + tooltips (window) ──────────
  // `*Hint` = one short line shown directly under a control.
  // `*Tip`  = the full explanation behind the ⓘ tooltip icon.
  durationHint: string;
  durationTip: string;
  thresholdHint: string;
  thresholdTip: string;
  stayAwakeTip: string;
  launchAtLoginTip: string;
  animateIconTip: string;
  languageTip: string;
  infoLabel: string; // aria-label for the ⓘ tooltip icons

  // ── lid-closed status badge (top of window + widget) ──
  // Short effect-phrasing shown on the prominent on/off badge, so the
  // (important) lid-closed state is glanceable without opening settings.
  lidBadgeOn: string;
  lidBadgeOff: string;
}

const WINDOW_LABELS: Record<Exclude<LocalePref, "system">, WindowLabels> = {
  en: {
    openWindow: "Open Window",
    showWidget: "Show Widget",
    hideWidget: "Hide Widget",
    statusSection: "Status",
    settingsSection: "Settings",
    stayAwakeWhenClosed: "Stay awake with lid closed",
    stayAwakeHint: "Keep running when you close the laptop — even on battery.",
    tagline: "Keep your Mac awake",
    custom: "Custom",
    minutesAbbrev: "min",
    percentAbbrev: "%",
    durationHint: "Stays awake this long, then turns off on its own.",
    durationTip:
      "InsomniKit keeps your Mac awake for this long, then turns itself off automatically. Pick ∞ to stay awake until you turn it off yourself, or set any custom value from 1 to 1440 minutes.",
    thresholdHint: "Turns off by itself when the battery gets low.",
    thresholdTip:
      "When the battery falls to this level or lower, InsomniKit switches off automatically and lets your Mac sleep — so a timer you forgot about can't drain the battery flat. Set it to Off to ignore the battery level.",
    stayAwakeTip:
      "Stops your Mac from sleeping when you close the lid, so your work keeps running — downloads, builds, agents — even on battery. Reopen and you're right back where you were, because it never slept. It's a system-wide macOS setting, so it asks for your admin password and stays on even after you quit InsomniKit — switch it off here when you're done.",
    launchAtLoginTip:
      "Add InsomniKit to your menu bar automatically every time you log in. It starts inactive — it won't keep your Mac awake until you turn it on.",
    animateIconTip:
      "Gently pulse the menu-bar icon while your Mac is being kept awake, so you can tell at a glance that it's working. Turn this off to keep the icon perfectly still.",
    languageTip:
      "Choose the language for InsomniKit's menus and window. 'System Default' follows your Mac's language automatically.",
    infoLabel: "More info",
    lidBadgeOn: "Awake when closed",
    lidBadgeOff: "Stay-awake off",
  },
  ko: {
    openWindow: "창 열기",
    showWidget: "위젯 표시",
    hideWidget: "위젯 숨기기",
    statusSection: "상태",
    settingsSection: "설정",
    stayAwakeWhenClosed: "노트북 닫아도 깨어 있기",
    stayAwakeHint: "노트북을 닫아도 Mac이 잠들지 않아요 — 배터리에서도.",
    tagline: "Mac을 깨어 있게 유지",
    custom: "사용자 지정",
    minutesAbbrev: "분",
    percentAbbrev: "%",
    durationHint: "이 시간 동안 깨어 있다가 자동으로 꺼져요.",
    durationTip:
      "선택한 시간만큼 Mac을 깨어 있게 한 뒤 자동으로 꺼집니다. ∞를 고르면 직접 끌 때까지 계속 유지되고, 1~1440분 사이로 원하는 값을 직접 입력할 수도 있어요.",
    thresholdHint: "배터리가 부족해지면 스스로 꺼져요.",
    thresholdTip:
      "배터리가 이 값 이하로 떨어지면 InsomniKit이 자동으로 꺼지고 Mac이 다시 잠들 수 있게 합니다. 깜빡 잊고 켜둬도 배터리가 바닥까지 닳지 않아요. '끔'으로 두면 배터리 잔량을 신경 쓰지 않습니다.",
    stayAwakeTip:
      "노트북을 닫아도 Mac이 잠들지 않아서 하던 작업이 계속 돌아가요 — 다운로드·빌드·에이전트, 배터리에서도요. 잠든 적이 없으니 다시 열면 바로 그 자리예요. macOS 전체에 적용되는 설정이라 켤 때 관리자 비밀번호를 묻고, InsomniKit을 종료해도 켜진 채로 남으니 다 쓰면 여기서 꺼주세요.",
    launchAtLoginTip:
      "Mac에 로그인할 때마다 InsomniKit을 메뉴 막대에 자동으로 띄웁니다. 꺼진 상태로 시작하니, 직접 켜기 전까지는 잠을 막지 않아요.",
    animateIconTip:
      "Mac을 깨어 있게 하는 동안 메뉴 막대 아이콘이 은은하게 깜빡여요. 동작 중인지 한눈에 알 수 있죠. 끄면 아이콘이 움직이지 않고 가만히 있습니다.",
    languageTip:
      "InsomniKit 메뉴와 창에 사용할 언어를 고릅니다. '시스템 기본값'은 Mac의 언어를 자동으로 따라가요.",
    infoLabel: "자세히 보기",
    lidBadgeOn: "닫아도 깨어 있음",
    lidBadgeOff: "닫아도 깨어있기 끔",
  },
  ja: {
    openWindow: "ウィンドウを開く",
    showWidget: "ウィジェットを表示",
    hideWidget: "ウィジェットを隠す",
    statusSection: "ステータス",
    settingsSection: "設定",
    stayAwakeWhenClosed: "フタを閉じても起動を維持",
    stayAwakeHint: "ノートを閉じてもシステムは動き続けます（バッテリーでも）。",
    tagline: "Mac をスリープさせない",
    custom: "カスタム",
    minutesAbbrev: "分",
    percentAbbrev: "%",
    durationHint: "この時間だけ起きていて、自動でオフになります。",
    durationTip:
      "選んだ時間だけ Mac を起きたままにし、その後は自動でオフになります。∞ を選ぶと自分でオフにするまで起きたまま。1〜1440 分の範囲で自由に指定することもできます。",
    thresholdHint: "バッテリーが少なくなると自動でオフになります。",
    thresholdTip:
      "バッテリーがこの値以下になると、InsomniKit は自動でオフになり Mac がスリープできるようになります。切り忘れてもバッテリーを使い切る心配がありません。「オフ」にするとバッテリー残量を気にしません。",
    stayAwakeTip:
      "フタを閉じても Mac がスリープせず、作業が動き続けます — ダウンロード・ビルド・エージェント、バッテリー時も。スリープしていないので、開けばすぐ元の状態に戻ります。macOS 全体に適用される設定なので管理者パスワードを求められ、InsomniKit を終了してもオンのまま残ります。終わったらここでオフにしてください。",
    launchAtLoginTip:
      "ログインするたびに InsomniKit をメニューバーに自動で表示します。オフの状態で起動するので、自分でオンにするまでスリープを止めません。",
    animateIconTip:
      "Mac を起きたままにしている間、メニューバーのアイコンがゆっくり点滅します。動作中かどうか一目で分かります。オフにするとアイコンは動かず静止します。",
    languageTip:
      "InsomniKit のメニューとウィンドウの言語を選びます。「システムのデフォルト」は Mac の言語に自動で従います。",
    infoLabel: "詳細",
    lidBadgeOn: "閉じても起動",
    lidBadgeOff: "起動維持オフ",
  },
  zh: {
    openWindow: "打开窗口",
    showWidget: "显示小组件",
    hideWidget: "隐藏小组件",
    statusSection: "状态",
    settingsSection: "设置",
    stayAwakeWhenClosed: "合上笔记本也保持唤醒",
    stayAwakeHint: "合上笔记本后系统继续运行（电池供电时也是）。",
    tagline: "让你的 Mac 保持唤醒",
    custom: "自定义",
    minutesAbbrev: "分钟",
    percentAbbrev: "%",
    durationHint: "保持唤醒这段时间后自动关闭。",
    durationTip:
      "InsomniKit 让你的 Mac 保持唤醒这段时间，然后自动关闭。选择 ∞ 可一直保持到你手动关闭，也可以输入 1 到 1440 分钟之间的任意值。",
    thresholdHint: "电量过低时会自动关闭。",
    thresholdTip:
      "当电量降到此水平或更低时，InsomniKit 会自动关闭并让 Mac 进入睡眠 —— 这样即使忘了关也不会把电池耗尽。设为「关」则忽略电量。",
    stayAwakeTip:
      "合上笔记本后 Mac 也不会睡眠，让你的工作继续运行 —— 下载、构建、智能体，电池供电时也是。因为从未睡眠，重新打开就能立刻回到原处。这是 macOS 系统级设置，会要求输入管理员密码，并且即使退出 InsomniKit 也保持开启 —— 用完后请在此关闭。",
    launchAtLoginTip:
      "每次登录时自动把 InsomniKit 添加到菜单栏。它以未启用状态启动 —— 在你开启之前不会阻止 Mac 睡眠。",
    animateIconTip:
      "在保持 Mac 唤醒期间，菜单栏图标会轻轻跳动，让你一眼看出它正在工作。关闭后图标保持静止。",
    languageTip:
      "选择 InsomniKit 菜单和窗口的语言。「系统默认」会自动跟随 Mac 的语言。",
    infoLabel: "更多信息",
    lidBadgeOn: "合盖也唤醒",
    lidBadgeOff: "合盖唤醒关",
  },
  es: {
    openWindow: "Abrir ventana",
    showWidget: "Mostrar widget",
    hideWidget: "Ocultar widget",
    statusSection: "Estado",
    settingsSection: "Ajustes",
    stayAwakeWhenClosed: "Activo con la tapa cerrada",
    stayAwakeHint: "Sigue funcionando al cerrar el portátil — también con batería.",
    tagline: "Mantén tu Mac despierto",
    custom: "Personalizado",
    minutesAbbrev: "min",
    percentAbbrev: "%",
    durationHint: "Sigue activo este tiempo y luego se apaga solo.",
    durationTip:
      "InsomniKit mantiene tu Mac despierto durante este tiempo y luego se apaga automáticamente. Elige ∞ para seguir despierto hasta que lo apagues tú, o escribe cualquier valor entre 1 y 1440 minutos.",
    thresholdHint: "Se apaga solo cuando queda poca batería.",
    thresholdTip:
      "Cuando la batería baja a este nivel o menos, InsomniKit se apaga automáticamente y deja que tu Mac se duerma — así un temporizador olvidado no agota la batería. Ponlo en Desactivado para ignorar el nivel de batería.",
    stayAwakeTip:
      "Evita que tu Mac se duerma al cerrar la tapa, para que tu trabajo siga en marcha — descargas, compilaciones, agentes — incluso con batería. Como nunca se durmió, al abrir vuelves justo donde estabas. Es un ajuste de todo el sistema en macOS, así que pide tu contraseña de administrador y sigue activo aunque cierres InsomniKit — desactívalo aquí cuando termines.",
    launchAtLoginTip:
      "Añade InsomniKit a la barra de menús automáticamente cada vez que inicias sesión. Empieza inactivo — no mantendrá tu Mac despierto hasta que lo actives.",
    animateIconTip:
      "Hace latir suavemente el icono de la barra de menús mientras se mantiene tu Mac despierto, para que veas de un vistazo que funciona. Desactívalo para que el icono quede fijo.",
    languageTip:
      "Elige el idioma de los menús y la ventana de InsomniKit. «Predeterminado del sistema» sigue el idioma de tu Mac automáticamente.",
    infoLabel: "Más información",
    lidBadgeOn: "Despierto al cerrar",
    lidBadgeOff: "Mantener despierto: No",
  },
  de: {
    openWindow: "Fenster öffnen",
    showWidget: "Widget anzeigen",
    hideWidget: "Widget ausblenden",
    statusSection: "Status",
    settingsSection: "Einstellungen",
    stayAwakeWhenClosed: "Wach bei geschlossenem Deckel",
    stayAwakeHint: "Läuft weiter, wenn du das Notebook zuklappst — auch im Akkubetrieb.",
    tagline: "Halte deinen Mac wach",
    custom: "Benutzerdefiniert",
    minutesAbbrev: "Min",
    percentAbbrev: "%",
    durationHint: "Bleibt so lange wach und schaltet sich dann selbst aus.",
    durationTip:
      "InsomniKit hält deinen Mac für diese Dauer wach und schaltet sich dann automatisch aus. Wähle ∞, um wach zu bleiben, bis du es selbst ausschaltest, oder gib einen beliebigen Wert von 1 bis 1440 Minuten ein.",
    thresholdHint: "Schaltet sich bei wenig Akku von selbst aus.",
    thresholdTip:
      "Wenn der Akku auf diesen Wert oder darunter fällt, schaltet sich InsomniKit automatisch aus und lässt deinen Mac schlafen — so leert ein vergessener Timer den Akku nicht. Auf „Aus“ stellen, um den Akkustand zu ignorieren.",
    stayAwakeTip:
      "Verhindert, dass dein Mac beim Schließen des Deckels in den Ruhezustand geht, damit deine Arbeit weiterläuft — Downloads, Builds, Agenten — auch im Akkubetrieb. Da er nie geschlafen hat, bist du beim Öffnen sofort wieder da, wo du warst. Es ist eine systemweite macOS-Einstellung, fragt also nach deinem Administratorpasswort und bleibt aktiv, auch nachdem du InsomniKit beendest — schalte sie hier aus, wenn du fertig bist.",
    launchAtLoginTip:
      "Fügt InsomniKit bei jeder Anmeldung automatisch zur Menüleiste hinzu. Es startet inaktiv — es hält deinen Mac erst wach, wenn du es einschaltest.",
    animateIconTip:
      "Lässt das Menüleistensymbol sanft pulsieren, während dein Mac wach gehalten wird, damit du auf einen Blick siehst, dass es läuft. Ausschalten, damit das Symbol still bleibt.",
    languageTip:
      "Wähle die Sprache für InsomniKits Menüs und Fenster. „Systemstandard“ folgt automatisch der Sprache deines Macs.",
    infoLabel: "Mehr Infos",
    lidBadgeOn: "Wach zugeklappt",
    lidBadgeOff: "Wach zugeklappt: Aus",
  },
  fr: {
    openWindow: "Ouvrir la fenêtre",
    showWidget: "Afficher le widget",
    hideWidget: "Masquer le widget",
    statusSection: "État",
    settingsSection: "Réglages",
    stayAwakeWhenClosed: "Éveil capot fermé",
    stayAwakeHint: "Continue de tourner quand vous fermez le portable — même sur batterie.",
    tagline: "Gardez votre Mac éveillé",
    custom: "Personnalisé",
    minutesAbbrev: "min",
    percentAbbrev: "%",
    durationHint: "Reste éveillé ce temps, puis s'arrête tout seul.",
    durationTip:
      "InsomniKit garde votre Mac éveillé pendant cette durée, puis s'arrête automatiquement. Choisissez ∞ pour rester éveillé jusqu'à ce que vous l'arrêtiez vous-même, ou saisissez une valeur entre 1 et 1440 minutes.",
    thresholdHint: "S'arrête tout seul quand la batterie est faible.",
    thresholdTip:
      "Quand la batterie descend à ce niveau ou en dessous, InsomniKit s'arrête automatiquement et laisse votre Mac se mettre en veille — ainsi un minuteur oublié ne vide pas la batterie. Mettez sur Désactivé pour ignorer le niveau de batterie.",
    stayAwakeTip:
      "Empêche votre Mac de se mettre en veille quand vous fermez le capot, pour que votre travail continue — téléchargements, builds, agents — même sur batterie. Comme il n'a jamais dormi, vous retrouvez tout à l'identique en rouvrant. C'est un réglage macOS à l'échelle du système : il demande votre mot de passe administrateur et reste actif même après avoir quitté InsomniKit — désactivez-le ici quand vous avez terminé.",
    launchAtLoginTip:
      "Ajoute InsomniKit à la barre de menus automatiquement à chaque connexion. Il démarre inactif — il ne gardera pas votre Mac éveillé tant que vous ne l'activez pas.",
    animateIconTip:
      "Fait pulser doucement l'icône de la barre de menus pendant que votre Mac est maintenu éveillé, pour voir d'un coup d'œil qu'il fonctionne. Désactivez pour garder l'icône immobile.",
    languageTip:
      "Choisissez la langue des menus et de la fenêtre d'InsomniKit. « Par défaut du système » suit automatiquement la langue de votre Mac.",
    infoLabel: "Plus d'infos",
    lidBadgeOn: "Éveillé fermé",
    lidBadgeOff: "Éveil fermé: Non",
  },
};

/** Window/widget UI strings for the currently resolved locale. */
export function windowLabels(): WindowLabels {
  return WINDOW_LABELS[currentKey];
}
