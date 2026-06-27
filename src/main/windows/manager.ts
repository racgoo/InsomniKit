import { app, BrowserWindow, ipcMain, nativeTheme, screen } from "electron";
import * as path from "path";
import { AppActions } from "../core/actions";
import { buildViewModel } from "../core/viewModel";
import { LidClosedService } from "../services/lidClosed";
import { TimerManager } from "../services/timer";
import { Store } from "../state/store";
import { createLogger } from "../utils/logger";
import { IPC, type ActionMessage } from "../../shared/ipc";

const log = createLogger("windows");

const PRELOAD = path.join(__dirname, "..", "..", "preload", "index.js");
const MAIN_HTML = path.join(__dirname, "..", "..", "renderer", "main", "index.html");
const WIDGET_HTML = path.join(__dirname, "..", "..", "renderer", "widget", "index.html");

const MAIN_SIZE = { width: 388, height: 724 };
const WIDGET_SIZE = { width: 250, height: 212 };
const WIDGET_MARGIN = 24;

/**
 * Owns the optional UI surfaces: the main app window and the floating
 * desktop widget. The app is still tray-first — these windows are created
 * lazily and the process keeps running with none of them open.
 *
 * The Dock icon is shown *only while the main window is visible* (the
 * product decision for this feature): the app stays a background utility
 * until the user actually pulls up the window, at which point it behaves
 * like a normal app (Dock + Cmd-Tab), then melts back into the menu bar
 * when the window is closed.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private widget: BrowserWindow | null = null;
  private pushHandle: NodeJS.Timeout | null = null;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly store: Store,
    private readonly timer: TimerManager,
    private readonly lidClosed: LidClosedService,
    private readonly actions: AppActions,
  ) {}

  /** Wire IPC + the change subscriptions that keep surfaces live. */
  init(): void {
    ipcMain.handle(IPC.getViewModel, () => this.viewModel());
    ipcMain.on(IPC.action, (_evt, action: ActionMessage) => {
      void this.handleAction(action);
    });

    // Any state change re-pushes immediately so toggles feel instant.
    this.disposers.push(this.store.on("change", () => this.push()));
    // Lid-Closed "applied" state lives outside the store; its own event
    // is the only signal that the badge / toggle should update.
    const onLid = (): void => this.push();
    this.lidClosed.on("changed", onLid);
    this.disposers.push(() => this.lidClosed.off("changed", onLid));

    // Keep the timer countdown ticking on screen without waiting for the
    // next state change. Cheap, and only does work while a surface is up.
    this.pushHandle = setInterval(() => {
      if (this.anyVisible()) this.push();
    }, 1000);
    this.pushHandle.unref?.();
  }

  /** Bring the main window forward (creating it on first use). */
  openMain(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.mainWindow = this.createMainWindow();
    }
    const win = this.mainWindow;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  isWidgetOpen(): boolean {
    return !!this.widget && !this.widget.isDestroyed() && this.widget.isVisible();
  }

  openWidget(): void {
    if (!this.widget || this.widget.isDestroyed()) {
      this.widget = this.createWidget();
    }
    this.widget.showInactive();
    this.push();
  }

  closeWidget(): void {
    if (this.widget && !this.widget.isDestroyed()) this.widget.hide();
    this.push();
  }

  toggleWidget(): void {
    if (this.isWidgetOpen()) this.closeWidget();
    else this.openWidget();
  }

  /** Tear everything down for app quit. */
  destroy(): void {
    if (this.pushHandle) {
      clearInterval(this.pushHandle);
      this.pushHandle = null;
    }
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    ipcMain.removeHandler(IPC.getViewModel);
    ipcMain.removeAllListeners(IPC.action);
    this.mainWindow?.destroy();
    this.widget?.destroy();
    this.mainWindow = null;
    this.widget = null;
  }

  // ── internals ──────────────────────────────────────────────

  private createMainWindow(): BrowserWindow {
    // A solid, theme-matched background — NOT native vibrancy. Vibrancy
    // can composite to an unexpected luminance (or be disabled by
    // "Reduce transparency"), which left the content washed out to the
    // point of invisibility. The renderer paints its own lavender
    // gradient + translucent panels for the glass look instead.
    const dark = nativeTheme.shouldUseDarkColors;
    const win = new BrowserWindow({
      ...MAIN_SIZE,
      show: false,
      resizable: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: true,
      title: "InsomniKit",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 18 },
      backgroundColor: dark ? "#1b1440" : "#f0ecfa",
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    win.loadFile(MAIN_HTML);
    win.on("ready-to-show", () => this.push());

    // Closing the window doesn't quit a tray app — hide it and drop the
    // Dock icon so we're a background utility again. (The user reopens
    // from the tray menu or by relaunching the app.)
    win.on("close", (evt) => {
      if (win.isDestroyed()) return;
      evt.preventDefault();
      win.hide();
    });
    win.on("show", () => this.showDock());
    win.on("hide", () => this.hideDockIfIdle());

    return win;
  }

  private createWidget(): BrowserWindow {
    const work = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      ...WIDGET_SIZE,
      x: work.x + work.width - WIDGET_SIZE.width - WIDGET_MARGIN,
      y: work.y + WIDGET_MARGIN,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // Float above ordinary windows and ride along across Spaces so it
    // behaves like a desktop accessory rather than a normal window.
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(WIDGET_HTML);
    win.on("ready-to-show", () => this.push());
    win.on("close", (evt) => {
      if (win.isDestroyed()) return;
      evt.preventDefault();
      win.hide();
      this.push();
    });

    return win;
  }

  private showDock(): void {
    if (process.platform === "darwin" && app.dock) void app.dock.show();
  }

  /** Hide the Dock icon once the main window is no longer visible. */
  private hideDockIfIdle(): void {
    const mainVisible =
      !!this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.isVisible();
    if (!mainVisible && process.platform === "darwin" && app.dock) {
      app.dock.hide();
    }
  }

  private anyVisible(): boolean {
    const main =
      !!this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.isVisible();
    return main || this.isWidgetOpen();
  }

  private viewModel(): ReturnType<typeof buildViewModel> {
    return buildViewModel(
      this.store,
      this.timer,
      this.lidClosed,
      this.isWidgetOpen(),
    );
  }

  /** Push a fresh ViewModel to every open surface. */
  private push(): void {
    if (!this.anyVisible()) return;
    const vm = this.viewModel();
    for (const win of [this.mainWindow, this.widget]) {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.webContents.send(IPC.pushViewModel, vm);
      }
    }
  }

  private async handleAction(action: ActionMessage): Promise<void> {
    try {
      switch (action.type) {
        case "toggleActive":
          await this.actions.toggleActive();
          break;
        case "setDuration":
          this.actions.setDuration(action.value);
          break;
        case "setThreshold":
          this.actions.setThreshold(action.value);
          break;
        case "setLaunchAtLogin":
          this.actions.setLaunchAtLogin(action.value);
          break;
        case "setAnimateIcon":
          this.actions.setAnimateIcon(action.value);
          break;
        case "setLocale":
          this.actions.setLocale(action.value);
          break;
        case "setLidClosed":
          await this.actions.setLidClosed(action.value);
          break;
        case "openWidget":
          this.openWidget();
          break;
        case "closeWidget":
          this.closeWidget();
          break;
        case "quit":
          app.quit();
          break;
      }
    } catch (err) {
      log.error("action failed", { action, err });
    }
  }
}
