/**
 * state-snapshot.ts
 *
 * Compact serialization of a GameRoom's runtime state for sleep/wake cycles.
 *
 * Design goals:
 *  – Fast: serialize / deserialize in < 5 ms for a typical world (< 500 objects)
 *  – Compact: delta encoding strips fields that haven't changed from the base
 *  – Safe: restore is idempotent; applying a bad delta falls back to full base
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotObject {
  id: string; name: string; type: string; primitiveType: string | null;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotX: number; rotY: number; rotZ: number;
  sx: number; sy: number; sz: number;
  color: string; visible: boolean; anchored: boolean; transparency: number;
  modelUrl?: string; modelScale?: number;
  gravityEnabled?: boolean; gravityStrength?: number; gravityRadius?: number;
}

export interface SnapshotPlayer {
  id: string; name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number; health: number; maxHealth: number;
  speed: number; jumpPower: number;
  shirtColor: string; skinColor: string; pantsColor: string;
  spawnX: number; spawnY: number; spawnZ: number;
}

export interface GameSnapshot {
  version: 2;
  timestamp: number;
  gameId: string;
  sessionId: string;
  tickNumber: number;
  spawnPoint: { x: number; y: number; z: number };
  objects: SnapshotObject[];
  players: SnapshotPlayer[];
}

// ── Delta encoding ────────────────────────────────────────────────────────────
// A delta stores only fields whose numeric value changed by > EPSILON,
// or whose non-numeric value changed at all.

const EPSILON = 0.001;

type DeltaRecord = Record<string, any>;

export interface GameDelta {
  version: 2;
  timestamp: number;
  baseTimestamp: number;
  sessionId: string;
  tickNumber: number;
  spawnPoint?: { x: number; y: number; z: number };
  // Each entry: { id, ...changedFields }
  objectDeltas: DeltaRecord[];
  objectAdded: SnapshotObject[];
  objectRemoved: string[];      // ids
  playerDeltas: DeltaRecord[];
  playerAdded: SnapshotPlayer[];
  playerRemoved: string[];      // ids
}

function objDelta(prev: SnapshotObject, curr: SnapshotObject): DeltaRecord | null {
  const d: DeltaRecord = { id: curr.id };
  let changed = false;
  for (const k of Object.keys(curr) as Array<keyof SnapshotObject>) {
    if (k === "id") continue;
    const pv = prev[k];
    const cv = curr[k];
    if (typeof cv === "number" && typeof pv === "number") {
      if (Math.abs(cv - pv) > EPSILON) { d[k] = cv; changed = true; }
    } else if (cv !== pv) {
      d[k] = cv; changed = true;
    }
  }
  return changed ? d : null;
}

function playerDelta(prev: SnapshotPlayer, curr: SnapshotPlayer): DeltaRecord | null {
  const d: DeltaRecord = { id: curr.id };
  let changed = false;
  for (const k of Object.keys(curr) as Array<keyof SnapshotPlayer>) {
    if (k === "id") continue;
    const pv = prev[k];
    const cv = curr[k];
    if (typeof cv === "number" && typeof pv === "number") {
      if (Math.abs(cv - pv) > EPSILON) { d[k] = cv; changed = true; }
    } else if (cv !== pv) {
      d[k] = cv; changed = true;
    }
  }
  return changed ? d : null;
}

/**
 * Compute a delta between two snapshots.
 * The delta can be applied to `base` to recreate `current`.
 */
export function computeDelta(base: GameSnapshot, current: GameSnapshot): GameDelta {
  const prevObjMap = new Map(base.objects.map(o => [o.id, o]));
  const currObjMap = new Map(current.objects.map(o => [o.id, o]));
  const prevPlrMap = new Map(base.players.map(p => [p.id, p]));
  const currPlrMap = new Map(current.players.map(p => [p.id, p]));

  const objectDeltas: DeltaRecord[] = [];
  const objectAdded: SnapshotObject[] = [];
  const objectRemoved: string[] = [];
  const playerDeltas: DeltaRecord[] = [];
  const playerAdded: SnapshotPlayer[] = [];
  const playerRemoved: string[] = [];

  for (const [id, curr] of currObjMap) {
    const prev = prevObjMap.get(id);
    if (!prev) { objectAdded.push(curr); }
    else {
      const d = objDelta(prev, curr);
      if (d) objectDeltas.push(d);
    }
  }
  for (const id of prevObjMap.keys()) {
    if (!currObjMap.has(id)) objectRemoved.push(id);
  }

  for (const [id, curr] of currPlrMap) {
    const prev = prevPlrMap.get(id);
    if (!prev) { playerAdded.push(curr); }
    else {
      const d = playerDelta(prev, curr);
      if (d) playerDeltas.push(d);
    }
  }
  for (const id of prevPlrMap.keys()) {
    if (!currPlrMap.has(id)) playerRemoved.push(id);
  }

  const spawnChanged =
    Math.abs(base.spawnPoint.x - current.spawnPoint.x) > EPSILON ||
    Math.abs(base.spawnPoint.y - current.spawnPoint.y) > EPSILON ||
    Math.abs(base.spawnPoint.z - current.spawnPoint.z) > EPSILON;

  return {
    version: 2,
    timestamp: current.timestamp,
    baseTimestamp: base.timestamp,
    sessionId: current.sessionId,
    tickNumber: current.tickNumber,
    spawnPoint: spawnChanged ? { ...current.spawnPoint } : undefined,
    objectDeltas,
    objectAdded,
    objectRemoved,
    playerDeltas,
    playerAdded,
    playerRemoved,
  };
}

/**
 * Apply a delta to a base snapshot, producing the new snapshot.
 * Returns null if the delta's baseTimestamp doesn't match base.timestamp (stale).
 */
export function applyDelta(base: GameSnapshot, delta: GameDelta): GameSnapshot | null {
  if (delta.baseTimestamp !== base.timestamp) return null;

  const objMap = new Map(base.objects.map(o => [o.id, { ...o }]));
  for (const removed of delta.objectRemoved) objMap.delete(removed);
  for (const added of delta.objectAdded) objMap.set(added.id, { ...added });
  for (const d of delta.objectDeltas) {
    const obj = objMap.get(d.id);
    if (obj) Object.assign(obj, d);
  }

  const plrMap = new Map(base.players.map(p => [p.id, { ...p }]));
  for (const removed of delta.playerRemoved) plrMap.delete(removed);
  for (const added of delta.playerAdded) plrMap.set(added.id, { ...added });
  for (const d of delta.playerDeltas) {
    const plr = plrMap.get(d.id);
    if (plr) Object.assign(plr, d);
  }

  return {
    version: 2,
    timestamp: delta.timestamp,
    gameId: base.gameId,
    sessionId: delta.sessionId,
    tickNumber: delta.tickNumber,
    spawnPoint: delta.spawnPoint ?? { ...base.spawnPoint },
    objects: Array.from(objMap.values()),
    players: Array.from(plrMap.values()),
  };
}

/**
 * Serialize a snapshot to a compact JSON string.
 * Numbers are rounded to 3 decimal places to reduce payload size.
 */
export function serializeSnapshot(snap: GameSnapshot): string {
  const rounded = {
    ...snap,
    spawnPoint: round3(snap.spawnPoint),
    objects: snap.objects.map(roundObj),
    players: snap.players.map(roundPlr),
  };
  return JSON.stringify(rounded);
}

export function deserializeSnapshot(json: string): GameSnapshot | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed?.version !== 2) return null;
    return parsed as GameSnapshot;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function r3(n: number) { return Math.round(n * 1000) / 1000; }
function round3<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = typeof v === "number" ? r3(v) : v;
  }
  return result;
}

function roundObj(o: SnapshotObject): SnapshotObject {
  return {
    ...o,
    x: r3(o.x), y: r3(o.y), z: r3(o.z),
    vx: r3(o.vx), vy: r3(o.vy), vz: r3(o.vz),
    rotX: r3(o.rotX), rotY: r3(o.rotY), rotZ: r3(o.rotZ),
    sx: r3(o.sx), sy: r3(o.sy), sz: r3(o.sz),
    transparency: r3(o.transparency),
  };
}

function roundPlr(p: SnapshotPlayer): SnapshotPlayer {
  return {
    ...p,
    x: r3(p.x), y: r3(p.y), z: r3(p.z),
    vx: r3(p.vx), vy: r3(p.vy), vz: r3(p.vz),
    rotY: r3(p.rotY),
    spawnX: r3(p.spawnX), spawnY: r3(p.spawnY), spawnZ: r3(p.spawnZ),
  };
}
