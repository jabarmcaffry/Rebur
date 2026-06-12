/**
 * game-room.ts — Server-authoritative game room (20 Hz tick)
 *
 * This room intentionally keeps server-side script execution authoritative while
 * broadcasting render-only snapshots to clients. Client scripts may still run for
 * local presentation, but physics, player movement, collision, touch/click/gui
 * events, and server scripts stay here.
 */

import { ScriptRunner, type ScriptObjState, type ScriptPlayerState } from "./script-runner";
import type { RenderState, RenderObject, RenderPlayer, RenderGuiElement, Vec3 } from "../shared/render-types";

const TICK_MS = 50;
const GRAVITY = -28;
const DEFAULT_SPEED = 14;
const DEFAULT_JUMP = 14;
const SPRINT_MULT = 1.6;
const PLAYER_HALF_H = 0.9;
const PLAYER_RADIUS = 0.4;
const OBJ_BOUNCE = 0.25;
const OBJ_DRAG = 0.88;
const KILL_Y = -50;

type Bounds = {
  id: string;
  name: string;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
};

interface PlayerState {
  id: string;
  name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number;
  onGround: boolean;
  moveX: number;
  moveZ: number;
  jumpQueued: boolean;
  heading: number;
  camY: number;
  sprint: boolean;
  spawnX: number; spawnY: number; spawnZ: number;
  shirtColor: string;
  skinColor: string;
  pantsColor: string;
  health: number;
  maxHealth: number;
  speed: number;
  jumpPower: number;
  animation: string;
  camWx: number; camWy: number; camWz: number;
  camFx: number; camFy: number; camFz: number;
}

interface DynamicObj {
  id: string;
  name: string;
  container: string;
  type: string;
  primitiveType: string | null;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotX: number; rotY: number; rotZ: number;
  sx: number; sy: number; sz: number;
  color: string;
  visible: boolean;
  anchored: boolean;
  canCollide: boolean;
  transparency: number;
  parentId?: string | null;
  properties: Record<string, any>;
  modelUrl?: string;
  modelScale?: number;
  audioUrl?: string;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
  gravityEnabled?: boolean;
  gravityStrength?: number;
  gravityRadius?: number;
  health?: number;
  maxHealth?: number;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return v === undefined || v === null ? fallback : Boolean(v);
}

function vec(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export class GameRoom {
  private players = new Map<string, PlayerState>();
  private statics: Bounds[] = [];
  private dynamics = new Map<string, DynamicObj>();
  private allObjs = new Map<string, DynamicObj>();
  private scriptObjs = new Map<string, ScriptObjState>();
  private scriptRunner: ScriptRunner = new ScriptRunner();
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private touchedPairs = new Set<string>();
  private tickNumber = 0;
  private spawnPoint = { x: 0, y: 1.5, z: 0 };
  private objIdCounter = 0;

  constructor(
    private readonly broadcastFn: (msg: object) => void,
    private readonly sendToPlayerFn?: (playerId: string, msg: object) => void,
  ) {}

  get playerCount() {
    return this.players.size;
  }

  getActivePlayers() {
    return Array.from(this.players.values()).map((p) => ({ id: p.id, name: p.name }));
  }

  getSpawnPoint() {
    return { ...this.spawnPoint };
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  setObjects(objects: any[]) {
    this.statics = [];
    this.dynamics.clear();
    this.allObjs.clear();
    this.scriptObjs.clear();
    this.touchedPairs.clear();

    const spawnObj = objects.find((o) => o.type === "spawn" || o.name === "SpawnLocation");
    if (spawnObj) {
      const sy = num(spawnObj.scaleY, 1);
      this.spawnPoint = {
        x: num(spawnObj.positionX),
        y: num(spawnObj.positionY) + sy / 2 + PLAYER_HALF_H + 0.05,
        z: num(spawnObj.positionZ),
      };
    }

    for (const o of objects) {
      const props = (o.properties ?? {}) as Record<string, any>;
      const sx = num(o.scaleX, 1), sy = num(o.scaleY, 1), sz = num(o.scaleZ, 1);
      const px = num(o.positionX), py = num(o.positionY), pz = num(o.positionZ);
      const anchored = props.anchored !== false;
      const canCollide = props.canCollide !== false;
      const container = o.container ?? "Workspace";

      // If this is a GUI object, add it to the GUI elements map
      if (o.type?.startsWith("gui")) {
        const guiKind = o.type.replace("gui", "").toLowerCase() || "frame";
        this.scriptRunner.guiElements.set(o.id, {
          id: o.id,
          kind: guiKind as "text" | "button" | "image" | "bar" | "frame",
          text: o.name,
          x: px * 100,
          y: py * 100,
          width: sx * 100,
          height: sy * 100,
          anchor: "topLeft",
          color: o.color ?? "#ffffff",
          fontSize: 14,
          backgroundColor: o.color ?? "#3b82f6",
          visible: props.visible !== false,
          parentId: o.parentId ?? null,
          zIndex: props.zIndex,
          opacity: props.opacity,
          borderRadius: props.borderRadius,
          borderWidth: props.borderWidth,
          borderColor: props.borderColor,
          padding: props.padding,
          shadow: props.shadow,
        });
      }

      const dobj: DynamicObj = {
        id: o.id,
        name: o.name ?? "Part",
        container,
        type: o.type ?? "primitive",
        primitiveType: o.primitiveType ?? null,
        x: px, y: py, z: pz,
        vx: 0, vy: 0, vz: 0,
        rotX: num(o.rotationX), rotY: num(o.rotationY), rotZ: num(o.rotationZ),
        sx, sy, sz,
        color: o.color ?? "#888888",
        visible: props.visible !== false,
        anchored,
        canCollide,
        transparency: num(props.transparency, 0),
        parentId: o.parentId ?? null,
        properties: { ...props, anchored, canCollide },
        modelUrl: props.fileUrl ?? props.modelUrl,
        modelScale: props.modelScale,
        audioUrl: props.audioUrl,
        animation: props.animation ?? null,
        animationSpeed: props.animationSpeed ?? 1,
        animationLoop: props.animationLoop !== false,
        gravityEnabled: !!props.gravity,
        gravityStrength: props.gravity?.strength ?? 20,
        gravityRadius: props.gravity?.radius ?? 20,
        health: props.health,
        maxHealth: props.maxHealth,
      };

      this.allObjs.set(dobj.id, dobj);
      this.scriptObjs.set(dobj.name, this._toScriptObj(dobj));
    }

    this._rebuildPhysicsSets();
  }

  loadScripts(scripts: { code: string; name: string; enabled: boolean }[]) {
    const currentPlayers = Array.from(this.players.values()).map((p) => this._makeScriptPlayer(p));
    this.scriptRunner = new ScriptRunner();
    // Inject raycast helper into runner
    (this.scriptRunner as any)._doRaycast = (o: any, d: any, dist: number, ignore: any[]) => this._doRaycast(o, d, dist, ignore);
    
    for (const p of currentPlayers) this.scriptRunner.players.set(p.id, p);

    const objs = Array.from(this.scriptObjs.values());
    for (const s of scripts) {
      if (s.enabled && s.code?.trim()) {
        this.scriptRunner.init(s.code, objs);
      }
    }
  }

  addPlayer(id: string, name: string, x = 0, y = 5, z = 0, colors: any = {}) {
    const p: PlayerState = {
      id, name, x, y, z,
      vx: 0, vy: 0, vz: 0,
      rotY: 0, onGround: false,
      moveX: 0, moveZ: 0, jumpQueued: false,
      heading: 0, camY: 0, sprint: false,
      spawnX: x, spawnY: y, spawnZ: z,
      shirtColor: colors.shirtColor ?? "#3b82f6",
      skinColor: colors.skinColor ?? "#d4a574",
      pantsColor: colors.pantsColor ?? "#374151",
      health: 100, maxHealth: 100,
      speed: DEFAULT_SPEED, jumpPower: DEFAULT_JUMP,
      animation: "idle",
      camWx: x, camWy: y + 6, camWz: z + 8,
      camFx: 0, camFy: 0, camFz: -1,
    };
    this.players.set(id, p);
    const sp = this._makeScriptPlayer(p);
    this.scriptRunner.players.set(id, sp);
    this.scriptRunner._fireGlobal("playerjoined", sp);
    this.scriptRunner._fireGlobal("playerspawned", sp);

    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }

  removePlayer(id: string) {
    const sp = this.scriptRunner.players.get(id);
    if (sp) this.scriptRunner._fireGlobal("playerleft", sp);
    this.players.delete(id);
    this.scriptRunner.players.delete(id);
    this.scriptRunner.perPlayerHeldKeys.delete(id);
    for (const key of Array.from(this.touchedPairs)) {
      if (key.startsWith(`${id}:`)) this.touchedPairs.delete(key);
    }
    if (this.players.size === 0) this.stop();
  }

  applyInput(
    id: string,
    moveX: number,
    moveZ: number,
    jump: boolean,
    rotY: number,
    camY: number,
    sprint = false,
    cameraPos?: Vec3,
    cameraForward?: Vec3,
  ) {
    const p = this.players.get(id);
    if (!p) return;
    p.moveX = Math.max(-1, Math.min(1, num(moveX)));
    p.moveZ = Math.max(-1, Math.min(1, num(moveZ)));
    if (jump) p.jumpQueued = true;
    p.rotY = num(rotY, p.rotY);
    p.camY = num(camY, p.camY);
    p.sprint = !!sprint;
    if (cameraPos) { p.camWx = num(cameraPos.x, p.camWx); p.camWy = num(cameraPos.y, p.camWy); p.camWz = num(cameraPos.z, p.camWz); }
    if (cameraForward) { p.camFx = num(cameraForward.x, p.camFx); p.camFy = num(cameraForward.y, p.camFy); p.camFz = num(cameraForward.z, p.camFz); }
  }

  syncPosition(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.x = num(x, p.x);
    p.y = num(y, p.y);
    p.z = num(z, p.z);
    p.rotY = num(rotY, p.rotY);
    this._syncScriptPlayer(p);
  }

  handleObjectClick(playerId: string, objId: string | null) {
    const player = this.players.get(playerId);
    if (!player) return;
    const sp = this._makeScriptPlayer(player);
    const obj = objId ? this.allObjs.get(objId) : null;
    if (obj) this.scriptRunner._fireObj(obj.name, "clicked", sp);
    const handlers = this.scriptRunner.inputHandlers.get("mouseclick") ?? [];
    for (const h of handlers) {
      try { h(sp, obj ? this._toScriptObj(obj) : null); } catch (err) { console.error("Script error in mouseClick:", err); }
    }
  }

  handleGuiClick(playerId: string, elementId: string) {
    const player = this.players.get(playerId);
    const handler = this.scriptRunner.guiClickHandlers.get(elementId);
    if (!player || !handler) return;
    try { handler(this._makeScriptPlayer(player)); } catch (err) { console.error("Script error in guiClick:", err); }
  }

  handleKeyDown(playerId: string, key: string) {
    this._setHeldKey(playerId, key, true);
    this._fireInput("press", playerId, key);
  }

  handleKeyUp(playerId: string, key: string) {
    this._setHeldKey(playerId, key, false);
    this._fireInput("release", playerId, key);
  }

  handleNetworkMessage(playerId: string, event: string, payload: any) {
    const player = this.players.get(playerId);
    if (!player) return;
    const handlers = this.scriptRunner.networkHandlers.get(event.toLowerCase()) ?? [];
    const sp = this._makeScriptPlayer(player);
    for (const h of handlers) {
      try { h(sp, payload); } catch (err) { console.error(`Script error in network event ${event}:`, err); }
    }
  }

  getPlayerRender(id: string): RenderPlayer | null {
    const p = this.players.get(id);
    return p ? this._toRenderPlayer(p) : null;
  }

  getSnapshot(localPlayerId: string | null): RenderState {
    return this._makeRenderState(localPlayerId);
  }

  private _tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;

    this.scriptRunner.tick(dt);
    this._syncFromScripts();
    this._simulatePlayers(dt);
    this._simulateObjects(dt);
    this._syncToScripts();
    this._dispatchTouches();
    this._drainScriptOutputs();
    this._updateAnimations();

    this.tickNumber++;
    if (this.players.size > 0) {
      this.broadcastFn({ type: "worldState", state: this._makeRenderState(null) });
    }
  }

  private _doRaycast(origin: any, direction: any, distance: number, ignoreList: any[] = []) {
    const ox = num(origin.x), oy = num(origin.y), oz = num(origin.z);
    const dx = num(direction.x), dy = num(direction.y), dz = num(direction.z);
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / mag, ny = dy / mag, nz = dz / mag;

    let closestDist = distance;
    let hitObj: any = null;
    let hitPos = { x: ox + nx * distance, y: oy + ny * distance, z: oz + nz * distance };
    let hitNormal = { x: 0, y: 1, z: 0 };

    const ignoreIds = new Set(ignoreList.map(i => typeof i === "string" ? i : i.id || i.name));

    // Simple AABB raycast against all collidable objects
    for (const obj of this.allObjs.values()) {
      if (!obj.canCollide || ignoreIds.has(obj.id) || ignoreIds.has(obj.name)) continue;

      const sx = obj.sx / 2, sy = obj.sy / 2, sz = obj.sz / 2;
      const minX = obj.x - sx, maxX = obj.x + sx;
      const minY = obj.y - sy, maxY = obj.y + sy;
      const minZ = obj.z - sz, maxZ = obj.z + sz;

      // Slab method for AABB ray intersection
      let tmin = -Infinity, tmax = Infinity;

      if (nx !== 0) {
        let t1 = (minX - ox) / nx, t2 = (maxX - ox) / nx;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (ox < minX || ox > maxX) continue;

      if (ny !== 0) {
        let t1 = (minY - oy) / ny, t2 = (maxY - oy) / ny;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (oy < minY || oy > maxY) continue;

      if (nz !== 0) {
        let t1 = (minZ - oz) / nz, t2 = (maxZ - oz) / nz;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (oz < minZ || oz > maxZ) continue;

      if (tmax >= tmin && tmin > 0 && tmin < closestDist) {
        closestDist = tmin;
        hitObj = obj;
        hitPos = { x: ox + nx * tmin, y: oy + ny * tmin, z: oz + nz * tmin };
        // Approximate normal based on which side was hit
        const cx = Math.abs(hitPos.x - obj.x) / sx;
        const cy = Math.abs(hitPos.y - obj.y) / sy;
        const cz = Math.abs(hitPos.z - obj.z) / sz;
        if (cx > cy && cx > cz) hitNormal = { x: hitPos.x > obj.x ? 1 : -1, y: 0, z: 0 };
        else if (cy > cx && cy > cz) hitNormal = { x: 0, y: hitPos.y > obj.y ? 1 : -1, z: 0 };
        else hitNormal = { x: 0, y: 0, z: hitPos.z > obj.z ? 1 : -1 };
      }
    }

    if (!hitObj) return null;

    // Convert hitObj to proxy-like structure for script
    return {
      entity: { id: hitObj.id, name: hitObj.name },
      position: hitPos,
      normal: hitNormal,
      distance: closestDist
    };
  }

  private _simulatePlayers(dt: number) {
    for (const p of this.players.values()) {
      for (const obj of this.allObjs.values()) {
        if (!obj.gravityEnabled) continue;
        const dx = obj.x - p.x, dy = obj.y - p.y, dz = obj.z - p.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0 && dist < (obj.gravityRadius ?? 20)) {
          const force = (obj.gravityStrength ?? 20) / Math.max(dist, 1);
          p.vx += (dx / dist) * force * dt;
          p.vy += (dy / dist) * force * dt;
          p.vz += (dz / dist) * force * dt;
        }
      }

      const spd = p.speed * (p.sprint ? SPRINT_MULT : 1);
      p.vy += GRAVITY * dt;
      const cos = Math.cos(p.camY), sin = Math.sin(p.camY);
      p.vx = (-p.moveX * cos - p.moveZ * sin) * spd;
      p.vz = (p.moveX * sin - p.moveZ * cos) * spd;
      if (p.jumpQueued && p.onGround) {
        p.vy = p.jumpPower;
        p.onGround = false;
      }
      p.jumpQueued = false;
      if (Math.abs(p.vx) > 0.01 || Math.abs(p.vz) > 0.01) {
        p.rotY = Math.atan2(p.vx, p.vz);
        p.heading = p.rotY;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.onGround = false;

      if (p.y - PLAYER_HALF_H < KILL_Y || p.health <= 0) {
        this._handlePlayerDeath(p);
        continue;
      }

      this._pushPlayerOutOfStatics(p);
      this._syncScriptPlayer(p);
    }
  }

  private _simulateObjects(dt: number) {
    for (const obj of this.dynamics.values()) {
      if (obj.anchored) continue;
      obj.vy += GRAVITY * dt;
      const drag = Math.pow(OBJ_DRAG, dt);
      obj.vx *= drag;
      obj.vz *= drag;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.z += obj.vz * dt;

      if (obj.y < KILL_Y) {
        obj.x = 0; obj.y = 5; obj.z = 0;
        obj.vx = 0; obj.vy = 0; obj.vz = 0;
      }

      if (obj.canCollide) {
        this._pushObjOutOfStatics(obj);
        for (const p of this.players.values()) {
          const dx = obj.x - p.x, dz = obj.z - p.z, dy = obj.y - p.y;
          const distSq = dx * dx + dz * dz;
          const minDist = PLAYER_RADIUS + Math.max(obj.sx, obj.sz) / 2;
          if (distSq < minDist * minDist && Math.abs(dy) < PLAYER_HALF_H + obj.sy / 2) {
            const dist = Math.sqrt(distSq) || 1e-3;
            const push = 8 * (minDist - dist);
            obj.vx += (dx / dist) * push;
            obj.vz += (dz / dist) * push;
            obj.vy += 2;
          }
        }
      }
    }
  }

  private _syncFromScripts() {
    let needsRebuild = false;
    for (const [name, so] of this.scriptRunner.objects) {
      if ((so as any)._destroyed) {
        const existing = this._findObjByName(name);
        if (existing) {
          this.allObjs.delete(existing.id);
          this.dynamics.delete(existing.id);
          needsRebuild = true;
        }
        continue;
      }

      let obj = this._findObjByName(name);
      if (!obj) {
        obj = this._fromScriptObj(so, `script_${++this.objIdCounter}`);
        this.allObjs.set(obj.id, obj);
        needsRebuild = true;
      }

      const wasAnchored = obj.anchored;
      const wasCanCollide = obj.canCollide;
      obj.x = num((so as any).positionX, obj.x);
      obj.y = num((so as any).positionY, obj.y);
      obj.z = num((so as any).positionZ, obj.z);
      obj.rotX = num((so as any).rotationX, obj.rotX);
      obj.rotY = num((so as any).rotationY, obj.rotY);
      obj.rotZ = num((so as any).rotationZ, obj.rotZ);
      obj.sx = num((so as any).scaleX, obj.sx);
      obj.sy = num((so as any).scaleY, obj.sy);
      obj.sz = num((so as any).scaleZ, obj.sz);
      obj.color = so.color ?? obj.color;
      obj.visible = so.visible !== false;
      obj.transparency = num(so.transparency, obj.transparency);
      obj.anchored = bool((so as any).anchored, obj.anchored);
      obj.canCollide = (so as any).canCollide !== false;
      obj.properties = { ...obj.properties, anchored: obj.anchored, canCollide: obj.canCollide, transparency: obj.transparency };
      if (!obj.anchored) {
        obj.vx = num((so as any).velX, obj.vx);
        obj.vy = num((so as any).velY, obj.vy);
        obj.vz = num((so as any).velZ, obj.vz);
      }
      if (wasAnchored !== obj.anchored || wasCanCollide !== obj.canCollide) needsRebuild = true;
    }
    if (needsRebuild) this._rebuildPhysicsSets();
  }

  private _syncToScripts() {
    for (const obj of this.allObjs.values()) {
      const so = this.scriptRunner.objects.get(obj.name) ?? this.scriptObjs.get(obj.name);
      if (!so) continue;
      (so as any).positionX = obj.x;
      (so as any).positionY = obj.y;
      (so as any).positionZ = obj.z;
      (so as any).rotationX = obj.rotX;
      (so as any).rotationY = obj.rotY;
      (so as any).rotationZ = obj.rotZ;
      (so as any).scaleX = obj.sx;
      (so as any).scaleY = obj.sy;
      (so as any).scaleZ = obj.sz;
      so.position = vec(obj.x, obj.y, obj.z);
      so.rotation = vec(obj.rotX, obj.rotY, obj.rotZ);
      so.scale = vec(obj.sx, obj.sy, obj.sz);
      so.color = obj.color;
      so.visible = obj.visible;
      so.transparency = obj.transparency;
      (so as any).anchored = obj.anchored;
      (so as any).canCollide = obj.canCollide;
      (so as any).velX = obj.vx;
      (so as any).velY = obj.vy;
      (so as any).velZ = obj.vz;
    }
  }

  private _dispatchTouches() {
    const nowTouching = new Set<string>();
    for (const p of this.players.values()) {
      const sp = this._makeScriptPlayer(p);
      for (const obj of this.allObjs.values()) {
        if (!this._isWorldPhysicsObject(obj)) continue;
        const hx = obj.sx / 2, hy = obj.sy / 2, hz = obj.sz / 2;
        const ox = Math.min(p.x + PLAYER_RADIUS, obj.x + hx) - Math.max(p.x - PLAYER_RADIUS, obj.x - hx);
        const oy = Math.min(p.y + PLAYER_HALF_H, obj.y + hy) - Math.max(p.y - PLAYER_HALF_H, obj.y - hy);
        const oz = Math.min(p.z + PLAYER_RADIUS, obj.z + hz) - Math.max(p.z - PLAYER_RADIUS, obj.z - hz);
        if (ox > 0 && oy > 0 && oz > 0) {
          const key = `${p.id}:${obj.id}`;
          nowTouching.add(key);
          if (!this.touchedPairs.has(key)) this.scriptRunner._fireObj(obj.name, "touched", sp);
        }
      }
    }

    for (const key of this.touchedPairs) {
      if (nowTouching.has(key)) continue;
      const [playerId, objId] = key.split(":");
      const p = this.players.get(playerId);
      const obj = this.allObjs.get(objId);
      if (p && obj) this.scriptRunner._fireObj(obj.name, "untouched", this._makeScriptPlayer(p));
    }
    this.touchedPairs = nowTouching;
  }

  private _drainScriptOutputs() {
    while (this.scriptRunner.soundQueue.length > 0) {
      const s = this.scriptRunner.soundQueue.shift();
      if (!s) continue;
      if (s.targetPlayerId && this.sendToPlayerFn) {
        this.sendToPlayerFn(s.targetPlayerId, { type: "sound", soundId: s.soundId, options: s.options });
      } else {
        this.broadcastFn({ type: "sound", soundId: s.soundId, options: s.options });
      }
    }

    while (this.scriptRunner.networkMessages.length > 0) {
      const msg = this.scriptRunner.networkMessages.shift();
      if (msg) this.broadcastFn({ type: "networkMessage", event: msg.event, payload: msg.payload });
    }

    while (this.scriptRunner.networkToPlayer.length > 0) {
      const msg = this.scriptRunner.networkToPlayer.shift();
      if (msg && this.sendToPlayerFn) {
        this.sendToPlayerFn(msg.playerId, { type: "networkMessage", event: msg.event, payload: msg.payload });
      }
    }
  }

  private _pushPlayerOutOfStatics(p: PlayerState) {
    for (const b of this.statics) {
      const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
      const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
      const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (p.y > (b.minY + b.maxY) / 2) {
            p.y += oy;
            if (p.vy < 0) { p.vy = 0; p.onGround = true; }
          } else {
            p.y -= oy;
            if (p.vy > 0) p.vy = 0;
          }
        } else if (min === ox) {
          p.x += p.x > (b.minX + b.maxX) / 2 ? ox : -ox;
          p.vx = 0;
        } else {
          p.z += p.z > (b.minZ + b.maxZ) / 2 ? oz : -oz;
          p.vz = 0;
        }
      }
    }
  }

  private _pushObjOutOfStatics(obj: DynamicObj) {
    const hx = obj.sx / 2, hy = obj.sy / 2, hz = obj.sz / 2;
    for (const b of this.statics) {
      if (b.id === obj.id) continue;
      const ox = Math.min(obj.x + hx, b.maxX) - Math.max(obj.x - hx, b.minX);
      const oy = Math.min(obj.y + hy, b.maxY) - Math.max(obj.y - hy, b.minY);
      const oz = Math.min(obj.z + hz, b.maxZ) - Math.max(obj.z - hz, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (obj.y > (b.minY + b.maxY) / 2) { obj.y += oy; obj.vy = Math.abs(obj.vy) * OBJ_BOUNCE; }
          else { obj.y -= oy; obj.vy = -Math.abs(obj.vy) * OBJ_BOUNCE; }
        } else if (min === ox) {
          obj.x += obj.x > (b.minX + b.maxX) / 2 ? ox : -ox;
          obj.vx = -obj.vx * OBJ_BOUNCE;
        } else {
          obj.z += obj.z > (b.minZ + b.maxZ) / 2 ? oz : -oz;
          obj.vz = -obj.vz * OBJ_BOUNCE;
        }
      }
    }
  }

  private _handlePlayerDeath(p: PlayerState) {
    this.scriptRunner._fireGlobal("playerdied", this._makeScriptPlayer(p));
    this._respawnPlayer(p);
    p.health = p.maxHealth;
    this.scriptRunner._fireGlobal("playerrespawned", this._makeScriptPlayer(p));
  }

  private _respawnPlayer(p: PlayerState) {
    p.x = p.spawnX; p.y = p.spawnY; p.z = p.spawnZ;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.onGround = false;
  }

  private _setHeldKey(playerId: string, key: string, down: boolean) {
    const normalized = String(key).toLowerCase();
    const keys = this.scriptRunner.perPlayerHeldKeys.get(playerId) ?? new Set<string>();
    if (down) keys.add(normalized);
    else keys.delete(normalized);
    this.scriptRunner.perPlayerHeldKeys.set(playerId, keys);
  }

  private _fireInput(event: "press" | "release", playerId: string, key: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    const handlers = this.scriptRunner.inputHandlers.get(event) ?? [];
    const sp = this._makeScriptPlayer(player);
    for (const h of handlers) {
      try { h(sp, key); } catch (err) { console.error(`Script error in input ${event}:`, err); }
    }
  }

  private _updateAnimations() {
    for (const p of this.players.values()) {
      const hspd = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      if (!p.onGround) p.animation = p.vy > 1 ? "jump" : "fall";
      else if (hspd > p.speed * 0.8) p.animation = "run";
      else if (hspd > 0.5) p.animation = "walk";
      else p.animation = "idle";
    }
  }

  private _rebuildPhysicsSets() {
    this.statics = [];
    this.dynamics.clear();
    for (const obj of this.allObjs.values()) {
      if (!this._isWorldPhysicsObject(obj)) continue;
      if (obj.anchored) {
        if (obj.canCollide) this.statics.push(this._boundsFor(obj));
      } else {
        this.dynamics.set(obj.id, obj);
      }
    }
  }

  private _isWorldPhysicsObject(obj: DynamicObj) {
    const c = obj.container || "Workspace";
    return (c === "Workspace" || c === "Scene" || c === "") && obj.type !== "light" && obj.type !== "folder" && obj.type !== "audio" && obj.type !== "uiElement";
  }

  private _boundsFor(obj: DynamicObj): Bounds {
    return {
      id: obj.id,
      name: obj.name,
      minX: obj.x - obj.sx / 2,
      maxX: obj.x + obj.sx / 2,
      minY: obj.y - obj.sy / 2,
      maxY: obj.y + obj.sy / 2,
      minZ: obj.z - obj.sz / 2,
      maxZ: obj.z + obj.sz / 2,
    };
  }

  private _syncScriptPlayer(p: PlayerState) {
    const sp = this.scriptRunner.players.get(p.id);
    if (!sp) return;
    sp.position = vec(p.x, p.y, p.z);
    sp.rotation = vec(0, p.rotY, 0);
    (sp as any).heading = p.heading;
    sp.velocity = vec(p.vx, p.vy, p.vz);
    sp.onGround = p.onGround;
    sp.animation = p.animation;
    sp.health = p.health;
    sp.maxHealth = p.maxHealth;
    (sp as any).speed = p.speed;
    (sp as any).jumpPower = p.jumpPower;
    (sp as any).shirtColor = p.shirtColor;
    (sp as any).skinColor = p.skinColor;
    (sp as any).pantsColor = p.pantsColor;
  }

  private _makeScriptPlayer(p: PlayerState): ScriptPlayerState {
    return {
      id: p.id,
      name: p.name,
      position: vec(p.x, p.y, p.z),
      rotation: vec(0, p.rotY, 0),
      velocity: vec(p.vx, p.vy, p.vz),
      onGround: p.onGround,
      animation: p.animation,
      health: p.health,
      maxHealth: p.maxHealth,
      colors: { shirt: p.shirtColor, skin: p.skinColor, pants: p.pantsColor },
      motors: {},
      heading: p.heading,
      speed: p.speed,
      jumpPower: p.jumpPower,
      shirtColor: p.shirtColor,
      skinColor: p.skinColor,
      pantsColor: p.pantsColor,
    } as ScriptPlayerState;
  }

  private _toRenderPlayer(p: PlayerState): RenderPlayer {
    return {
      id: p.id,
      name: p.name,
      position: vec(p.x, p.y - PLAYER_HALF_H, p.z),
      rotation: vec(0, p.rotY, 0),
      velocity: vec(p.vx, p.vy, p.vz),
      onGround: p.onGround,
      animation: p.animation,
      health: p.health,
      maxHealth: p.maxHealth,
      colors: { shirt: p.shirtColor, skin: p.skinColor, pants: p.pantsColor },
      motors: {},
    };
  }

  private _toRenderObj(o: DynamicObj): RenderObject {
    return {
      id: o.id,
      name: o.name,
      type: o.type,
      primitiveType: o.primitiveType,
      position: vec(o.x, o.y, o.z),
      rotation: vec(o.rotX, o.rotY, o.rotZ),
      scale: vec(o.sx, o.sy, o.sz),
      color: o.color,
      visible: o.visible,
      transparency: o.transparency ?? 0,
      parentId: o.parentId,
      properties: { ...o.properties, anchored: o.anchored, canCollide: o.canCollide, transparency: o.transparency },
      modelUrl: o.modelUrl,
      modelScale: o.modelScale,
      audioUrl: o.audioUrl,
      animation: o.animation,
      animationSpeed: o.animationSpeed,
      animationLoop: o.animationLoop,
      health: o.health,
      maxHealth: o.maxHealth,
    };
  }

  private _toScriptObj(o: DynamicObj): ScriptObjState {
    return {
      id: o.id,
      name: o.name,
      type: o.type,
      primitiveType: o.primitiveType,
      position: vec(o.x, o.y, o.z),
      rotation: vec(o.rotX, o.rotY, o.rotZ),
      scale: vec(o.sx, o.sy, o.sz),
      color: o.color,
      visible: o.visible,
      transparency: o.transparency,
      parentId: o.parentId,
      properties: { ...o.properties, anchored: o.anchored, canCollide: o.canCollide, transparency: o.transparency },
      positionX: o.x,
      positionY: o.y,
      positionZ: o.z,
      rotationX: o.rotX,
      rotationY: o.rotY,
      rotationZ: o.rotZ,
      scaleX: o.sx,
      scaleY: o.sy,
      scaleZ: o.sz,
      anchored: o.anchored,
      canCollide: o.canCollide,
      velX: o.vx,
      velY: o.vy,
      velZ: o.vz,
      mass: o.properties.mass ?? 1,
      friction: o.properties.friction ?? 0.5,
      restitution: o.properties.restitution ?? 0,
      health: o.health,
      maxHealth: o.maxHealth,
    } as ScriptObjState;
  }

  private _fromScriptObj(so: ScriptObjState, fallbackId: string): DynamicObj {
    const s = so as any;
    const props = (so.properties ?? {}) as Record<string, any>;
    return {
      id: so.id || fallbackId,
      name: so.name ?? fallbackId,
      container: s.container ?? "Workspace",
      type: so.type ?? "primitive",
      primitiveType: so.primitiveType ?? "cube",
      x: num(s.positionX ?? so.position?.x),
      y: num(s.positionY ?? so.position?.y),
      z: num(s.positionZ ?? so.position?.z),
      vx: num(s.velX), vy: num(s.velY), vz: num(s.velZ),
      rotX: num(s.rotationX ?? so.rotation?.x),
      rotY: num(s.rotationY ?? so.rotation?.y),
      rotZ: num(s.rotationZ ?? so.rotation?.z),
      sx: num(s.scaleX ?? so.scale?.x, 1),
      sy: num(s.scaleY ?? so.scale?.y, 1),
      sz: num(s.scaleZ ?? so.scale?.z, 1),
      color: so.color ?? "#888888",
      visible: so.visible !== false,
      anchored: s.anchored !== false,
      canCollide: s.canCollide !== false,
      transparency: num(so.transparency, 0),
      parentId: so.parentId ?? null,
      properties: { ...props, anchored: s.anchored !== false, canCollide: s.canCollide !== false },
      health: so.health,
      maxHealth: so.maxHealth,
    };
  }

  private _findObjByName(name: string) {
    for (const obj of this.allObjs.values()) {
      if (obj.name === name) return obj;
    }
    return null;
  }

  private _normalizeGui(g: any): RenderGuiElement {
    return {
      id: String(g.id),
      kind: g.kind,
      text: g.text,
      x: num(g.x, 0),
      y: num(g.y, 0),
      width: g.width,
      height: g.height,
      anchor: g.anchor ?? "topLeft",
      color: g.color ?? "#ffffff",
      fontSize: g.fontSize ?? 14,
      backgroundColor: g.backgroundColor,
      imageUrl: g.imageUrl,
      value: g.value,
      maxValue: g.maxValue,
      visible: g.visible !== false,
      clickable: g.clickable,
      parentId: g.parentId,
      zIndex: g.zIndex,
      opacity: g.opacity,
      borderRadius: g.borderRadius,
      borderWidth: g.borderWidth,
      borderColor: g.borderColor,
      padding: g.padding,
      shadow: g.shadow,
    };
  }

  private _makeRenderState(localPlayerId: string | null): RenderState {
    const lighting = this.scriptRunner.worldSettings && Object.keys(this.scriptRunner.worldSettings).length > 0
      ? this.scriptRunner.worldSettings as RenderState["lighting"]
      : undefined;

    return {
      tick: this.tickNumber,
      serverTime: Date.now(),
      objects: Array.from(this.allObjs.values()).map((o) => this._toRenderObj(o)),
      players: Array.from(this.players.values()).map((p) => this._toRenderPlayer(p)),
      gui: Array.from(this.scriptRunner.guiElements.values()).map((g) => this._normalizeGui(g)),
      localPlayerId,
      lighting,
      debugDraws: this.scriptRunner.debugDraws.splice(0),
      particleEvents: this.scriptRunner.particleEvents.splice(0),
    };
  }
}
