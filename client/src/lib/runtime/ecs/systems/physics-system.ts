/**
 * PhysicsSystem — applies gravity and integrates velocity to position.
 * Runs after animation, before collision resolution.
 */
import { defineSystem } from "../system";
import { defineComponent } from "../world";
import { Transform, Velocity, Physics } from "../components";
import type { Vec3 } from "../../types";

/** World-level physics constants (singleton on entity 0). */
export const WorldPhysics = defineComponent<{
  gravity: number;
  airDrag: number;
}>("world-physics");

/** Player-specific physics state. */
export const PlayerPhysics = defineComponent<{
  onGround: boolean;
  up: Vec3;
  collisionRadius: number;
  collisionHalfHeight: number;
  walkSpeed: number;
  runSpeed: number;
  jumpPower: number;
}>("player-physics");

export const PhysicsSystem = defineSystem({
  id: "physics",
  after: ["animation"],
  side: "server",
  run({ world, dt }) {
    // Get world physics settings.
    const worldEntity = 0 as unknown as ReturnType<typeof world.create>;
    const worldPhysics = world.get(worldEntity, WorldPhysics) ?? {
      gravity: 9.81,
      airDrag: 0,
    };
    
    // Process all entities with physics + transform + velocity.
    for (const [eid, physics, transform, velocity] of world.query(Physics, Transform, Velocity)) {
      // Skip anchored objects - they don't move.
      if (physics.anchored) continue;
      
      // Apply gravity.
      let gravityAccel: Vec3 = { x: 0, y: -worldPhysics.gravity, z: 0 };
      
      // Custom gravity source handling would go here.
      // For now, use world gravity.
      if (physics.gravity && typeof physics.gravity === "object") {
        // Object has custom gravity - skip world gravity.
        // The gravity field would pull other objects, not this one.
      }
      
      // Integrate gravity into velocity.
      velocity.x += gravityAccel.x * dt;
      velocity.y += gravityAccel.y * dt;
      velocity.z += gravityAccel.z * dt;
      
      // Apply air drag.
      if (worldPhysics.airDrag > 0) {
        const drag = 1 - worldPhysics.airDrag * dt;
        velocity.x *= drag;
        velocity.y *= drag;
        velocity.z *= drag;
      }
      
      // Apply friction when on ground (simplified).
      if (physics.friction > 0) {
        const friction = 1 - physics.friction * dt;
        velocity.x *= friction;
        velocity.z *= friction;
      }
      
      // Integrate velocity into position.
      transform.position.x += velocity.x * dt;
      transform.position.y += velocity.y * dt;
      transform.position.z += velocity.z * dt;
      
      // Update components.
      world.set(eid, Velocity, velocity);
      world.set(eid, Transform, transform);
    }
  },
});
