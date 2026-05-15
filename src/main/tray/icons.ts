import { app, nativeImage, NativeImage } from "electron";
import * as path from "path";

/**
 * Tray icons live in `assets/` relative to the project root in dev and
 * are bundled inside `app.asar` in packaged builds — `process.resourcesPath`
 * resolves both cases.
 *
 * Active variants come with 6-frame "pulse" sequences so the
 * controller can animate a gentle breathing effect while sleep
 * prevention is engaged. Inactive variants are single images — no
 * pulse when idle.
 */
function assetPath(file: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "assets", file);
  }
  return path.join(__dirname, "..", "..", "..", "assets", file);
}

function loadTemplateIcon(baseName: string): NativeImage {
  const img = nativeImage.createFromPath(assetPath(`${baseName}.png`));
  img.setTemplateImage(true);
  return img;
}

/** Single icon for the static states (idle, idle + locked). */
export function getStaticTrayIcon(locked: boolean): NativeImage {
  return loadTemplateIcon(
    locked ? "iconLockedTemplate" : "iconTemplate",
  );
}

export const PULSE_FRAME_COUNT = 6;

/** Pulse frames for the active state (with or without lock badge). */
export function getPulseFrames(locked: boolean): NativeImage[] {
  const prefix = locked ? "iconActiveLockedPulse" : "iconActivePulse";
  const frames: NativeImage[] = [];
  for (let i = 0; i < PULSE_FRAME_COUNT; i++) {
    frames.push(loadTemplateIcon(`${prefix}${i}Template`));
  }
  return frames;
}

/**
 * Backward-compatible single-image picker — returns frame 0 of the
 * active pulse, used by the initial `new Tray(...)` call before the
 * pulse loop kicks in.
 */
export function getTrayIcon(active: boolean, locked: boolean): NativeImage {
  if (active) return getPulseFrames(locked)[0];
  return getStaticTrayIcon(locked);
}
