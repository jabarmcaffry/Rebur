/**
 * CollisionSystem — resolves player vs object and object vs object collisions.
 * Runs after physics integration, before lifecycle.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Velocity, Physics, LegacyHandle } from "../components";
import { PlayerPhysics } from "./physics-system";
import type { Vec3 } from "../../types";

/** Collision state for an entity. */
export const CollisionState = defineComponent<{
  canCollide: boolean;
  category: number;
  mask: number;
  contacts: Set<number>; // Entity IDs currently in contact.
}>("collision-state");

/** Collision events emitted this tick. */
export const CollisionEvents = defineComponent<{
  touchStarted: Array<{ other: number; penetration: number; normal: Vec3 }>;
  touchEnded: Array<{ other: number }>;
}>("collision-events");

// Collision categories (bitmask).
export const CollisionCategory = {
  Default: 1 << 0,
  Player: 1 << 1,
  Static: 1 << 2,
  Dynamic: 1 << 3,
  Trigger: 1 << 4,
  All: 0xFFFF,
} as const;

function halfExtents(scale: Vec3): Vec3 {
  return {
    x: Math.max(0.05, scale.x * 0.5),
    y: Math.max(0.05, scale.y * 0.5),
    z: Math.max(0.05, scale.z * 0.5),
  };
}

export const CollisionSystem = defineSystem({
  id: "collision",
  after: ["physics"],
  side: "server",
  run({ world }) {
    // Collect all collidable entities.
    const collidables: Array<{
      eid: EntityId;
      transform: { position: Vec3; rotation: Vec3; scale: Vec3 };
      velocity: Vec3;
      physics: { anchored: boolean; canCollide: boolean; mass: number; friction: number };
      collision: { canCollide: boolean; category: number; mask: number; contacts: Set<number> };
    }> = [];
    
    for (const [eid, physics, transform, velocity] of world.query(Physics, Transform, Velocity)) {
      if (!physics.canCollide) continue;
      
      let collision = world.get(eid, CollisionState);
      if (!collision) {
        collision = {
          canCollide: true,
          category: CollisionCategory.Default,
          mask: CollisionCategory.All,
          contacts: new Set(),
        };
        world.set(eid, CollisionState, collision);
      }
      
      collidables.push({ eid, transform, velocity, physics, collision });
    }
    
    // Object vs object collision.
    for (let i = 0; i < collidables.length; i++) {
      for (let j = i + 1; j < collidables.length; j++) {
        const a = collidables[i];
        const b = collidables[j];
        
        // Skip if both anchored.
        if (a.physics.anchored && b.physics.anchored) continue;
        
        // Category/mask filtering.
        if ((a.collision.category & b.collision.mask) === 0) continue;
        if ((b.collision.category & a.collision.mask) === 0) continue;
        
        // AABB collision.
        const ha = halfExtents(a.transform.scale);
        const hb = halfExtents(b.transform.scale);
        
        const dx = b.transform.position.x - a.transform.position.x;
        const dy = b.transform.position.y - a.transform.position.y;
        const dz = b.transform.position.z - a.transform.position.z;
        
        const ox = ha.x + hb.x - Math.abs(dx);
        const oy = ha.y + hb.y - Math.abs(dy);
        const oz = ha.z + hb.z - Math.abs(dz);
        
        if (ox <= 0 || oy <= 0 || oz <= 0) {
          // No collision - check for touch ended.
          if (a.collision.contacts.has(b.eid as unknown as number)) {
            a.collision.contacts.delete(b.eid as unknown as number);
            b.collision.contacts.delete(a.eid as unknown as number);
          }
          continue;
        }
        
        // Collision detected - resolve.
        let nx = 0, ny = 0, nz = 0, pen = 0;
        if (ox < oy && ox < oz) {
          pen = ox;
          nx = dx > 0 ? 1 : -1;
        } else if (oy < oz) {
          pen = oy;
          ny = dy > 0 ? 1 : -1;
        } else {
          pen = oz;
          nz = dz > 0 ? 1 : -1;
        }
        
        // Track contact.
        const wasInContact = a.collision.contacts.has(b.eid as unknown as number);
        a.collision.contacts.add(b.eid as unknown as number);
        b.collision.contacts.add(a.eid as unknown as number);
        
        // Resolve penetration.
        if (a.physics.anchored) {
          b.transform.position.x += nx * pen;
          b.transform.position.y += ny * pen;
          b.transform.position.z += nz * pen;
          
          const dot = b.velocity.x * nx + b.velocity.y * ny + b.velocity.z * nz;
          if (dot < 0) {
            b.velocity.x -= dot * nx;
            b.velocity.y -= dot * ny;
            b.velocity.z -= dot * nz;
          }
        } else if (b.physics.anchored) {
          a.transform.position.x -= nx * pen;
          a.transform.position.y -= ny * pen;
          a.transform.position.z -= nz * pen;
          
          const dot = a.velocity.x * nx + a.velocity.y * ny + a.velocity.z * nz;
          if (dot > 0) {
            a.velocity.x -= dot * nx;
            a.velocity.y -= dot * ny;
            a.velocity.z -= dot * nz;
          }
        } else {
          // Both dynamic - split penetration.
          const h = pen * 0.5;
          a.transform.position.x -= nx * h;
          a.transform.position.y -= ny * h;
          a.transform.position.z -= nz * h;
          b.transform.position.x += nx * h;
          b.transform.position.y += ny * h;
          b.transform.position.z += nz * h;
        }
        
        // Write back.
        world.set(a.eid, Transform, a.transform);
        world.set(a.eid, Velocity, a.velocity);
        world.set(a.eid, CollisionState, a.collision);
        world.set(b.eid, Transform, b.transform);
        world.set(b.eid, Velocity, b.velocity);
        world.set(b.eid, CollisionState, b.collision);
      }
    }
  },
});
