import { Store } from "../../state/store";
import { Duration, durationToMs } from "../../state/types";
import { Emitter } from "../../utils/emitter";
import { createLogger } from "../../utils/logger";

const log = createLogger("timer");

export type TimerEvents = {
  /** Fired when the active duration timer reaches zero. */
  expired: { duration: Duration };
};

/**
 * Single-slot countdown timer.
 *
 * Design notes:
 * - Exactly zero or one timer is ever active. Every `start()` clears
 *   the previous handle first, so rapid toggle / preset changes can't
 *   leak overlapping timers.
 * - Infinite (`duration === null`) is a first-class case — we just
 *   don't arm a setTimeout; `getRemainingMs()` returns null and the
 *   menu renders nothing.
 * - Wall-clock `endsAt` is stored in the central state so the menu can
 *   render "54m remaining" without holding a reference to the manager.
 *
 * Note on system sleep: setTimeout drifts across sleep on macOS. Since
 * InsomniKit's whole job is to *prevent* sleep while a timer is running,
 * the drift is negligible during active use. Tracking wall-clock
 * `endsAt` (vs. a tick counter) at least makes the displayed remaining
 * time honest.
 */
export class TimerManager extends Emitter<TimerEvents> {
  private handle: NodeJS.Timeout | null = null;
  private currentDuration: Duration = null;
  private endsAt: number | null = null;

  constructor(private readonly store: Store) {
    super();
  }

  /**
   * Arm (or re-arm) the timer for the given duration (minutes, or null
   * for infinite).
   *
   * Idempotent: calling repeatedly with the same value while already
   * armed does NOT reset the clock — that lets the tray refresh the
   * menu freely without nudging the deadline. Pass `restart: true` to
   * force a reset (used when the user re-selects a duration).
   */
  start(duration: Duration, opts: { restart?: boolean } = {}): void {
    const ms = durationToMs(duration);

    if (
      !opts.restart &&
      this.handle !== null &&
      this.currentDuration === duration
    ) {
      return;
    }

    this.clearHandle();
    this.currentDuration = duration;

    if (ms === null) {
      this.endsAt = null;
      this.store.setTimer({ duration, endsAt: null });
      log.info("started infinite (no auto-disable)");
      return;
    }

    this.endsAt = Date.now() + ms;
    this.store.setTimer({ duration, endsAt: this.endsAt });
    this.handle = setTimeout(() => {
      this.handle = null;
      this.endsAt = null;
      this.store.setTimer({ duration: this.currentDuration, endsAt: null });
      log.info("expired", { duration });
      this.emit("expired", { duration });
    }, ms);
    this.handle.unref?.();
    log.info("started", { duration, endsAt: this.endsAt });
  }

  /** Cancel any pending timer; last-set duration stays. */
  cancel(): void {
    this.clearHandle();
    if (this.endsAt !== null) {
      this.endsAt = null;
      this.store.setTimer({ duration: this.currentDuration, endsAt: null });
      log.info("cancelled");
    }
  }

  /** Milliseconds remaining, or null for infinite/idle. */
  getRemainingMs(): number | null {
    if (this.endsAt === null) return null;
    return Math.max(0, this.endsAt - Date.now());
  }

  private clearHandle(): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
