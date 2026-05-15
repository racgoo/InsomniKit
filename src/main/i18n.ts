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

  // The English word "Language" stays in every catalog as a universal
  // escape hatch — a user who accidentally switched to a script they
  // can't read can still recognise this row. Non-English catalogs
  // append their own native word ("언어", "言語", "Sprache", …) so
  // the row reads naturally for that locale's intended speaker too.
  languageSubmenu: "🌐 Language",
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

  // Native-word suffix — see note in the English catalog above.
  languageSubmenu: "🌐 Language / 언어",
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
  thresholdLine: (t) => (t === null ? "自動解除: オフ" : `自動解除: ${t}% 以下`),
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
  thresholdSubmenu: "バッテリー自動解除",
  customEllipsis: "カスタム…",
  launchAtLogin: "ログイン時に起動",
  quit: "InsomniKit を終了",

  languageSubmenu: "🌐 Language / 言語",
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
      ? "閉じても起きたまま: オン"
      : state === "pending"
        ? "閉じても起きたまま: 待機中…"
        : "閉じても起きたまま: オフ",
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
    `バッテリーがこのパーセント以下のとき自動解除 (${min}–${max}):`,
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
  thresholdLine: (t) => (t === null ? "自动关闭: 关" : `自动关闭: ≤ ${t}%`),
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
  thresholdSubmenu: "电池自动关闭",
  customEllipsis: "自定义…",
  launchAtLogin: "登录时启动",
  quit: "退出 InsomniKit",

  languageSubmenu: "🌐 Language / 语言",
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
  thresholdLine: (t) => (t === null ? "Auto-desactivar: Desactivado" : `Auto-desactivar: ≤ ${t}%`),
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
  thresholdSubmenu: "Auto-desactivar con batería",
  customEllipsis: "Personalizado…",
  launchAtLogin: "Iniciar al iniciar sesión",
  quit: "Salir de InsomniKit",

  languageSubmenu: "🌐 Language / Idioma",
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
      ? "Mantener despierto al cerrar: Activado"
      : state === "pending"
        ? "Mantener despierto al cerrar: pendiente…"
        : "Mantener despierto al cerrar: Desactivado",
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
    `Auto-desactivar cuando la batería esté en este porcentaje o menos (${min}–${max}):`,
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
  thresholdLine: (t) => (t === null ? "Auto-Deaktivierung: Aus" : `Auto-Deaktivierung: ≤ ${t}%`),
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
  thresholdSubmenu: "Akku-Auto-Deaktivierung",
  customEllipsis: "Benutzerdefiniert…",
  launchAtLogin: "Beim Anmelden starten",
  quit: "InsomniKit beenden",

  languageSubmenu: "🌐 Language / Sprache",
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
      ? "Beim Schließen wach bleiben: Ein"
      : state === "pending"
        ? "Beim Schließen wach bleiben: wird übernommen…"
        : "Beim Schließen wach bleiben: Aus",
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
    `Auto-deaktivieren, wenn der Akku bei diesem Prozentwert oder darunter ist (${min}–${max}):`,
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
  thresholdLine: (t) => (t === null ? "Auto-désactiver: Désactivé" : `Auto-désactiver: ≤ ${t}%`),
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
  thresholdSubmenu: "Auto-désactiver sur batterie",
  customEllipsis: "Personnalisé…",
  launchAtLogin: "Lancer à la connexion",
  quit: "Quitter InsomniKit",

  languageSubmenu: "🌐 Language / Langue",
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
      ? "Rester éveillé fermé: Activé"
      : state === "pending"
        ? "Rester éveillé fermé: en attente…"
        : "Rester éveillé fermé: Désactivé",
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
    `Auto-désactiver lorsque la batterie est à ce pourcentage ou en dessous (${min}–${max}):`,
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
    log.info("locale set", { pref, chosen });
    return;
  }
  current = CATALOGS[pref];
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
