import {
  getSystemResolvedNativeName,
  t,
  windowLabels,
} from "../i18n";
import { LidClosedService } from "../services/lidClosed";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import {
  DURATION_PRESETS,
  isDurationPreset,
  isThresholdPreset,
  LocalePref,
  THRESHOLD_PRESETS,
} from "../state/types";
import {
  formatBattery,
  formatBatteryEstimate,
  formatPower,
  formatThresholdLine,
  formatTimerLine,
  lidCloseWarning,
} from "../tray/format";
import type {
  LocaleOption,
  PresetOption,
  ViewLabels,
  ViewModel,
} from "../../shared/ipc";

/**
 * Build the {@link ViewModel} pushed to the window + widget. Mirrors the
 * tray's `buildMenu` exactly — same i18n catalog, same format helpers —
 * so the two UIs can never drift in wording or status.
 */
export function buildViewModel(
  store: Store,
  timer: TimerManager,
  lidClosed: LidClosedService,
  widgetOpen: boolean,
): ViewModel {
  const state = store.get();
  const m = t();
  const w = windowLabels();
  const remainingMs = timer.getRemainingMs();

  const customDurationActive = !isDurationPreset(state.duration);
  const customThresholdActive = !isThresholdPreset(state.batteryThreshold);

  const durationPresets: PresetOption<number | null>[] = DURATION_PRESETS.map(
    (d) => ({
      value: d,
      label: m.durationPresetLabel(d),
      selected: !customDurationActive && state.duration === d,
    }),
  );

  const thresholdPresets: PresetOption<number | null>[] = THRESHOLD_PRESETS.map(
    (th) => ({
      value: th,
      label: m.thresholdPresetLabel(th),
      selected: !customThresholdActive && state.batteryThreshold === th,
    }),
  );

  const explicit: { pref: LocalePref; label: string }[] = [
    { pref: "en", label: m.languageEnglishNative },
    { pref: "ko", label: m.languageKoreanNative },
    { pref: "ja", label: m.languageJapaneseNative },
    { pref: "zh", label: m.languageChineseNative },
    { pref: "es", label: m.languageSpanishNative },
    { pref: "de", label: m.languageGermanNative },
    { pref: "fr", label: m.languageFrenchNative },
  ];
  const localeOptions: LocaleOption[] = [
    {
      value: "system",
      label: `${m.languageSystem} · ${getSystemResolvedNativeName()}`,
      selected: state.locale === "system",
    },
    ...explicit.map((opt) => ({
      value: opt.pref,
      label: opt.label,
      selected: state.locale === opt.pref,
    })),
  ];

  const labels: ViewLabels = {
    appName: m.appName,
    tagline: w.tagline,
    enable: m.enable,
    disable: m.disable,
    statusSection: w.statusSection,
    settingsSection: w.settingsSection,
    duration: m.durationSubmenu,
    threshold: m.thresholdSubmenu,
    launchAtLogin: m.launchAtLogin,
    animateIcon: m.animateIcon,
    stayAwakeWhenClosed: w.stayAwakeWhenClosed,
    language: m.languageSubmenu,
    custom: w.custom,
    minutesAbbrev: w.minutesAbbrev,
    percentAbbrev: w.percentAbbrev,
    showWidget: w.showWidget,
    hideWidget: w.hideWidget,
    quit: m.quit,
  };

  return {
    active: state.active,
    // Strip the leading glyph ("● ", "○ ") from the localized status so
    // the window can pair the word with its own styled indicator dot.
    statusText: m.status(state.active).replace(/^[^\p{L}\p{N}]+/u, ""),
    powerLine: formatPower(state.battery),
    batteryLine: formatBattery(state.battery),
    batteryEstimate: formatBatteryEstimate(state.battery),
    timerLine: formatTimerLine(state, remainingMs),
    thresholdLine: formatThresholdLine(state),
    // Only warn about "sleeps when closed on battery" when that's
    // actually true: active, on battery, AND Stay-Awake-When-Closed is
    // NOT applied. With lid-closed mode on, pmset disablesleep keeps the
    // system awake with the lid shut, so the warning would be wrong.
    warning:
      state.active && !lidClosed.isActive()
        ? lidCloseWarning(state.battery)
        : null,
    battery: state.battery,
    duration: state.duration,
    batteryThreshold: state.batteryThreshold,
    launchAtLogin: state.launchAtLogin,
    animateIcon: state.animateIcon,
    lidApplied: lidClosed.isActive(),
    locale: state.locale,
    timerEndsAt: state.timer.endsAt,
    durationPresets,
    thresholdPresets,
    localeOptions,
    customDurationActive,
    customThresholdActive,
    widgetOpen,
    labels,
  };
}
