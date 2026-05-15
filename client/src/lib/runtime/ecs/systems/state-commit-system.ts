/**
 * StateCommitSystem — writes to canonical world snapshot after all mutations.
 * This produces the single source of truth that clients consume.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Velocity, Visual, Physics, LegacyHandle } from "../components";
import type { Vec3 } from "../../types";

/** Committed state snapshot (singleton on entity 0). */
export const WorldSnapshot = defineComponent<{
  tick: number;
  entities: Map<number, EntitySnapshot>;
}>("world-snapshot");

export interface EntitySnapshot {
  id: number;
  legacyId?: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  velocity: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  primitiveType: string | null;
  anchored: boolean;
  canCollide: boolean;
}

export const StateCommitSystem = defineSystem({
  id: "state-commit",
  after: ["lifecycle"],
  side: "server",
  run({ world, tick }) {
    const snapshotEntity = 0 as unknown as EntityId;
    
    let snapshot = world.get(snapshotEntity, WorldSnapshot);
    if (!snapshot) {
      snapshot = {
        tick: 0,
        entities: new Map(),
      };
    }
    
    snapshot.tick = tick;
    snapshot.entities.clear();
    
    // Snapshot all entities with transform + visual.
    for (const [eid, transform, visual] of world.query(Transform, Visual)) {
      const velocity = world.get(eid, Velocity) ?? { x: 0, y: 0, z: 0 };
      const physics = world.get(eid, Physics);
      const handle = world.get(eid, LegacyHandle);
      
      const entitySnap: EntitySnapshot = {
        id: eid as unknown as number,
        legacyId: handle?.legacyId,
        name: handle?.name ?? `entity_${eid}`,
        position: { ...transform.position },
        rotation: { ...transform.rotation },
        scale: { ...transform.scale },
        velocity: { ...velocity },
        color: visual.color,
        visible: visual.visible,
        transparency: visual.transparency,
        primitiveType: visual.primitiveType,
        anchored: physics?.anchored ?? true,
        canCollide: physics?.canCollide ?? true,
      };
      
      snapshot.entities.set(eid as unknown as number, entitySnap);
    }
    
    world.set(snapshotEntity, WorldSnapshot, snapshot);
  },
});
