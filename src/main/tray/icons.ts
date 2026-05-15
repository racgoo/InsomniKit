import { app, nativeImage, NativeImage } from "electron";
import * as path from "path";

/**
 * Tray icons live in `assets/` relative to the project root in dev and
 * are bundled inside `app.asar` in packaged builds — `process.resourcesPath`
 * resolves both cases.
 *
 * Active variants ship with a 24-frame sinusoidal "breathing" pulse
 * (alpha 1.0 → 0.75 → 1.0, ~100ms per frame for a ~2.4s cycle). The
 * curve and frame count were tuned after user feedback that the
 * previous 6-frame 250ms pulse felt "choppy / blinking".
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

export const PULSE_FRAME_COUNT = 24;
export const PULSE_FRAME_MS = 100;

/**
 * Static icon for any (active, locked) combination. Use this when the
 * pulse animation is disabled, or for the initial `new Tray(...)` call.
 */
export function getStaticIcon(active: boolean, locked: boolean): NativeImage {
  if (active && locked) return loadTemplateIcon("iconActiveLockedTemplate");
  if (active) return loadTemplateIcon("iconActiveTemplate");
  if (locked) return loadTemplateIcon("iconLockedTemplate");
  return loadTemplateIcon("iconTemplate");
}

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
 * @deprecated use {@link getStaticIcon} for static or
 *   {@link getPulseFrames} for animated. Kept temporarily for the
 *   initial Tray-constructor call.
 */
export function getTrayIcon(active: boolean, locked: boolean): NativeImage {
  return getStaticIcon(active, locked);
}
