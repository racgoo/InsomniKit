import { app } from "electron";

// Insomniac is a tray-only utility — no Dock icon, no windows.
// LSUIElement is also set in electron-builder mac.extendInfo so packaged
// builds match this runtime behavior.
if (process.platform === "darwin" && app.dock) {
  app.dock.hide();
}

// Single instance: prevent two trays from fighting over caffeinate / pmset.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.whenReady().then(() => {
  // Subsequent steps wire the tray + services here.
  // Keeping this entry deliberately tiny — Step 1 only proves the
  // build pipeline + tray-only lifecycle work end-to-end.
});

// Do not quit when all windows are closed — there are no windows.
app.on("window-all-closed", (event: Electron.Event) => {
  event.preventDefault();
});
