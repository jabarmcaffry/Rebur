/**
 * ReplicationSystem — diffs and broadcasts snapshot to clients.
 * In single-player this is mostly a passthrough; with real networking
 * it would delta-compress and send over WebSocket.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { WorldSnapshot, type EntitySnapshot } from "./state-commit-system";
import type { Vec3 } from "../../types";

/** Network output buffer (singleton on entity 0). */
export const NetworkOutput = defineComponent<{
  pendingSnapshot: SerializedSnapshot | null;
}>("network-output");

export interface SerializedSnapshot {
  tick: number;
  entities: Record<number, EntitySnapshot>;
}

export const ReplicationSystem = defineSystem({
  id: "replication",
  after: ["state-commit"],
  side: "server",
  run({ world }) {
    const singletonEntity = 0 as unknown as EntityId;
    
    const snapshot = world.get(singletonEntity, WorldSnapshot);
    if (!snapshot) return;
    
    // Serialize snapshot for network transmission.
    const serialized: SerializedSnapshot = {
      tick: snapshot.tick,
      entities: {},
    };
    
    for (const [id, entity] of snapshot.entities) {
      serialized.entities[id] = entity;
    }
    
    // Store in network output buffer.
    let output = world.get(singletonEntity, NetworkOutput);
    if (!output) {
      output = { pendingSnapshot: null };
    }
    output.pendingSnapshot = serialized;
    world.set(singletonEntity, NetworkOutput, output);
    
    // In production, we'd send this over the transport:
    // transport.broadcastSnapshot(serialized);
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
