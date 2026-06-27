/**
 * The contract between the main process and the renderer surfaces
 * (the main window + the desktop widget).
 *
 * Design: the renderer is a *thin view*. All formatting, i18n, and
 * service logic stays in the main process — exactly as the tray already
 * works. On every state change the main process builds a fully
 * pre-formatted {@link ViewModel} and pushes it to every open surface;
 * the renderer only paints it and sends back coarse {@link ActionMessage}s.
 *
 * This file is imported for *values* by the preload (channel names) and
 * for *types only* by the renderer bundles. Because the renderer uses
 * `import type`, tsc erases the import entirely — no main-process code
 * (electron, services, …) leaks into the browser context.
 */
import type {
  BatterySnapshot,
  BatteryThreshold,
  Duration,
  LocalePref,
} from "../main/state/types";

/** IPC channel names. Namespaced so they never collide with Electron's. */
export const IPC = {
  /** renderer → main (invoke): fetch the current ViewModel once on load. */
  getViewModel: "ik:get-view-model",
  /** main → renderer (send): a fresh ViewModel to paint. */
  pushViewModel: "ik:push-view-model",
  /** renderer → main (send): a user action. */
  action: "ik:action",
} as const;

/** A selectable preset (duration / threshold) with its localized label. */
export interface PresetOption<T> {
  value: T;
  label: string;
  selected: boolean;
}

/** A language choice for the picker. */
export interface LocaleOption {
  value: LocalePref;
  label: string;
  selected: boolean;
}

/** Pre-localized chrome strings the renderer paints verbatim. */
export interface ViewLabels {
  appName: string;
  tagline: string;
  enable: string;
  disable: string;
  statusSection: string;
  settingsSection: string;
  duration: string;
  threshold: string;
  launchAtLogin: string;
  animateIcon: string;
  stayAwakeWhenClosed: string;
  language: string;
  custom: string;
  minutesAbbrev: string;
  percentAbbrev: string;
  showWidget: string;
  hideWidget: string;
  quit: string;
}

/**
 * Everything a surface needs to render itself. Built fresh in the main
 * process on every state change (and once per second while a window is
 * open, to keep the countdown live).
 */
export interface ViewModel {
  active: boolean;
  /** Localized status word with the leading glyph stripped ("Active"). */
  statusText: string;
  // ── pre-formatted display lines (same source as the tray) ──
  powerLine: string;
  batteryLine: string;
  batteryEstimate: string | null;
  timerLine: string;
  thresholdLine: string;
  warning: string | null;
  // ── raw values needed to drive controls ──
  battery: BatterySnapshot;
  duration: Duration;
  batteryThreshold: BatteryThreshold;
  launchAtLogin: boolean;
  animateIcon: boolean;
  lidApplied: boolean;
  locale: LocalePref;
  /** Wall-clock ms the timer fires; null = infinite / idle. */
  timerEndsAt: number | null;
  // ── control option lists ──
  durationPresets: PresetOption<Duration>[];
  thresholdPresets: PresetOption<BatteryThreshold>[];
  localeOptions: LocaleOption[];
  customDurationActive: boolean;
  customThresholdActive: boolean;
  // ── window/widget chrome ──
  widgetOpen: boolean;
  labels: ViewLabels;
}

/** A coarse user intent sent renderer → main. */
export type ActionMessage =
  | { type: "toggleActive" }
  | { type: "setDuration"; value: Duration }
  | { type: "setThreshold"; value: BatteryThreshold }
  | { type: "setLaunchAtLogin"; value: boolean }
  | { type: "setAnimateIcon"; value: boolean }
  | { type: "setLocale"; value: LocalePref }
  | { type: "setLidClosed"; value: boolean }
  | { type: "openWidget" }
  | { type: "closeWidget" }
  | { type: "quit" };

/** Shape exposed on `window.insomnikit` by the preload bridge. */
export interface InsomniKitBridge {
  getViewModel(): Promise<ViewModel>;
  onViewModel(cb: (vm: ViewModel) => void): () => void;
  send(action: ActionMessage): void;
}
