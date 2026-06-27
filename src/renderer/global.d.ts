/**
 * Ambient typings for the renderer surfaces.
 *
 * The renderer scripts are deliberately *not* ES modules (they ship as
 * plain `<script>` files, so they can't `require`/`import` at runtime).
 * They reference the IPC contract through these globals instead, which
 * keeps them import-free while still fully type-checked. Each script
 * body is wrapped in an IIFE so its locals never collide across files.
 */
import type {
  ActionMessage,
  InsomniKitBridge,
  ViewModel,
} from "../shared/ipc";

export {};

declare global {
  interface Window {
    insomnikit: InsomniKitBridge;
  }
  /** The preload-exposed bridge, available on every surface. */
  const insomnikit: InsomniKitBridge;

  type IKViewModel = ViewModel;
  type IKAction = ActionMessage;
}
