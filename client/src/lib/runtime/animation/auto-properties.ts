/**
 * Auto-properties and animation state management - extracted from core.ts
 * Handles automatic rotation, bobbing, following, spinning, moving and player animation.
 */

import type { RuntimeObject, RuntimePlayer } from "../types";

/**
 * Apply automatic property updates to all objects.
 * Exactly matches the logic from core.ts updateAutoProperties method.
 */
export function applyAutoProperties(objectList: RuntimeObject[], dt: number): void {
  for (const o of objectList) {
    if (o.autoRotateY !== undefined) o.rotation.y += o.autoRotateY * dt;
    if (o.autoSpin) {
      if (o.autoSpin.x) o.rotation.x += o.autoSpin.x * dt;
      if (o.autoSpin.y) o.rotation.y += o.autoSpin.y * dt;
      if (o.autoSpin.z) o.rotation.z += o.autoSpin.z * dt;
    }
    if (o.autoBob) {
      if (o.autoBob.startY === undefined) o.autoBob.startY = o.position.y;
      o.autoBob._time = (o.autoBob._time || 0) + dt * o.autoBob.speed;
      o.position.y = o.autoBob.startY + Math.sin(o.autoBob._time) * o.autoBob.amplitude;
    }
    if (o.autoFollow?.target) {
      const targetPos = o.autoFollow.target.position;
      const offset = o.autoFollow.offset || { x: 0, y: 0, z: 0 };
      const dx = targetPos.x + offset.x - o.position.x;
      const dy = targetPos.y + offset.y - o.position.y;
      const dz = targetPos.z + offset.z - o.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 0.01) {
        const move = Math.min(o.autoFollow.speed * dt, dist);
        o.position.x += (dx / dist) * move;
        o.position.y += (dy / dist) * move;
        o.position.z += (dz / dist) * move;
      }
    }
    if (o.autoMove) {
      o.position.x += o.autoMove.direction.x * o.autoMove.speed * dt;
      o.position.y += o.autoMove.direction.y * o.autoMove.speed * dt;
      o.position.z += o.autoMove.direction.z * o.autoMove.speed * dt;
    }
  }
}

/**
 * Update player animation state based on movement.
 * Exactly matches the logic from core.ts updatePlayerAnimation method.
 */
export function updatePlayerAnimation(player: RuntimePlayer): void {
  const p = player;
  if (p.ragdoll) { p.motors.animation = "ragdoll"; return; }
  const horiz = Math.hypot(p.velocity.x, p.velocity.z);
  if (!p.onGround) {
    p.motors.animation = p.velocity.y > 0.5 ? "jump" : "fall";
  } else if (horiz > (p.walkSpeed ?? 6) * 1.15) {
    p.motors.animation = "run";
  } else if (horiz > 0.3) {
    p.motors.animation = "walk";
  } else {
    p.motors.animation = "idle";
  }
}
