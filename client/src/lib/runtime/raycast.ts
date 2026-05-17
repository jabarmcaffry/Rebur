/**
 * Basic raycasting against the runtime's Workspace objects.
 *
 * Supports cube (AABB), sphere, plane (treated as thin AABB) and cylinder
 * (approximated as AABB). Honors `canCollide` and an optional ignore list /
 * filter so scripts can exclude themselves or specific objects.
 *
 * Usage from a script:
 *   const hit = raycast(player.position, { x: 0, y: -1, z: 0 }, 5);
 *   if (hit) log("standing on", hit.object.name, "at distance", hit.distance);
 */
import type { RuntimeObject, Vec3 } from "./types";

export type RaycastResult = {
  object: RuntimeObject;
  position: Vec3;
  normal: Vec3;
  distance: number;
} | null;

export type RaycastParams = {
  ignore?: RuntimeObject[];
  filter?: (o: RuntimeObject) => boolean;
  /** When false (default) only objects with `canCollide` are tested. */
  ignoreCollidable?: boolean;
};

function half(o: RuntimeObject) {
  return {
    x: Math.max(0.05, (o.scale.x || 1) * 0.5),
    y: Math.max(0.05, (o.scale.y || 1) * 0.5),
    z: Math.max(0.05, (o.scale.z || 1) * 0.5),
  };
}

/** Ray vs AABB — slab method. Returns t along the ray (>=0) or null. */
function rayAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
  maxDist: number
): { t: number; normal: Vec3 } | null {
  const inv = (v: number) => (Math.abs(v) < 1e-8 ? 1e8 * Math.sign(v || 1) : 1 / v);
  const idx = inv(dx), idy = inv(dy), idz = inv(dz);
  const t1x = (cx - hx - ox) * idx, t2x = (cx + hx - ox) * idx;
  const t1y = (cy - hy - oy) * idy, t2y = (cy + hy - oy) * idy;
  const t1z = (cz - hz - oz) * idz, t2z = (cz + hz - oz) * idz;
  const tminX = Math.min(t1x, t2x), tmaxX = Math.max(t1x, t2x);
  const tminY = Math.min(t1y, t2y), tmaxY = Math.max(t1y, t2y);
  const tminZ = Math.min(t1z, t2z), tmaxZ = Math.max(t1z, t2z);
  const tmin = Math.max(tminX, tminY, tminZ);
  const tmax = Math.min(tmaxX, tmaxY, tmaxZ);
  if (tmax < 0 || tmin > tmax || tmin > maxDist) return null;
  const t = tmin < 0 ? 0 : tmin;
  let normal: Vec3;
  if (tmin === tminX) normal = { x: dx > 0 ? -1 : 1, y: 0, z: 0 };
  else if (tmin === tminY) normal = { x: 0, y: dy > 0 ? -1 : 1, z: 0 };
  else normal = { x: 0, y: 0, z: dz > 0 ? -1 : 1 };
  return { t, normal };
}

/** Ray vs sphere. */
function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  r: number,
  maxDist: number
): { t: number; normal: Vec3 } | null {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = Math.max(0, -b - Math.sqrt(disc));
  if (t > maxDist) return null;
  const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
  const nx = (px - cx) / r, ny = (py - cy) / r, nz = (pz - cz) / r;
  return { t, normal: { x: nx, y: ny, z: nz } };
}

export function raycast(
  objects: Iterable<RuntimeObject>,
  origin: Vec3,
  direction: Vec3,
  maxDistance = 100,
  params: RaycastParams = {}
): RaycastResult {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / len, dy = direction.y / len, dz = direction.z / len;
  const ignore = new Set((params.ignore ?? []).map((o) => o.id));

  let best: RaycastResult = null;
  for (const o of objects) {
    if (!o.visible) continue;
    if (o.container !== "Workspace") continue;
    if (o.type === "light" || o.type === "spawn") continue;
    if (!params.ignoreCollidable && !o.canCollide) continue;
    if (ignore.has(o.id)) continue;
    if (params.filter && !params.filter(o)) continue;

    let hit: { t: number; normal: Vec3 } | null = null;
    if (o.primitiveType === "sphere") {
      const r = Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5;
      hit = raySphere(origin.x, origin.y, origin.z, dx, dy, dz, o.position.x, o.position.y, o.position.z, r, maxDistance);
    } else {
      const h = half(o);
      hit = rayAabb(origin.x, origin.y, origin.z, dx, dy, dz, o.position.x, o.position.y, o.position.z, h.x, h.y, h.z, maxDistance);
    }
    if (!hit) continue;
    if (best && hit.t >= best.distance) continue;
    best = {
      object: o,
      distance: hit.t,
      position: { x: origin.x + dx * hit.t, y: origin.y + dy * hit.t, z: origin.z + dz * hit.t },
      normal: hit.normal,
    };
  }
  return best;
}
