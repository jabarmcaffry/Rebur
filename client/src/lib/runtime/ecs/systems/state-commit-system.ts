/**
 * StateCommitSystem — writes to canonical world snapshot after all mutations.
 *
 * This produces the single source of truth that clients consume. Uses
 * double-buffering with pooled `EntitySnapshot` objects so the hot path
 * does zero allocations per tick. Mutates the back buffer in place,
 * then swaps front <-> back at the end.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Velocity, Visual, Physics, ObjectHandle } from "../components";
import type { Vec3 } from "../../types";

export interface EntitySnapshot {
  id: number;
  objectId?: string;
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

/** Double-buffered snapshot ring. Holds front (last published) and back (writing). */
export interface SnapshotBuffer {
  tick: number;
  entities: Map<number, EntitySnapshot>;
}

/** Committed state snapshot (singleton on entity 0). */
export const WorldSnapshot = defineComponent<{
  /** What readers see — the most recently committed buffer. */
  front: SnapshotBuffer;
  /** Internal: spare buffer + spare EntitySnapshot pool for reuse. */
  back: SnapshotBuffer;
  snapPool: EntitySnapshot[];
  // Back-compat shims so older readers can do `snap.tick` / `snap.entities`.
  tick: number;
  entities: Map<number, EntitySnapshot>;
}>("world-snapshot");

function makeBuf(): SnapshotBuffer {
  return { tick: 0, entities: new Map() };
}

function newSnap(): EntitySnapshot {
  return {
    id: 0,
    objectId: undefined,
    name: "",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    color: "#888888",
    visible: true,
    transparency: 0,
    primitiveType: null,
    anchored: true,
    canCollide: true,
  };
}

export const StateCommitSystem = defineSystem({
  id: "state-commit",
  after: ["lifecycle"],
  side: "server",
  run({ world, tick }) {
    const snapshotEntity = 0 as unknown as EntityId;

    let store = world.get(snapshotEntity, WorldSnapshot);
    if (!store) {
      const front = makeBuf();
      const back = makeBuf();
      store = {
        front,
        back,
        snapPool: [],
        get tick() { return this.front.tick; },
        get entities() { return this.front.entities; },
      } as any;
      world.set(snapshotEntity, WorldSnapshot, store!);
    }

    const back = store!.back;
    const pool = store!.snapPool;

    // Recycle previous-tick snapshots from back buffer into the pool.
    for (const snap of back.entities.values()) {
      // Cap pool growth.
      if (pool.length < 1024) pool.push(snap);
    }
    back.entities.clear();
    back.tick = tick;

    // Fill the back buffer by mutating reused snapshot objects in place.
    for (const [eid, transform, visual] of world.query(Transform, Visual)) {
      const numEid = eid as unknown as number;
      const velocity = world.get(eid, Velocity);
      const physics = world.get(eid, Physics);
      const handle = world.get(eid, ObjectHandle);

      const snap = pool.pop() ?? newSnap();
      snap.id = numEid;
      snap.objectId = handle?.objectId;
      snap.name = handle?.name ?? `entity_${numEid}`;
      snap.position.x = transform.position.x;
      snap.position.y = transform.position.y;
      snap.position.z = transform.position.z;
      snap.rotation.x = transform.rotation.x;
      snap.rotation.y = transform.rotation.y;
      snap.rotation.z = transform.rotation.z;
      snap.scale.x = transform.scale.x;
      snap.scale.y = transform.scale.y;
      snap.scale.z = transform.scale.z;
      if (velocity) {
        snap.velocity.x = velocity.x;
        snap.velocity.y = velocity.y;
        snap.velocity.z = velocity.z;
      } else {
        snap.velocity.x = 0; snap.velocity.y = 0; snap.velocity.z = 0;
      }
      snap.color = visual.color;
      snap.visible = visual.visible;
      snap.transparency = visual.transparency;
      snap.primitiveType = visual.primitiveType;
      snap.anchored = physics?.anchored ?? true;
      snap.canCollide = physics?.canCollide ?? true;

      back.entities.set(numEid, snap);
    }

    // Swap front <-> back. The new back becomes the previous front; we'll
    // recycle its snapshots into the pool on the next tick.
    const prevFront = store!.front;
    store!.front = back;
    store!.back = prevFront;
  },
});
