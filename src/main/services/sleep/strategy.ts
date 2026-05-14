import { SleepStrategyKind } from "../../state/types";

/**
 * A SleepStrategy is anything that can prevent the system from sleeping
 * and later restore the default behavior.
 *
 * Contracts:
 * - `enable()` is idempotent — calling twice in a row must not leak a
 *   second process or double-mutate system state.
 * - `disable()` is idempotent — safe to call from cleanup paths whether
 *   or not enable was ever called.
 * - `restoreOnExit()` MUST run synchronously where possible. It is the
 *   last-chance hook used by SIGINT / SIGTERM / uncaughtException in
 *   Step 6 and cannot rely on async I/O completing.
 *
 * The interface is deliberately small: timer / battery / lid-close
 * concerns live above this layer in SleepManager so a new strategy
 * doesn't have to re-implement them.
 */
export interface SleepStrategy {
  readonly kind: SleepStrategyKind;
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): boolean;
  /** Sync best-effort restore for crash / signal paths. */
  restoreOnExit(): void;
}
