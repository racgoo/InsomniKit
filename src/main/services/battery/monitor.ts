import { Store } from "../../state/store";
import { batteryThresholdToPercent } from "../../state/types";
import { exec } from "../../utils/exec";
import { createLogger } from "../../utils/logger";
import { Emitter } from "../../utils/emitter";
import { parseBattery } from "./parser";

const log = createLogger("battery");

/** Default polling interval. Battery doesn't change fast — 60s is plenty. */
const DEFAULT_INTERVAL_MS = 60_000;
/** Faster initial sample so the menu shows real data within a second of launch. */
const INITIAL_DELAY_MS = 500;

export type BatteryEvents = {
  /** Battery percent dropped at-or-below the configured threshold. */
  thresholdHit: { percent: number; threshold: number };
};

/**
 * Polls `pmset -g batt` on a fixed interval, pushes snapshots into the
 * store, and emits `thresholdHit` when the user's auto-disable line is
 * crossed.
 *
 * Why edge-triggered:
 * - We only fire `thresholdHit` on the transition from "above" to
 *   "at-or-below". Otherwise every poll while sitting at 19% would fire
 *   the event again, and SleepManager.disable() would be called over
 *   and over even after the user manually re-enabled.
 * - When the user changes the threshold setting, we reset the latch
 *   via `resetThresholdLatch()` so a new threshold gets a fresh chance
 *   to fire.
 */
export class BatteryMonitor extends Emitter<BatteryEvents> {
  private timer: NodeJS.Timeout | null = null;
  private starting = false;
  /** True once the current threshold has fired since the last reset. */
  private latched = false;

  constructor(
    private readonly store: Store,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {
    super();
  }

  start(): void {
    if (this.timer || this.starting) return;
    this.starting = true;
    // Fire one read soon so the menu has data, then settle into the
    // long-interval cadence.
    setTimeout(() => {
      this.starting = false;
      void this.pollOnce();
    }, INITIAL_DELAY_MS);
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs);
    // Don't keep the event loop alive solely for battery polling — the
    // Electron app loop is what we want to track.
    this.timer.unref?.();
    log.info("started", { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("stopped");
  }

  /** Force a refresh, e.g. immediately after the user toggles enable. */
  async refresh(): Promise<void> {
    await this.pollOnce();
  }

  /** Reset the edge-trigger latch, e.g. when threshold setting changes. */
  resetThresholdLatch(): void {
    this.latched = false;
  }

  private async pollOnce(): Promise<void> {
    const res = await exec("/usr/bin/pmset", ["-g", "batt"], {
      timeoutMs: 4_000,
    });
    if (res.code !== 0) {
      log.warn("pmset -g batt failed; skipping update", {
        code: res.code,
        stderr: res.stderr.trim(),
      });
      return;
    }
    const snapshot = parseBattery(res.stdout);
    this.store.setBattery(snapshot);

    const state = this.store.get();
    const threshold = batteryThresholdToPercent(state.batteryThreshold);
    if (
      state.active &&
      threshold !== null &&
      snapshot.percent !== null &&
      !this.latched &&
      snapshot.percent <= threshold
    ) {
      this.latched = true;
      log.info("battery threshold hit", {
        percent: snapshot.percent,
        threshold,
      });
      this.emit("thresholdHit", { percent: snapshot.percent, threshold });
    }

    // Re-arm the latch when the user goes well above the threshold
    // again, so a later dip will fire once more.
    if (
      this.latched &&
      threshold !== null &&
      snapshot.percent !== null &&
      snapshot.percent > threshold + 2
    ) {
      this.latched = false;
    }
  }
}
