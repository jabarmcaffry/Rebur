/**
 * PhysicsSystem — applies gravity and integrates velocity to position.
 * Handles both player physics and object physics.
 * Runs after animation, before collision resolution.
 */
import { defineSystem } from "../system";
import { defineComponent, type EntityId } from "../world";
import { Transform, Velocity, Physics, Player, InputState } from "../components";
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
  moveForward: Vec3;
  sprinting: boolean;
}>("player-physics");

/** Motor-pinned objects that should skip physics. */
export const MotorPinned = defineComponent<{
  slot: string;
  offset: Vec3;
  rotation: Vec3;
}>("motor-pinned");

/** Gravity source that attracts other objects. */
export const GravitySource = defineComponent<{
  strength: number;
  radius: number;
}>("gravity-source");

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export const PhysicsSystem = defineSystem({
  id: "physics",
  after: ["animation"],
  side: "server",
  run({ world, dt }) {
    // Get world physics settings from entity 0.
    const worldEntity = 0 as EntityId;
    const worldPhysics = world.get(worldEntity, WorldPhysics) ?? {
      gravity: 9.81,
      airDrag: 0,
    };
    const inputState = world.get(worldEntity, InputState);
    
    // Collect all gravity sources for custom gravity calculation.
    const gravitySources: { position: Vec3; strength: number; radius: number }[] = [];
    for (const [eid, gravSource] of world.query(GravitySource)) {
      const transform = world.get(eid, Transform);
      if (transform) {
        gravitySources.push({
          position: transform.position,
          strength: gravSource.strength,
          radius: gravSource.radius,
        });
      }
    }
    
    // Process player entity (has Player component).
    for (const [eid, player] of world.query(Player)) {
      const playerPhys = world.get(eid, PlayerPhysics);
      const transform = world.get(eid, Transform);
      const velocity = world.get(eid, Velocity);
      
      if (!playerPhys || !transform || !velocity) continue;
      
      if (player.ragdoll) {
        // Ragdolled: scrub horizontal control velocity.
        velocity.x *= 1 - Math.min(1, dt * 2);
        velocity.z *= 1 - Math.min(1, dt * 2);
      } else if (inputState) {
        // Calculate gravity vector for player position.
        const gravityVec = computeGravity(transform.position, gravitySources, worldPhysics.gravity);
        const gMag = vec3Length(gravityVec);
        
        // Update player up direction (slerp toward anti-gravity).
        const desiredUp = gMag > 0.001
          ? { x: -gravityVec.x / gMag, y: -gravityVec.y / gMag, z: -gravityVec.z / gMag }
          : { x: 0, y: 1, z: 0 };
        const slerpT = Math.min(1, dt * 6);
        playerPhys.up.x += (desiredUp.x - playerPhys.up.x) * slerpT;
        playerPhys.up.y += (desiredUp.y - playerPhys.up.y) * slerpT;
        playerPhys.up.z += (desiredUp.z - playerPhys.up.z) * slerpT;
        const upNorm = vec3Normalize(playerPhys.up);
        playerPhys.up.x = upNorm.x;
        playerPhys.up.y = upNorm.y;
        playerPhys.up.z = upNorm.z;
        
        // Project camera forward onto plane perpendicular to up.
        const cf = inputState.cameraForward;
        const cfDot = vec3Dot(cf, playerPhys.up);
        let fx = cf.x - playerPhys.up.x * cfDot;
        let fy = cf.y - playerPhys.up.y * cfDot;
        let fz = cf.z - playerPhys.up.z * cfDot;
        let fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
        
        if (fLen < 0.15) {
          fx = playerPhys.moveForward.x;
          fy = playerPhys.moveForward.y;
          fz = playerPhys.moveForward.z;
          fLen = vec3Length(playerPhys.moveForward) || 1;
        }
        fx /= fLen; fy /= fLen; fz /= fLen;
        
        // Blend move forward direction.
        const fwdBlend = Math.min(1, dt * 8);
        playerPhys.moveForward.x += (fx - playerPhys.moveForward.x) * fwdBlend;
        playerPhys.moveForward.y += (fy - playerPhys.moveForward.y) * fwdBlend;
        playerPhys.moveForward.z += (fz - playerPhys.moveForward.z) * fwdBlend;
        const fwdNorm = vec3Normalize(playerPhys.moveForward);
        playerPhys.moveForward.x = fwdNorm.x;
        playerPhys.moveForward.y = fwdNorm.y;
        playerPhys.moveForward.z = fwdNorm.z;
        
        // Calculate right vector.
        const right = vec3Cross(playerPhys.moveForward, playerPhys.up);
        
        // Sprint check.
        const sprinting = !!(inputState.keys["shift"] || inputState.keys["shiftleft"] || inputState.keys["shiftright"]);
        playerPhys.sprinting = sprinting;
        const baseSpeed = sprinting ? playerPhys.runSpeed : playerPhys.walkSpeed;
        
        // Calculate movement direction.
        const wantX = right.x * inputState.moveX - playerPhys.moveForward.x * inputState.moveZ;
        const wantZ = right.z * inputState.moveX - playerPhys.moveForward.z * inputState.moveZ;
        
        // Apply horizontal velocity.
        const upVelDot = vec3Dot(velocity, playerPhys.up);
        velocity.x = wantX * baseSpeed + playerPhys.up.x * upVelDot;
        velocity.z = wantZ * baseSpeed + playerPhys.up.z * upVelDot;
        
        // Jump.
        if (inputState.jump && playerPhys.onGround) {
          velocity.x += playerPhys.up.x * playerPhys.jumpPower;
          velocity.y += playerPhys.up.y * playerPhys.jumpPower;
          velocity.z += playerPhys.up.z * playerPhys.jumpPower;
          playerPhys.onGround = false;
        }
        
        // Apply gravity.
        velocity.x += gravityVec.x * dt;
        velocity.y += gravityVec.y * dt;
        velocity.z += gravityVec.z * dt;
      }
      
      // Integrate position.
      transform.position.x += velocity.x * dt;
      transform.position.y += velocity.y * dt;
      transform.position.z += velocity.z * dt;
      
      // Reset onGround before collision phase.
      playerPhys.onGround = false;
      
      // Update components.
      world.set(eid, Velocity, velocity);
      world.set(eid, Transform, transform);
      world.set(eid, PlayerPhysics, playerPhys);
    }
    
    // Process all non-player objects with physics.
    for (const [eid, physics] of world.query(Physics)) {
      // Skip if this is the player entity.
      if (world.has(eid, Player)) continue;
      
      // Skip anchored objects - they don't move.
      if (physics.anchored) continue;
      
      // Skip motor-pinned objects - their position is driven by the rig.
      if (world.has(eid, MotorPinned)) continue;
      
      const transform = world.get(eid, Transform);
      const velocity = world.get(eid, Velocity);
      if (!transform || !velocity) continue;
      
      // Calculate gravity for this object.
      const gravityVec = computeGravity(transform.position, gravitySources, worldPhysics.gravity);
      
      // Integrate gravity into velocity.
      velocity.x += gravityVec.x * dt;
      velocity.y += gravityVec.y * dt;
      velocity.z += gravityVec.z * dt;
      
      // Apply air drag.
      if (worldPhysics.airDrag > 0) {
        const drag = 1 - worldPhysics.airDrag * dt;
        velocity.x *= drag;
        velocity.y *= drag;
        velocity.z *= drag;
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

/**
 * Compute gravity acceleration for a position, considering gravity sources.
 */
function computeGravity(
  position: Vec3,
  gravitySources: { position: Vec3; strength: number; radius: number }[],
  worldGravity: number
): Vec3 {
  let gx = 0, gy = -worldGravity, gz = 0;
  
  for (const source of gravitySources) {
    const dx = source.position.x - position.x;
    const dy = source.position.y - position.y;
    const dz = source.position.z - position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (dist < source.radius && dist > 0.01) {
      // Inverse square falloff clamped to reasonable values.
      const strength = source.strength * Math.min(1, (source.radius - dist) / source.radius);
      const norm = 1 / dist;
      gx += dx * norm * strength;
      gy += dy * norm * strength;
      gz += dz * norm * strength;
    }
  }
  
  return { x: gx, y: gy, z: gz };
}
