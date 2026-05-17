/**
 * CollisionSystem — resolves player vs object and object vs object collisions.
 * Runs after physics integration, before lifecycle.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Velocity, Physics, Player } from "../components";
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

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export const CollisionSystem = defineSystem({
  id: "collision",
  after: ["physics"],
  side: "server",
  run({ world }) {
    // Process player vs object collisions first.
    for (const [playerEid, player] of world.query(Player)) {
      const playerPhys = world.get(playerEid, PlayerPhysics);
      const playerTransform = world.get(playerEid, Transform);
      const playerVelocity = world.get(playerEid, Velocity);
      
      if (!playerPhys || !playerTransform || !playerVelocity) continue;
      
      const playerRadius = playerPhys.collisionRadius;
      const playerHalfHeight = playerPhys.collisionHalfHeight;
      const up = playerPhys.up;
      
      // Check player against all collidable objects.
      for (const [objEid, physics] of world.query(Physics)) {
        // Skip self.
        if (objEid === playerEid) continue;
        
        // Skip non-collidable.
        if (!physics.canCollide) continue;
        
        const transform = world.get(objEid, Transform);
        if (!transform) continue;
        
        // Capsule vs AABB collision.
        const result = resolvePlayerVsAABB(
          playerTransform.position,
          playerVelocity,
          playerRadius,
          playerHalfHeight,
          up,
          transform.position,
          transform.scale,
          transform.rotation,
          physics.friction
        );
        
        if (result.collided) {
          // Apply position correction.
          playerTransform.position.x += result.correction.x;
          playerTransform.position.y += result.correction.y;
          playerTransform.position.z += result.correction.z;
          
          // Modify velocity to prevent penetration.
          if (result.velocityAdjust) {
            playerVelocity.x += result.velocityAdjust.x;
            playerVelocity.y += result.velocityAdjust.y;
            playerVelocity.z += result.velocityAdjust.z;
          }
          
          // Set grounded if standing on something.
          if (result.grounded) {
            playerPhys.onGround = true;
          }
        }
      }
      
      // Write back player state.
      world.set(playerEid, Transform, playerTransform);
      world.set(playerEid, Velocity, playerVelocity);
      world.set(playerEid, PlayerPhysics, playerPhys);
    }
    
    // Collect all non-player collidable entities.
    const collidables: Array<{
      eid: EntityId;
      transform: { position: Vec3; rotation: Vec3; scale: Vec3 };
      velocity: Vec3;
      physics: { anchored: boolean; canCollide: boolean; mass: number; friction: number };
      collision: { canCollide: boolean; category: number; mask: number; contacts: Set<number> };
    }> = [];
    
    for (const [eid, physics] of world.query(Physics)) {
      // Skip player entities.
      if (world.has(eid, Player)) continue;
      
      if (!physics.canCollide) continue;
      
      const transform = world.get(eid, Transform);
      const velocity = world.get(eid, Velocity);
      if (!transform || !velocity) continue;
      
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

/**
 * Resolve capsule (player) vs AABB collision.
 * NOTE: `playerPos` is the player's FEET position (matches legacy RuntimePlayer
 * convention). Capsule center is at playerPos + up * halfHeight.
 * For axis-aligned worlds we approximate the capsule with a vertical AABB
 * (combined-extents test) which mirrors the working legacy resolver and
 * avoids the tunnelling/single-sphere miss the previous implementation had.
 */
function resolvePlayerVsAABB(
  playerPos: Vec3,
  playerVel: Vec3,
  playerRadius: number,
  playerHalfHeight: number,
  _up: Vec3,
  objPos: Vec3,
  objScale: Vec3,
  _objRotation: Vec3,
  _friction: number
): {
  collided: boolean;
  grounded: boolean;
  correction: Vec3;
  velocityAdjust: Vec3 | null;
} {
  const result = {
    collided: false,
    grounded: false,
    correction: { x: 0, y: 0, z: 0 },
    velocityAdjust: null as Vec3 | null,
  };

  const hx = Math.max(0.05, objScale.x * 0.5);
  const hy = Math.max(0.05, objScale.y * 0.5);
  const hz = Math.max(0.05, objScale.z * 0.5);

  // Player capsule center (feet-based: center is one halfHeight above feet).
  const cx = playerPos.x;
  const cy = playerPos.y + playerHalfHeight;
  const cz = playerPos.z;

  const combX = hx + playerRadius;
  const combY = hy + playerHalfHeight;
  const combZ = hz + playerRadius;

  const dx = cx - objPos.x;
  const dy = cy - objPos.y;
  const dz = cz - objPos.z;

  const ox = combX - Math.abs(dx);
  const oy = combY - Math.abs(dy);
  const oz = combZ - Math.abs(dz);

  if (ox <= 0 || oy <= 0 || oz <= 0) return result;

  let nx = 0, ny = 0, nz = 0, pen = 0;
  if (oy < ox && oy < oz) {
    pen = oy;
    ny = dy > 0 ? 1 : -1;
    if (ny > 0) result.grounded = true;
  } else if (ox < oz) {
    pen = ox;
    nx = dx > 0 ? 1 : -1;
  } else {
    pen = oz;
    nz = dz > 0 ? 1 : -1;
  }

  result.collided = true;
  result.correction.x = nx * pen;
  result.correction.y = ny * pen;
  result.correction.z = nz * pen;

  const vDotN = playerVel.x * nx + playerVel.y * ny + playerVel.z * nz;
  if (vDotN < 0) {
    result.velocityAdjust = {
      x: -vDotN * nx,
      y: -vDotN * ny,
      z: -vDotN * nz,
    };
  }
  return result;
}
