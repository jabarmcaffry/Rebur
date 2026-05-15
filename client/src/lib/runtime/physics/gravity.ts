/**
 * Gravity computation - extracted from core.ts
 * Computes gravity acceleration based on nearby gravity sources.
 */

import type { RuntimeObject, Vec3 } from "../types";
import { pointVsObjectSurface } from "../utils/helpers";

/**
 * Compute gravity acceleration for a target point.
 * Checks all objects with gravity properties and returns the strongest pull.
 * Falls back to default world gravity if no gravity sources affect the target.
 * 
 * Exactly matches the logic from core.ts computeGravityForTarget method.
 */
export function computeGravityAccel(
  point: Vec3,
  targetId: string | null,
  targetName: string | null,
  isPlayer: boolean,
  objectList: RuntimeObject[],
  defaultGravity: number
): Vec3 {
  let bestMag = 0;
  let best: Vec3 | null = null;
  
  for (const source of objectList) {
    if (!source.gravity || typeof source.gravity !== "object") continue;
    
    const exclusions = source._gravityExclusions;
    if (isPlayer && exclusions.has("player")) continue;
    if (targetId && exclusions.has(targetId)) continue;
    if (targetName && exclusions.has(targetName)) continue;
    
    const { surfaceDistance, dirToCenter, surfaceRadius } = pointVsObjectSurface(point, source);
    if (surfaceDistance > source.gravity.radius) continue;
    
    const r = Math.max(surfaceRadius, surfaceRadius + Math.max(0, surfaceDistance));
    const accel = (source.gravity.strength * surfaceRadius * surfaceRadius) / (r * r);
    
    if (accel > bestMag) {
      bestMag = accel;
      best = { x: dirToCenter.x * accel, y: dirToCenter.y * accel, z: dirToCenter.z * accel };
    }
  }
  
  if (bestMag > 0) return best!;
  return { x: 0, y: -defaultGravity, z: 0 };
}
