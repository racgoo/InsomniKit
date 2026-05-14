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
 */
function assetPath(file: string): string {
  if (app.isPackaged) {
    // In a packaged app, `assets/` is included via electron-builder's
    // `files` glob and ends up alongside `dist/` inside the asar root.
    return path.join(process.resourcesPath, "app.asar", "assets", file);
  }
  return path.join(__dirname, "..", "..", "..", "assets", file);
}

function loadTemplateIcon(baseName: string): NativeImage {
  const img = nativeImage.createFromPath(assetPath(`${baseName}.png`));
  img.setTemplateImage(true);
  return img;
}

export function getInactiveIcon(): NativeImage {
  return loadTemplateIcon("iconTemplate");
}

export function getActiveIcon(): NativeImage {
  return loadTemplateIcon("iconActiveTemplate");
}
