import { Store } from "../../state/store";
import { SleepStrategyKind } from "../../state/types";
import { createLogger } from "../../utils/logger";
import { CaffeinateStrategy } from "./caffeinate";
import { PmsetStrategy } from "./pmset";
import { SleepStrategy } from "./strategy";

const log = createLogger("sleep:manager");

/**
 * High-level sleep-prevention controller.
 *
 * Owns one instance of every strategy and toggles them according to the
 * active kind from the store. The split — manager vs strategy — keeps
 * timer/battery/lid concerns out of the strategy classes; they only
 * have to know how to flip a switch and restore it.
 *
 * Switching strategy while active is safe: we disable the old one first
 * so we never have both caffeinate AND pmset active simultaneously
 * (which would leak system state on cleanup).
 */
export class SleepManager {
  private readonly strategies: Record<SleepStrategyKind, SleepStrategy>;
  private current: SleepStrategy;
  /** Tracks the manager-level intent independent of strategy state. */
  private desiredActive = false;

  constructor(private readonly store: Store) {
    this.strategies = {
      caffeinate: new CaffeinateStrategy(),
      pmset: new PmsetStrategy(),
    };
    this.current = this.strategies[store.get().strategy];
  }

  async enable(): Promise<void> {
    this.desiredActive = true;
    try {
      await this.current.enable();
      this.store.setActive(true);
      log.info("enabled", { strategy: this.current.kind });
    } catch (err) {
      this.desiredActive = false;
      this.store.setActive(false);
      log.error("enable failed", err);
      throw err;
    }
  }

  async disable(): Promise<void> {
    this.desiredActive = false;
    try {
      await this.current.disable();
    } finally {
      this.store.setActive(false);
      log.info("disabled", { strategy: this.current.kind });
    }
  }

  async toggle(): Promise<void> {
    if (this.current.isEnabled()) {
      await this.disable();
    } else {
      await this.enable();
    }
  }

  /**
   * Switch active strategy. If currently enabled, we disable the old
   * one before enabling the new one so cleanup ordering is always
   * deterministic.
   */
  async setStrategy(kind: SleepStrategyKind): Promise<void> {
    if (this.current.kind === kind) return;
    const wasActive = this.desiredActive;
    if (wasActive) await this.current.disable();
    this.current = this.strategies[kind];
    this.store.setStrategy(kind);
    if (wasActive) await this.current.enable();
  }

  isActive(): boolean {
    return this.current.isEnabled();
  }

  /**
   * Synchronous best-effort cleanup. Called from process exit handlers
   * in Step 6. Walks EVERY strategy, not just the current one, so a
   * mid-switch crash still gets fully restored.
   */
  restoreOnExit(): void {
    for (const s of Object.values(this.strategies)) {
      try {
        s.restoreOnExit();
      } catch (err) {
        // Swallow — exit handler must not throw.
        log.error("restoreOnExit error", err);
      }
    }
  }
}
