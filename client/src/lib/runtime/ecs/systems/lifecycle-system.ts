/**
 * LifecycleSystem — processes spawn/destroy queues and parent/child relationships.
 * Runs after collision, before state commit.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Visual, Physics, LegacyHandle, Velocity } from "../components";
import { CommandGroups } from "../../commands/router";
import type { Vec3 } from "../../types";

/** Pending spawn/destroy operations (singleton on entity 0). */
export const LifecycleQueue = defineComponent<{
  spawns: Array<{
    name: string;
    primitiveType: string;
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    color: string;
    anchored: boolean;
    canCollide: boolean;
    parentId?: number;
  }>;
  destroys: number[]; // Entity IDs to destroy.
}>("lifecycle-queue");

/** Hierarchy relationship component. */
export const Hierarchy = defineComponent<{
  parentId: number | null;
  children: number[];
}>("hierarchy");

/** Marks an entity as pending destruction (will be removed at end of tick). */
export const PendingDestroy = defineComponent<boolean>("pending-destroy");

export const LifecycleSystem = defineSystem({
  id: "lifecycle",
  after: ["collision"],
  side: "server",
  run({ world, commands }) {
    const queueEntity = 0 as unknown as EntityId;
    let queue = world.get(queueEntity, LifecycleQueue);
    
    if (!queue) {
      queue = { spawns: [], destroys: [] };
      world.set(queueEntity, LifecycleQueue, queue);
    }
    
    // Process lifecycle commands.
    for (const cmd of commands.drain(CommandGroups.Lifecycle)) {
      switch (cmd.kind) {
        case "entity.spawn": {
          const payload = cmd.payload as {
            name: string;
            primitiveType?: string;
            position?: Partial<Vec3>;
            rotation?: Partial<Vec3>;
            scale?: Partial<Vec3>;
            color?: string;
            anchored?: boolean;
            canCollide?: boolean;
            parentId?: number;
          };
          queue.spawns.push({
            name: payload.name,
            primitiveType: payload.primitiveType ?? "cube",
            position: {
              x: payload.position?.x ?? 0,
              y: payload.position?.y ?? 0,
              z: payload.position?.z ?? 0,
            },
            rotation: {
              x: payload.rotation?.x ?? 0,
              y: payload.rotation?.y ?? 0,
              z: payload.rotation?.z ?? 0,
            },
            scale: {
              x: payload.scale?.x ?? 1,
              y: payload.scale?.y ?? 1,
              z: payload.scale?.z ?? 1,
            },
            color: payload.color ?? "#888888",
            anchored: payload.anchored ?? true,
            canCollide: payload.canCollide ?? true,
            parentId: payload.parentId,
          });
          break;
        }
        case "entity.destroy": {
          const payload = cmd.payload as { entityId: number };
          queue.destroys.push(payload.entityId);
          break;
        }
      }
    }
    
    // Process spawns.
    for (const spawn of queue.spawns) {
      const eid = world.create();
      
      world.set(eid, Transform, {
        position: { ...spawn.position },
        rotation: { ...spawn.rotation },
        scale: { ...spawn.scale },
      });
      
      world.set(eid, Velocity, { x: 0, y: 0, z: 0 });
      
      world.set(eid, Visual, {
        color: spawn.color,
        visible: true,
        transparency: 0,
        primitiveType: spawn.primitiveType,
      });
      
      world.set(eid, Physics, {
        anchored: spawn.anchored,
        canCollide: spawn.canCollide,
        mass: 1,
        friction: 0.4,
        gravity: false,
      });
      
      world.set(eid, LegacyHandle, {
        legacyId: `ecs_${eid}`,
        name: spawn.name,
      });
      
      world.set(eid, Hierarchy, {
        parentId: spawn.parentId ?? null,
        children: [],
      });
      
      // Update parent's children list.
      if (spawn.parentId !== undefined) {
        const parentHierarchy = world.get(spawn.parentId as unknown as EntityId, Hierarchy);
        if (parentHierarchy) {
          parentHierarchy.children.push(eid as unknown as number);
          world.set(spawn.parentId as unknown as EntityId, Hierarchy, parentHierarchy);
        }
      }
    }
    queue.spawns = [];
    
    // Process destroys.
    for (const eid of queue.destroys) {
      const entityId = eid as unknown as EntityId;
      
      // Remove from parent's children list.
      const hierarchy = world.get(entityId, Hierarchy);
      if (hierarchy?.parentId !== null) {
        const parentHierarchy = world.get(hierarchy.parentId as unknown as EntityId, Hierarchy);
        if (parentHierarchy) {
          parentHierarchy.children = parentHierarchy.children.filter(c => c !== eid);
          world.set(hierarchy.parentId as unknown as EntityId, Hierarchy, parentHierarchy);
        }
      }
      
      // Recursively destroy children.
      if (hierarchy?.children.length) {
        for (const childId of hierarchy.children) {
          world.destroy(childId as unknown as EntityId);
        }
      }
      
      world.destroy(entityId);
    }
    queue.destroys = [];
    
    world.set(queueEntity, LifecycleQueue, queue);
  },
});
