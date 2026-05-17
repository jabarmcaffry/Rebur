/**
 * Player collision resolution - extracted from core.ts
 * Handles capsule-vs-AABB and capsule-vs-sphere collision detection and response.
 */

import { objectHalfExtents, Vec3 } from "../utils/helpers";
import type { RuntimePlayer, RuntimeObject } from "../types";

export interface CollisionResult {
  grounded: boolean;
  contactIds: Set<string>;
}

/**
 * Resolve player collision against a single object.
 * Mutates player position and velocity as needed.
 * Returns true if player is grounded from this collision.
 */
export function resolvePlayerVsObject(
  p: RuntimePlayer,
  obj: RuntimeObject,
  pRad: number,
  pHalfH: number
): { collided: boolean; grounded: boolean } {
  const half = objectHalfExtents(obj);
  const up = p.up;

  // Player collision center (feet-based positioning: center is above feet)
  const ph = pHalfH;
  const cx = p.position.x;
  const cy = p.position.y + ph;
  const cz = p.position.z;

  let collided = false;
  let grounded = false;

  if (obj.primitiveType === "sphere") {
    // Sphere collision
    const r = Math.max(half.x, half.y, half.z);
    const dx = cx - obj.position.x;
    const dy = cy - obj.position.y;
    const dz = cz - obj.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minDist = r + pRad;

    if (dist < minDist && dist > 0.001) {
      collided = true;
      const pen = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      // Push player out
      p.position.x += nx * pen;
      p.position.y += ny * pen;
      p.position.z += nz * pen;

      // Cancel velocity into surface
      const vDotN = p.velocity.x * nx + p.velocity.y * ny + p.velocity.z * nz;
      if (vDotN < 0) {
        p.velocity.x -= vDotN * nx;
        p.velocity.y -= vDotN * ny;
        p.velocity.z -= vDotN * nz;
      }

      // Check if ground (normal points in same direction as player's up)
      const upDot = nx * up.x + ny * up.y + nz * up.z;
      if (upDot > 0.5) {
        grounded = true;
      }
    }
  } else {
    // AABB collision (capsule approximated as vertical AABB)
    const combinedHalfX = half.x + pRad;
    const combinedHalfY = half.y + ph;
    const combinedHalfZ = half.z + pRad;

    const dx = cx - obj.position.x;
    const dy = cy - obj.position.y;
    const dz = cz - obj.position.z;

    const overlapX = combinedHalfX - Math.abs(dx);
    const overlapY = combinedHalfY - Math.abs(dy);
    const overlapZ = combinedHalfZ - Math.abs(dz);

    if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
      collided = true;

      // Push out along minimum overlap axis
      let nx = 0, ny = 0, nz = 0;
      let pen = 0;

      if (overlapY < overlapX && overlapY < overlapZ) {
        pen = overlapY;
        ny = dy > 0 ? 1 : -1;
        if (ny > 0) grounded = true;
      } else if (overlapX < overlapZ) {
        pen = overlapX;
        nx = dx > 0 ? 1 : -1;
      } else {
        pen = overlapZ;
        nz = dz > 0 ? 1 : -1;
      }

      p.position.x += nx * pen;
      p.position.y += ny * pen;
      p.position.z += nz * pen;

      // Cancel velocity into surface
      const vDotN = p.velocity.x * nx + p.velocity.y * ny + p.velocity.z * nz;
      if (vDotN < 0) {
        p.velocity.x -= vDotN * nx;
        p.velocity.y -= vDotN * ny;
        p.velocity.z -= vDotN * nz;
      }
    }
  }

  return { collided, grounded };
}

/**
 * Check if player can pick up an object (proximity check)
 */
export function canPickup(
  p: RuntimePlayer,
  obj: RuntimeObject,
  pRad: number,
  pHalfH: number
): boolean {
  if (!obj.isPickup || !obj.visible) return false;

  const cx = p.position.x;
  const cy = p.position.y + pHalfH;
  const cz = p.position.z;

  const dx = cx - obj.position.x;
  const dy = cy - obj.position.y;
  const dz = cz - obj.position.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return dist < pRad + 0.5;
}
