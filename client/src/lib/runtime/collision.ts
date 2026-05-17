// collision.ts — Object-vs-object collision resolution (AABB / sphere)
import type { RuntimeObject } from "./types";

function half(o: RuntimeObject) {
  return {
    x: Math.max(0.05, (o.scale.x || 1) * 0.5),
    y: Math.max(0.05, (o.scale.y || 1) * 0.5),
    z: Math.max(0.05, (o.scale.z || 1) * 0.5),
  };
}

function resolvePair(a: RuntimeObject, b: RuntimeObject) {
  if (!a.canCollide || !b.canCollide) return;
  if (a.anchored && b.anchored) return;

  // Sphere-sphere fast path
  if (a.primitiveType === "sphere" && b.primitiveType === "sphere") {
    const ra = Math.max(a.scale.x, a.scale.y, a.scale.z) * 0.5;
    const rb = Math.max(b.scale.x, b.scale.y, b.scale.z) * 0.5;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dy, dz);
    const min = ra + rb;
    if (d >= min || d < 0.0001) return;
    const nx = dx / d, ny = dy / d, nz = dz / d;
    const pen = min - d;
    if (a.anchored) {
      b.position.x += nx * pen; b.position.y += ny * pen; b.position.z += nz * pen;
      const dot = b.velocity.x * nx + b.velocity.y * ny + b.velocity.z * nz;
      if (dot < 0) { b.velocity.x -= dot * nx; b.velocity.y -= dot * ny; b.velocity.z -= dot * nz; }
    } else if (b.anchored) {
      a.position.x -= nx * pen; a.position.y -= ny * pen; a.position.z -= nz * pen;
      const dot = a.velocity.x * nx + a.velocity.y * ny + a.velocity.z * nz;
      if (dot > 0) { a.velocity.x -= dot * nx; a.velocity.y -= dot * ny; a.velocity.z -= dot * nz; }
    } else {
      const h = pen * 0.5;
      a.position.x -= nx * h; a.position.y -= ny * h; a.position.z -= nz * h;
      b.position.x += nx * h; b.position.y += ny * h; b.position.z += nz * h;
    }
    return;
  }

  // AABB
  const ha = half(a), hb = half(b);
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const ox = ha.x + hb.x - Math.abs(dx);
  const oy = ha.y + hb.y - Math.abs(dy);
  const oz = ha.z + hb.z - Math.abs(dz);
  if (ox <= 0 || oy <= 0 || oz <= 0) return;

  let nx = 0, ny = 0, nz = 0, pen = 0;
  if (ox < oy && ox < oz) { pen = ox; nx = dx > 0 ? 1 : -1; }
  else if (oy < oz) { pen = oy; ny = dy > 0 ? 1 : -1; }
  else { pen = oz; nz = dz > 0 ? 1 : -1; }

  if (a.anchored) {
    b.position.x += nx * pen; b.position.y += ny * pen; b.position.z += nz * pen;
    const dot = b.velocity.x * nx + b.velocity.y * ny + b.velocity.z * nz;
    if (dot < 0) { b.velocity.x -= dot * nx; b.velocity.y -= dot * ny; b.velocity.z -= dot * nz; }
  } else if (b.anchored) {
    a.position.x -= nx * pen; a.position.y -= ny * pen; a.position.z -= nz * pen;
    const dot = a.velocity.x * nx + a.velocity.y * ny + a.velocity.z * nz;
    if (dot > 0) { a.velocity.x -= dot * nx; a.velocity.y -= dot * ny; a.velocity.z -= dot * nz; }
  } else {
    const h = pen * 0.5;
    a.position.x -= nx * h; a.position.y -= ny * h; a.position.z -= nz * h;
    b.position.x += nx * h; b.position.y += ny * h; b.position.z += nz * h;
  }
}

export function resolveObjectCollisions(objects: RuntimeObject[]) {
  const collidable = objects.filter(o => o.canCollide && o.container === "Workspace" && o.type !== "light" && o.type !== "spawn");
  for (let i = 0; i < collidable.length; i++) {
    for (let j = i + 1; j < collidable.length; j++) {
      resolvePair(collidable[i], collidable[j]);
    }
  }
}
