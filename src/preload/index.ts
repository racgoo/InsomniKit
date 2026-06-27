import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type ActionMessage,
  type InsomniKitBridge,
  type ViewModel,
} from "../shared/ipc";

/**
 * The only thing the renderer ever touches. Context-isolated: no Node,
 * no `ipcRenderer`, no `require` — just this small, typed surface on
 * `window.insomnikit`. The renderer paints ViewModels and emits actions;
 * everything else stays in the main process.
 */
const bridge: InsomniKitBridge = {
  getViewModel: () => ipcRenderer.invoke(IPC.getViewModel),

  onViewModel: (cb: (vm: ViewModel) => void) => {
    const handler = (_evt: unknown, vm: ViewModel): void => cb(vm);
    ipcRenderer.on(IPC.pushViewModel, handler);
    return () => ipcRenderer.off(IPC.pushViewModel, handler);
  },

  send: (action: ActionMessage) => ipcRenderer.send(IPC.action, action),
};

contextBridge.exposeInMainWorld("insomnikit", bridge);
