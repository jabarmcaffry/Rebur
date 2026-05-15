/**
 * ClientView — read-only mirror of the authoritative server snapshot. The
 * renderer reads from here exclusively; it never mutates.
 */
import type { ServerSnapshot } from "./server-sim";

export class ClientView {
  private snapshot: ServerSnapshot = { tick: 0, entities: {} };

  apply(snap: ServerSnapshot) {
    this.snapshot = snap;
  }

  read<T = unknown>(entity: number, component: string): T | undefined {
    return this.snapshot.entities[entity]?.[component] as T | undefined;
  }

  current(): ServerSnapshot {
    return this.snapshot;
  }
}
