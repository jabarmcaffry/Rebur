/**
 * Pure utility functions extracted from core.ts
 * These have no dependencies on runtime state and are safe to call anywhere.
 */

/** Generate a unique ID */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Format an error for logging */
export function formatErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a value between min and max */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Normalize an angle to [-PI, PI] */
export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Vector3 type for internal use */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculate object half-extents from its scale.
 * RuntimeObject uses `scale` (not `size`) — using `size` here was a silent
 * collision bug that made every object behave as a 1×1×1 cube.
 */
export function objectHalfExtents(o: { scale: Vec3; primitiveType?: string | null }): Vec3 {
  if (o.primitiveType === "sphere") {
    const r = Math.max(o.scale.x || 1, o.scale.y || 1, o.scale.z || 1) * 0.5;
    return { x: r, y: r, z: r };
  }
  return {
    x: Math.max(0.05, (o.scale.x || 1) * 0.5),
    y: Math.max(0.05, (o.scale.y || 1) * 0.5),
    z: Math.max(0.05, (o.scale.z || 1) * 0.5),
  };
}

/** Check if a point is inside an AABB */
export function pointInAABB(
  px: number, py: number, pz: number,
  boxX: number, boxY: number, boxZ: number,
  halfX: number, halfY: number, halfZ: number
): boolean {
  return (
    Math.abs(px - boxX) <= halfX &&
    Math.abs(py - boxY) <= halfY &&
    Math.abs(pz - boxZ) <= halfZ
  );
}

/** Calculate distance between two 3D points */
export function distance3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Dot product of two vectors */
export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Normalize a vector in place, returns length */
export function normalize3(v: Vec3): number {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len > 1e-8) {
    v.x /= len;
    v.y /= len;
    v.z /= len;
  }
  return len;
}

/** Clamp value to [0, 1] */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Format script error with line info and hints */
export function formatScriptErr(e: any, scriptName: string): string {
  const msg = e?.message ?? String(e);
  const lineMatch = typeof e?.stack === "string" ? e.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
  const line = lineMatch ? Math.max(1, Number(lineMatch[1]) - 57) : null;
  const userHint = /is not defined|Cannot read properties|not a function|Unexpected|undefined|null/i.test(msg);
  const hint = userHint
    ? "Check for a typo, missing object, wrong container, or unsupported API use."
    : "This may be an engine error. If your script looks correct, contact support.";
  return `[${scriptName}] Runtime error${line ? ` on line ${line}` : ""}: ${msg}\n${hint}`;
}

/** Default object properties */
export const DEFAULT_PROPERTIES = {
  anchored: true,
  canCollide: true,
  transparency: 0,
  mass: 1,
  friction: 0.5,
};

/** Read and normalize object properties from a GameObject */
export function readProperties(o: { properties?: Record<string, any>; type?: string }): {
  anchored: boolean;
  canCollide: boolean;
  transparency: number;
  mass: number;
  friction: number;
  gravity: false | { strength: number; radius: number };
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number; startY?: number };
  autoFollow?: { target: any; speed: number; offset?: Vec3 };
  autoSpin?: { x?: number; y?: number; z?: number };
  autoMove?: { direction: Vec3; speed: number };
} {
  const p = (o.properties ?? {}) as Record<string, any>;
  const isLightOrSpawn = o.type === "light" || o.type === "spawn";
  let gravityVal: false | { strength: number; radius: number } = false;
  if (p.gravity) {
    if (typeof p.gravity === "object" && "strength" in p.gravity && "radius" in p.gravity) {
      gravityVal = { strength: p.gravity.strength, radius: p.gravity.radius };
    } else if (p.gravity === true) {
      gravityVal = { strength: 9.81, radius: 30 };
    }
  } else if (p.gravityEnabled === true) {
    gravityVal = {
      strength: p.gravityStrength ?? 9.81,
      radius: p.gravityRadius ?? 30,
    };
  }
  return {
    anchored: p.anchored ?? true,
    canCollide: p.canCollide ?? !isLightOrSpawn,
    transparency: clamp01(p.transparency ?? 0),
    mass: p.mass ?? DEFAULT_PROPERTIES.mass,
    friction: p.friction ?? DEFAULT_PROPERTIES.friction,
    gravity: gravityVal,
    autoRotateY: p.autoRotateY,
    autoBob: p.autoBob,
    autoFollow: p.autoFollow,
    autoSpin: p.autoSpin,
    autoMove: p.autoMove,
  };
}


/** Get point vs object surface info for gravity calculations */
export function pointVsObjectSurface(point: Vec3, o: { position: Vec3; scale: Vec3; primitiveType?: string | null }): {
  surfaceDistance: number;
  dirToCenter: Vec3;
  surfaceRadius: number;
} {
  const half = objectHalfExtents(o);
  const dx = point.x - o.position.x;
  const dy = point.y - o.position.y;
  const dz = point.z - o.position.z;

  if (o.primitiveType === "sphere") {
    const r = Math.max(half.x, half.y, half.z);
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.0001) return { surfaceDistance: -r, dirToCenter: { x: 0, y: -1, z: 0 }, surfaceRadius: r };
    return {
      surfaceDistance: dist - r,
      dirToCenter: { x: -dx / dist, y: -dy / dist, z: -dz / dist },
      surfaceRadius: r,
    };
  }

  const cx = Math.max(-half.x, Math.min(half.x, dx));
  const cy = Math.max(-half.y, Math.min(half.y, dy));
  const cz = Math.max(-half.z, Math.min(half.z, dz));
  const ox = dx - cx;
  const oy = dy - cy;
  const oz = dz - cz;
  const outside = Math.hypot(ox, oy, oz);
  const surfaceRadius = (half.x + half.y + half.z) / 3;
  if (outside < 0.0001) {
    const ax = Math.abs(dx) / Math.max(0.0001, half.x);
    const ay = Math.abs(dy) / Math.max(0.0001, half.y);
    const az = Math.abs(dz) / Math.max(0.0001, half.z);
    let dir: Vec3;
    if (ax > ay && ax > az) dir = { x: -Math.sign(dx) || -1, y: 0, z: 0 };
    else if (ay > az) dir = { x: 0, y: -Math.sign(dy) || -1, z: 0 };
    else dir = { x: 0, y: 0, z: -Math.sign(dz) || -1 };
    return { surfaceDistance: -Math.min(half.x, half.y, half.z), dirToCenter: dir, surfaceRadius };
  }
  return {
    surfaceDistance: outside,
    dirToCenter: { x: -ox / outside, y: -oy / outside, z: -oz / outside },
    surfaceRadius,
  };
}
