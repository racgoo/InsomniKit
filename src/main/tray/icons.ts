import { app, nativeImage, NativeImage } from "electron";
import * as path from "path";

/**
 * Tray icons live in `assets/` relative to the project root in dev and
 * are bundled inside `app.asar` in packaged builds — `process.resourcesPath`
 * resolves both cases.
 *
 * macOS template icons (`*Template.png`) automatically invert for
 * dark / light menu bar appearance; we just have to name them correctly
 * and call `setTemplateImage(true)` (Electron does this automatically
 * for files matching the `Template` suffix).
 *
 * Four variants cover the orthogonal Active / Lid-Closed states so the
 * one image both shows whether sleep prevention is running AND whether
 * the system-wide "Stay Awake When Closed" flag is on (the latter
 * appears as a tiny padlock badge at the lower-right of the moon).
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

export function getTrayIcon(active: boolean, locked: boolean): NativeImage {
  if (active && locked) return loadTemplateIcon("iconActiveLockedTemplate");
  if (active) return loadTemplateIcon("iconActiveTemplate");
  if (locked) return loadTemplateIcon("iconLockedTemplate");
  return loadTemplateIcon("iconTemplate");
}
