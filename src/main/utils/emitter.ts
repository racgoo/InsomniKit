/**
 * Minimal typed event emitter.
 *
 * We use this instead of Node's `EventEmitter` so listener payloads are
 * statically checked — the state store and services pass structured
 * snapshots around, and a typo in an event name would otherwise be a
 * silent runtime no-op.
 */

export type Listener<T> = (payload: T) => void;

export class Emitter<EventMap extends Record<string, unknown>> {
  private readonly listeners: {
    [K in keyof EventMap]?: Set<Listener<EventMap[K]>>;
  } = {};

  on<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): () => void {
    let set = this.listeners[event];
    if (!set) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    // Copy so a listener that unsubscribes itself doesn't perturb iteration.
    for (const l of Array.from(set)) {
      try {
        l(payload);
      } catch (err) {
        // Listeners must never break the emitter loop. Routing through
        // console here (not the logger) avoids a dependency cycle.
        console.error("[emitter] listener threw:", err);
      }
    }
  }

  removeAll(): void {
    for (const k of Object.keys(this.listeners) as Array<keyof EventMap>) {
      this.listeners[k]?.clear();
    }
  }
}
