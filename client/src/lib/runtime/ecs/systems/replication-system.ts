/**
 * ReplicationSystem — diffs and broadcasts snapshot to clients.
 *
 * In single-player this is mostly a passthrough — the front buffer from
 * StateCommit IS the snapshot, no copies. With real networking we would
 * delta-compress here and send over WebSocket.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { WorldSnapshot, type EntitySnapshot } from "./state-commit-system";

/** Network output buffer (singleton on entity 0). */
export const NetworkOutput = defineComponent<{
  pendingSnapshot: SerializedSnapshot | null;
}>("network-output");

/**
 * Reference to the committed front buffer. We deliberately share the same
 * `entities` Map and EntitySnapshot objects across the system — no copy.
 */
export interface SerializedSnapshot {
  tick: number;
  /** Live reference to the front buffer's entity map. */
  entities: Map<number, EntitySnapshot>;
}

export const ReplicationSystem = defineSystem({
  id: "replication",
  after: ["state-commit"],
  side: "server",
  run({ world }) {
    const singletonEntity = 0 as unknown as EntityId;

    const store = world.get(singletonEntity, WorldSnapshot);
    if (!store) return;

    let output = world.get(singletonEntity, NetworkOutput);
    if (!output) {
      output = { pendingSnapshot: { tick: 0, entities: store.front.entities } };
      world.set(singletonEntity, NetworkOutput, output);
    }
    // Mutate the existing wrapper — no allocation per tick.
    output.pendingSnapshot!.tick = store.front.tick;
    output.pendingSnapshot!.entities = store.front.entities;
  },
});

/**
 * Get the latest serialized snapshot from the world.
 * Used by the host to read the committed state.
 */
export function getLatestSnapshot(world: { get: <T>(id: EntityId, c: { id: string }) => T | undefined }): SerializedSnapshot | null {
  const singletonEntity = 0 as unknown as EntityId;
  const output = world.get<{ pendingSnapshot: SerializedSnapshot | null }>(singletonEntity, NetworkOutput);
  return output?.pendingSnapshot ?? null;
}
