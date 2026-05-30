/**
 * game-room.ts — Server-authoritative game room (20 Hz tick)
 *
 * Tick pipeline:
 *  1. Script tick  — scripts see last frame's physics state, write new values
 *  2. Apply script obj changes  → allObjs
 *  3. Apply script player mutations (health, speed, teleport, respawn…)
 *  4. Per-object gravity wells (planet gravity)
 *  5. Player physics (gravity, WASD+sprint, jump, collision)
 *  6. Dynamic object physics (gravity, drag, bounce, player-push)
 *  7. Sync physics → scriptObjs (next frame scripts see current physics)
 *  8. Touched event detection
 *  9. Dynamic object creation from scripts
 * 10. Sound broadcast from scripts
 * 11. Broadcast authoritative worldState
 */

import { ScriptRunner, type ScriptObjState, type ScriptPlayerState } from "./script-runner";
import type { RenderState, RenderObject, RenderPlayer, RenderGuiElement } from "@shared/render-types";

// ── Constants ─────────────────────────────────────────────────────────────────
const TICK_MS       = 50;    // 20 Hz
const GRAVITY       = -28;
const DEFAULT_SPEED = 14;
const DEFAULT_JUMP  = 14;
const SPRINT_MULT   = 1.6;
const PLAYER_HALF_H = 0.9;
const PLAYER_RADIUS = 0.4;
const OBJ_BOUNCE    = 0.25;
const OBJ_DRAG      = 0.88;
const KILL_Y        = -50;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PlayerState {
  id: string; name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number; onGround: boolean;
  moveX: number; moveZ: number;
  jumpQueued: boolean; camY: number;
  sprint: boolean;
  spawnX: number; spawnY: number; spawnZ: number;
  shirtColor: string; skinColor: string; pantsColor: string;
  health: number; maxHealth: number;
  speed: number; jumpPower: number;
  animation: string;
}

interface StaticBox {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  name: string;
}

interface DynamicObj {
  id: string; name: string;
  type: string; primitiveType: string | null;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotX: number; rotY: number; rotZ: number;
  sx: number; sy: number; sz: number;
  color: string; visible: boolean; anchored: boolean;
  transparency: number;
  modelUrl?: string;
  modelScale?: number;
  audioUrl?: string;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
  // Per-object gravity well
  gravityEnabled?: boolean;
  gravityStrength?: number;
  gravityRadius?: number;
}

// ── GameRoom ──────────────────────────────────────────────────────────────────

export class GameRoom {
  private players    = new Map<string, PlayerState>();
  private statics: StaticBox[] = [];
  private dynamics   = new Map<string, DynamicObj>();
  private allObjs    = new Map<string, DynamicObj>();
  private scriptObjs = new Map<string, ScriptObjState>();
  private scriptRunner: ScriptRunner | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick   = Date.now();
  private touchedPairs = new Set<string>();
  private collisionPairs = new Set<string>(); // solid object-object pairs
  private tickNumber = 0;
  private spawnPoint = { x: 0, y: 1.5, z: 0 };
  private objIdCounter = 0;
  // Per-player held keys (key: playerId, value: Set of held key strings)
  private playerHeldKeys = new Map<string, Set<string>>();

  constructor(
    private readonly broadcastFn: (msg: object) => void,
    private readonly sendToPlayerFn?: (playerId: string, msg: object) => void,
  ) {}

  getSpawnPoint() { return { ...this.spawnPoint }; }

  getPlayerRender(id: string): object | null {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      id: p.id, name: p.name,
      position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
      rotation: { x: 0, y: p.rotY, z: 0 },
      velocity: { x: p.vx, y: p.vy, z: p.vz },
      onGround: p.onGround,
      animation: p.animation,
      health: p.health, maxHealth: p.maxHealth,
      colors: { shirt: p.shirtColor, skin: p.skinColor, pants: p.pantsColor },
      motors: {},
    };
  }

  // ── World setup ─────────────────────────────────────────────────────────────

  setObjects(objects: any[]) {
    this.statics = [];
    this.dynamics.clear();
    this.allObjs.clear();
    this.scriptObjs.clear();
    this.touchedPairs.clear();

    const spawnObj = objects.find((o: any) => o.type === "spawn" || o.name === "SpawnLocation");
    if (spawnObj) {
      const sy = spawnObj.scaleY ?? 1;
      this.spawnPoint = {
        x: spawnObj.positionX ?? 0,
        y: (spawnObj.positionY ?? 0) + sy / 2 + PLAYER_HALF_H + 0.05,
        z: spawnObj.positionZ ?? 0,
      };
    }

    for (const o of objects) {
      const c = o.container ?? "Workspace";
      const isWorkspace = c === "Workspace" || c === "Scene" || c === "";

      // All objects go into scriptObjs so Rebur.Scene / Rebur.Lighting / Rebur.Storage
      // can query them. Physics statics/dynamics are Workspace-only.
      const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, sz = o.scaleZ ?? 1;
      const px = o.positionX ?? 0, py = o.positionY ?? 0, pz = o.positionZ ?? 0;
      const anchored = o.properties?.anchored !== false;

      this.scriptObjs.set(o.name ?? o.id, {
        id: o.id, name: o.name ?? "Part",
        container: c,
        positionX: px, positionY: py, positionZ: pz,
        rotationX: o.rotationX ?? 0, rotationY: o.rotationY ?? 0, rotationZ: o.rotationZ ?? 0,
        scaleX: sx, scaleY: sy, scaleZ: sz,
        color: o.color ?? "#888888", visible: true, anchored,
        velX: 0, velY: 0, velZ: 0,
        transparency: o.properties?.transparency ?? 0,
        canCollide: o.properties?.canCollide !== false,
      });

      // Physics simulation only for Workspace objects that aren't logical-only types
      if (!isWorkspace) continue;
      if (o.type === "light" || o.type === "folder") continue;

      const gravProp = o.properties?.gravity;

      const dobj: DynamicObj = {
        id: o.id, name: o.name ?? "Part",
        type: o.type ?? "primitive",
        primitiveType: o.primitiveType ?? null,
        x: px, y: py, z: pz,
        vx: 0, vy: 0, vz: 0,
        rotX: o.rotationX ?? 0, rotY: o.rotationY ?? 0, rotZ: o.rotationZ ?? 0,
        sx, sy, sz,
        color: o.color ?? "#888888",
        visible: true, anchored,
        transparency: o.properties?.transparency ?? 0,
        modelUrl: o.type === "model" ? o.properties?.fileUrl : undefined,
        audioUrl: o.type === "audio" ? o.properties?.fileUrl : undefined,
        modelScale: o.properties?.modelScale,
        animation: o.properties?.animation ?? null,
        animationSpeed: o.properties?.animationSpeed ?? 1,
        animationLoop: o.properties?.animationLoop !== false,
        gravityEnabled: !!gravProp,
        gravityStrength: gravProp?.strength ?? 20,
        gravityRadius: gravProp?.radius ?? 20,
      };
      this.allObjs.set(o.id, dobj);

      const isLogicalOnly = o.type === "audio" || o.type === "folder";
      if (!isLogicalOnly && anchored) {
        this.statics.push({
          name: dobj.name,
          minX: px - sx/2, maxX: px + sx/2,
          minY: py - sy/2, maxY: py + sy/2,
          minZ: pz - sz/2, maxZ: pz + sz/2,
        });
      } else if (!isLogicalOnly) {
        this.dynamics.set(o.id, dobj);
      }
    }
  }

  loadScripts(scripts: { code: string; name: string; enabled: boolean }[]) {
    const playerMap = new Map<string, ScriptPlayerState>();
    for (const [, p] of this.players) {
      playerMap.set(p.id, this._makeScriptPlayer(p));
    }
    this.scriptRunner = new ScriptRunner(this.scriptObjs, playerMap);
    for (const s of scripts) {
      if (s.enabled && s.code?.trim()) {
        this.scriptRunner.loadScript(s.code, s.name);
      }
    }
  }

  // ── Players ─────────────────────────────────────────────────────────────────

  addPlayer(id: string, name: string, x = 0, y = 5, z = 0, colors: Record<string, string> = {}) {
    const p: PlayerState = {
      id, name, x, y, z,
      vx: 0, vy: 0, vz: 0,
      rotY: 0, onGround: false,
      moveX: 0, moveZ: 0, jumpQueued: false, camY: 0,
      sprint: false,
      spawnX: x, spawnY: y, spawnZ: z,
      shirtColor: colors.shirtColor ?? "#3b82f6",
      skinColor:  colors.skinColor  ?? "#d4a574",
      pantsColor: colors.pantsColor ?? "#374151",
      health: 100, maxHealth: 100,
      speed: DEFAULT_SPEED, jumpPower: DEFAULT_JUMP,
      animation: "idle",
    };
    this.players.set(id, p);

    if (this.scriptRunner) {
      (this.scriptRunner as any).players.set(id, this._makeScriptPlayer(p));
      this.scriptRunner.firePlayerAdded(this._makeScriptPlayer(p));
    }

    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (p) {
      this.scriptRunner?.firePlayerRemoving(this._makeScriptPlayer(p));
      (this.scriptRunner as any)?.players?.delete(id);
      this.scriptRunner?.clearPlayerGui(id);
      this.scriptRunner?.clearPlayerHeldKeys(id);
    }
    this.players.delete(id);
    this.playerHeldKeys.delete(id);
    for (const key of this.touchedPairs) {
      if (key.startsWith(id + ":")) this.touchedPairs.delete(key);
    }
    if (this.players.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  applyInput(
    id: string,
    moveX: number, moveZ: number,
    jump: boolean, rotY: number, camY: number,
    sprint = false
  ) {
    const p = this.players.get(id);
    if (!p) return;
    p.moveX = moveX; p.moveZ = moveZ;
    if (jump) p.jumpQueued = true;
    p.rotY = rotY; p.camY = camY;
    p.sprint = sprint;
  }

  syncPosition(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x; p.y = y; p.z = z; p.rotY = rotY;
  }

  /** Fire obj.on("clicked") and Rebur.Input.onMouseClick when a client clicks a 3D object. */
  handleObjectClick(playerId: string, objId: string | null) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    const obj = objId ? this.allObjs.get(objId) : null;
    // fires entity.on("clicked") AND Rebur.Input.onMouseClick(entity, player)
    this.scriptRunner.fireMouseClick(obj?.name ?? null, this._makeScriptPlayer(player));
  }

  /** Forward a GUI button click to scripts. */
  handleGuiClick(playerId: string, elementId: string) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    this.scriptRunner.fireGuiClick(elementId, this._makeScriptPlayer(player));
  }

  /** Fire Rebur.Input.on("press") when client sends a keyDown message. */
  handleKeyDown(playerId: string, key: string) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    const k = key.toLowerCase();
    if (!this.playerHeldKeys.has(playerId)) this.playerHeldKeys.set(playerId, new Set());
    this.playerHeldKeys.get(playerId)!.add(k);
    this._rebuildHeldKeys();
    this.scriptRunner.fireInputPress(k, this._makeScriptPlayer(player));
  }

  /** Fire Rebur.Input.on("release") when client sends a keyUp message. */
  handleKeyUp(playerId: string, key: string) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    const k = key.toLowerCase();
    this.playerHeldKeys.get(playerId)?.delete(k);
    this._rebuildHeldKeys();
    this.scriptRunner.fireInputRelease(k, this._makeScriptPlayer(player));
  }

  /** Fire Rebur.Network.on() when client sends a networkSend message. */
  handleNetworkMessage(playerId: string, event: string, payload: any) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    this.scriptRunner.fireNetworkMessage(event, payload, this._makeScriptPlayer(player));
  }

  /** Rebuild the union of all players' held keys and push to scriptRunner. */
  private _rebuildHeldKeys() {
    const union = new Set<string>();
    for (const [pid, keys] of this.playerHeldKeys) {
      for (const k of keys) union.add(k);
      this.scriptRunner?.updatePlayerHeldKeys(pid, keys);
    }
    this.scriptRunner?.updateHeldKeys(union);
  }

  // ── Main tick ─────────────────────────────────────────────────────────────────

  private _tick() {
    const now = Date.now();
    const dt  = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;

    // ── Step 1: Script tick ───────────────────────────────────────────────────
    if (this.scriptRunner) {
      this.scriptRunner.tick(dt);
      const logs = this.scriptRunner.drainLogs();
      if (logs.length > 0) this.broadcastFn({ type: "scriptLog", logs });
    }

    // ── Step 2: Apply script obj changes → allObjs ────────────────────────────
    if (this.scriptRunner) {
      for (const [name, so] of this.scriptObjs) {
        for (const obj of this.allObjs.values()) {
          if (obj.name !== name) continue;
          obj.x     = so.positionX; obj.y     = so.positionY; obj.z     = so.positionZ;
          obj.rotX  = so.rotationX; obj.rotY  = so.rotationY; obj.rotZ  = so.rotationZ;
          obj.color = so.color;     obj.visible = so.visible;
          obj.transparency = so.transparency ?? obj.transparency;
          if (!obj.anchored) { obj.vx = so.velX; obj.vy = so.velY; obj.vz = so.velZ; }
          break;
        }
      }
    }

    // ── Step 3: Apply script player mutations ─────────────────────────────────
    if (this.scriptRunner) {
      const mutations = this.scriptRunner.drainAllPlayerMutations();
      for (const [playerId, mut] of mutations) {
        const p = this.players.get(playerId);
        if (!p) continue;
        if (mut.health    !== undefined) p.health    = Math.max(0, Math.min(p.maxHealth, mut.health));
        if (mut.maxHealth !== undefined) p.maxHealth = Math.max(1, mut.maxHealth);
        if (mut.speed     !== undefined) p.speed     = Math.max(0, mut.speed);
        if (mut.runSpeed  !== undefined) p.speed     = Math.max(0, mut.runSpeed);
        if (mut.jumpPower !== undefined) p.jumpPower = Math.max(0, mut.jumpPower);
        if (mut.shirtColor !== undefined) p.shirtColor = mut.shirtColor;
        if (mut.skinColor  !== undefined) p.skinColor  = mut.skinColor;
        if (mut.pantsColor !== undefined) p.pantsColor = mut.pantsColor;
        if (mut.spawnPoint) { p.spawnX = mut.spawnPoint.x; p.spawnY = mut.spawnPoint.y + PLAYER_HALF_H; p.spawnZ = mut.spawnPoint.z; }
        if (mut.teleport)  { p.x = mut.teleport.x; p.y = mut.teleport.y + PLAYER_HALF_H; p.z = mut.teleport.z; p.vx=0;p.vy=0;p.vz=0; }
        if (mut.respawn)   { this._respawnPlayer(p); }
        // Apply impulse from player.body.applyImpulse()
        if (mut.impulseX !== undefined) p.vx += mut.impulseX;
        if (mut.impulseY !== undefined) p.vy += mut.impulseY;
        if (mut.impulseZ !== undefined) p.vz += mut.impulseZ;
        if (p.health <= 0) this._handlePlayerDeath(p);
      }
    }

    // ── Step 4: Per-object gravity wells ─────────────────────────────────────
    for (const p of this.players.values()) {
      for (const obj of this.allObjs.values()) {
        if (!obj.gravityEnabled) continue;
        const dx = obj.x - p.x, dy = obj.y - p.y, dz = obj.z - p.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist > 0 && dist < (obj.gravityRadius ?? 20)) {
          const force = (obj.gravityStrength ?? 20) / Math.max(dist, 1);
          p.vx += (dx / dist) * force * dt;
          p.vy += (dy / dist) * force * dt;
          p.vz += (dz / dist) * force * dt;
        }
      }
    }

    // ── Step 5: Player physics ────────────────────────────────────────────────
    for (const p of this.players.values()) {
      const spd = p.speed * (p.sprint ? SPRINT_MULT : 1);

      p.vy += GRAVITY * dt;

      const cos = Math.cos(p.camY), sin = Math.sin(p.camY);
      p.vx = (-p.moveX * cos - p.moveZ * sin) * spd;
      p.vz = ( p.moveX * sin - p.moveZ * cos) * spd;

      if (p.jumpQueued && p.onGround) { p.vy = p.jumpPower; p.onGround = false; }
      p.jumpQueued = false;

      if (Math.abs(p.vx) > 0.01 || Math.abs(p.vz) > 0.01) {
        p.rotY = Math.atan2(p.vx, p.vz);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.onGround = false;

      if (p.y - PLAYER_HALF_H < KILL_Y) {
        this._handlePlayerDeath(p);
        continue;
      }

      this._pushPlayerOutOfStatics(p);

      // Sync scriptRunner's view of this player
      const sp = (this.scriptRunner as any)?.players?.get(p.id) as ScriptPlayerState | undefined;
      if (sp) {
        sp.position = { x: p.x, y: p.y, z: p.z };
        sp.health = p.health; sp.maxHealth = p.maxHealth;
        sp.speed = p.speed; sp.jumpPower = p.jumpPower;
        sp.shirtColor = p.shirtColor; sp.skinColor = p.skinColor; sp.pantsColor = p.pantsColor;
      }
    }

    // ── Step 6: Dynamic object physics ───────────────────────────────────────
    for (const obj of this.dynamics.values()) {
      if (obj.anchored) continue;

      obj.vy += GRAVITY * dt;
      const drag = Math.pow(OBJ_DRAG, dt);
      obj.vx *= drag; obj.vz *= drag;

      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.z += obj.vz * dt;

      if (obj.y < KILL_Y) { obj.x=0; obj.y=5; obj.z=0; obj.vx=0; obj.vy=0; obj.vz=0; }

      this._pushObjOutOfStatics(obj);

      for (const p of this.players.values()) {
        const dx = obj.x - p.x, dz = obj.z - p.z, dy = obj.y - p.y;
        const distSq = dx*dx + dz*dz;
        const minDist = PLAYER_RADIUS + Math.max(obj.sx, obj.sz) / 2;
        if (distSq < minDist * minDist && Math.abs(dy) < PLAYER_HALF_H + obj.sy / 2) {
          const dist = Math.sqrt(distSq) || 0.001;
          const push = 8 * (minDist - dist);
          obj.vx += (dx / dist) * push;
          obj.vz += (dz / dist) * push;
          obj.vy += 2;
        }
      }
    }

    // ── Step 7: Sync physics → scriptObjs ────────────────────────────────────
    for (const obj of this.allObjs.values()) {
      const so = this.scriptObjs.get(obj.name);
      if (!so) continue;
      so.positionX = obj.x; so.positionY = obj.y; so.positionZ = obj.z;
      so.rotationX = obj.rotX; so.rotationY = obj.rotY; so.rotationZ = obj.rotZ;
      so.color = obj.color; so.visible = obj.visible;
      so.transparency = obj.transparency ?? 0;
      if (!obj.anchored) { so.velX = obj.vx; so.velY = obj.vy; so.velZ = obj.vz; }
    }

    // ── Step 8: Touched event detection ──────────────────────────────────────
    if (this.scriptRunner) {
      const nowTouching = new Set<string>();
      for (const p of this.players.values()) {
        for (const obj of this.allObjs.values()) {
          const hx=obj.sx/2, hy=obj.sy/2, hz=obj.sz/2;
          const ox = Math.min(p.x+PLAYER_RADIUS, obj.x+hx) - Math.max(p.x-PLAYER_RADIUS, obj.x-hx);
          const oy = Math.min(p.y+PLAYER_HALF_H, obj.y+hy) - Math.max(p.y-PLAYER_HALF_H, obj.y-hy);
          const oz = Math.min(p.z+PLAYER_RADIUS, obj.z+hz) - Math.max(p.z-PLAYER_RADIUS, obj.z-hz);
          if (ox>0 && oy>0 && oz>0) {
            const key = `${p.id}:${obj.id}`;
            nowTouching.add(key);
            if (!this.touchedPairs.has(key)) {
              this.scriptRunner.fireTouched(obj.name, this._makeScriptPlayer(p));
            }
          }
        }
        for (const b of this.statics) {
          const ox = Math.min(p.x+PLAYER_RADIUS, b.maxX) - Math.max(p.x-PLAYER_RADIUS, b.minX);
          const oy = Math.min(p.y+PLAYER_HALF_H, b.maxY) - Math.max(p.y-PLAYER_HALF_H, b.minY);
          const oz = Math.min(p.z+PLAYER_RADIUS, b.maxZ) - Math.max(p.z-PLAYER_RADIUS, b.minZ);
          if (ox>0 && oy>0 && oz>0) {
            const key = `${p.id}:static:${b.name}`;
            nowTouching.add(key);
            if (!this.touchedPairs.has(key)) {
              this.scriptRunner.fireTouched(b.name, this._makeScriptPlayer(p));
            }
          }
        }
      }
      this.touchedPairs = nowTouching;
    }

    // ── Step 9: Dynamic object creation from scripts ──────────────────────────
    if (this.scriptRunner) {
      const newObjs = this.scriptRunner.drainCreatedObjects();
      for (const spec of newObjs) {
        const id = `script_${++this.objIdCounter}`;
        const dobj: DynamicObj = {
          id, name: spec.name,
          type: "primitive", primitiveType: spec.primitiveType,
          x: spec.positionX, y: spec.positionY, z: spec.positionZ,
          vx: 0, vy: 0, vz: 0,
          rotX: spec.rotationX, rotY: spec.rotationY, rotZ: spec.rotationZ,
          sx: spec.scaleX, sy: spec.scaleY, sz: spec.scaleZ,
          color: spec.color, visible: true, anchored: spec.anchored,
          transparency: spec.transparency,
        };
        this.allObjs.set(id, dobj);
        if (!spec.anchored) this.dynamics.set(id, dobj);
        if (spec.anchored) {
          this.statics.push({
            name: spec.name,
            minX: spec.positionX - spec.scaleX/2, maxX: spec.positionX + spec.scaleX/2,
            minY: spec.positionY - spec.scaleY/2, maxY: spec.positionY + spec.scaleY/2,
            minZ: spec.positionZ - spec.scaleZ/2, maxZ: spec.positionZ + spec.scaleZ/2,
          });
        }
        this.scriptObjs.set(spec.name, {
          id, name: spec.name,
          positionX: spec.positionX, positionY: spec.positionY, positionZ: spec.positionZ,
          rotationX: spec.rotationX, rotationY: spec.rotationY, rotationZ: spec.rotationZ,
          scaleX: spec.scaleX, scaleY: spec.scaleY, scaleZ: spec.scaleZ,
          color: spec.color, visible: true, anchored: spec.anchored,
          velX: 0, velY: 0, velZ: 0,
          transparency: spec.transparency, canCollide: spec.canCollide,
        });
      }
    }

    // ── Step 10: Drain and broadcast sounds ───────────────────────────────────
    if (this.scriptRunner) {
      for (const s of this.scriptRunner.drainSounds()) {
        this.broadcastFn({ type: "sound", soundId: s.soundId, options: s.options });
      }
    }

    // ── Step 9b: Dynamic-object collision detection (collisionStarted/Ended) ─
    if (this.scriptRunner) {
      const nowColliding = new Set<string>();

      // Player ↔ dynamic object solid collisions
      for (const p of this.players.values()) {
        const pp = this._makeScriptPlayer(p);
        for (const obj of this.dynamics.values()) {
          const so = this.scriptObjs.get(obj.name);
          if (!so || so.isTrigger || so.canCollide === false) continue;
          const hx = obj.sx/2, hy = obj.sy/2, hz = obj.sz/2;
          const ox = Math.min(p.x+PLAYER_RADIUS, obj.x+hx) - Math.max(p.x-PLAYER_RADIUS, obj.x-hx);
          const oy = Math.min(p.y+PLAYER_HALF_H, obj.y+hy) - Math.max(p.y-PLAYER_HALF_H, obj.y-hy);
          const oz = Math.min(p.z+PLAYER_RADIUS, obj.z+hz) - Math.max(p.z-PLAYER_RADIUS, obj.z-hz);
          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `p:${p.id}:${obj.id}`;
            nowColliding.add(pairKey);
            if (!this.collisionPairs.has(pairKey)) {
              const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy + p.vz*p.vz);
              const impulse = { x: p.vx * speed, y: p.vy * speed, z: p.vz * speed };
              this.scriptRunner.fireCollisionStarted(obj.name, this.scriptRunner.makePlayerProxyPublic(pp), impulse);
            }
          }
        }
      }

      // Dynamic ↔ dynamic solid collisions
      const dynArr = Array.from(this.dynamics.values());
      for (let i = 0; i < dynArr.length; i++) {
        const a = dynArr[i];
        const soA = this.scriptObjs.get(a.name);
        if (!soA || soA.isTrigger || soA.canCollide === false) continue;
        for (let j = i + 1; j < dynArr.length; j++) {
          const b = dynArr[j];
          const soB = this.scriptObjs.get(b.name);
          if (!soB || soB.isTrigger || soB.canCollide === false) continue;
          const ox = Math.min(a.x+a.sx/2, b.x+b.sx/2) - Math.max(a.x-a.sx/2, b.x-b.sx/2);
          const oy = Math.min(a.y+a.sy/2, b.y+b.sy/2) - Math.max(a.y-a.sy/2, b.y-b.sy/2);
          const oz = Math.min(a.z+a.sz/2, b.z+b.sz/2) - Math.max(a.z-a.sz/2, b.z-b.sz/2);
          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `d:${a.id}:${b.id}`;
            nowColliding.add(pairKey);
            if (!this.collisionPairs.has(pairKey)) {
              const dvx = a.vx - b.vx, dvy = a.vy - b.vy, dvz = a.vz - b.vz;
              const speed = Math.sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
              const impulse = { x: dvx * speed, y: dvy * speed, z: dvz * speed };
              const epB = this.scriptRunner.makeEntityProxyPublic(b.name);
              const epA = this.scriptRunner.makeEntityProxyPublic(a.name);
              if (epA) this.scriptRunner.fireCollisionStarted(a.name, epB, impulse);
              if (epB) this.scriptRunner.fireCollisionStarted(b.name, epA, { x: -impulse.x, y: -impulse.y, z: -impulse.z });
            }
          }
        }
      }

      // Fire collisionEnded for pairs that stopped overlapping
      for (const pairKey of this.collisionPairs) {
        if (!nowColliding.has(pairKey)) {
          const parts = pairKey.split(":");
          if (pairKey.startsWith("p:")) {
            const objId = parts[2];
            const obj = this.allObjs.get(objId);
            if (obj) this.scriptRunner.fireCollisionEnded(obj.name, null);
          } else {
            const aName = this.allObjs.get(parts[1])?.name;
            const bName = this.allObjs.get(parts[2])?.name;
            if (aName && bName) {
              const epB = this.scriptRunner.makeEntityProxyPublic(bName);
              const epA = this.scriptRunner.makeEntityProxyPublic(aName);
              if (epA) this.scriptRunner.fireCollisionEnded(aName, epB);
              if (epB) this.scriptRunner.fireCollisionEnded(bName, epA);
            }
          }
        }
      }
      this.collisionPairs = nowColliding;
    }

    // ── Step 10b: Drain destroyed objects ────────────────────────────────────
    if (this.scriptRunner) {
      const destroyed = this.scriptRunner.drainDestroyQueue();
      for (const name of destroyed) {
        // Remove from allObjs/dynamics/statics
        for (const [id, obj] of this.allObjs) {
          if (obj.name === name) { this.allObjs.delete(id); this.dynamics.delete(id); break; }
        }
        this.statics = this.statics.filter(s => s.name !== name);
        this.scriptObjs.delete(name);
      }
    }

    // ── Step 10c: Drain network messages from scripts ────────────────────────
    if (this.scriptRunner) {
      for (const msg of this.scriptRunner.drainNetworkMessages()) {
        this.broadcastFn({ type: "networkMessage", event: msg.event, payload: msg.payload });
      }
      if (this.sendToPlayerFn) {
        for (const msg of this.scriptRunner.drainNetworkToPlayer()) {
          this.sendToPlayerFn(msg.playerId, { type: "networkMessage", event: msg.event, payload: msg.payload });
        }
      }
    }

    // ── Step 11: Player animations ────────────────────────────────────────────
    for (const p of this.players.values()) {
      const hspd = Math.sqrt(p.vx*p.vx + p.vz*p.vz);
      if (!p.onGround) {
        p.animation = p.vy > 1 ? "jump" : "fall";
      } else if (hspd > p.speed * 0.8) {
        p.animation = "run";
      } else if (hspd > 0.5) {
        p.animation = "walk";
      } else {
        p.animation = "idle";
      }
    }

    this.tickNumber++;
    if (this.players.size === 0) return;

    // ── Step 11: Broadcast worldState (per-player for GUI, shared for world) ──
    const renderObjects  = Array.from(this.allObjs.values()).map(this._toRenderObj);
    const renderPlayers  = Array.from(this.players.values()).map(this._toRenderPlayer);
    const broadcastTime  = Date.now();
    const tick           = this.tickNumber;

    const toRenderGui = (g: any) => ({
      id: g.id, kind: g.kind, text: g.text, x: g.x, y: g.y,
      width: g.width, height: g.height, anchor: g.anchor ?? "topLeft",
      color: g.color ?? "#ffffff", fontSize: g.fontSize ?? 14,
      backgroundColor: g.backgroundColor, imageUrl: g.imageUrl,
      value: g.value, maxValue: g.maxValue,
      visible: g.visible !== false, clickable: g.clickable,
    });

    const camSettings = this.scriptRunner?.getCameraSettings() ?? {};
    const cameraState = Object.keys(camSettings).length > 0 ? {
      mode: camSettings.mode ?? "thirdPerson",
      position: camSettings.position,
      lookAt: camSettings.lookAt,
      fov: camSettings.fov,
      distance: camSettings.distance,
    } : undefined;

    if (this.sendToPlayerFn) {
      // Per-player worldState: each player gets global gui + their own gui
      for (const p of this.players.values()) {
        const playerGui = this.scriptRunner?.getGuiElementsForPlayer(p.id) ?? this.scriptRunner?.getGuiElements() ?? [];
        const state: RenderState = {
          tick, serverTime: broadcastTime,
          objects: renderObjects,
          players: renderPlayers,
          gui: playerGui.map(toRenderGui),
          localPlayerId: p.id,
          camera: cameraState,
        };
        this.sendToPlayerFn(p.id, { type: "worldState", state });
      }
    } else {
      // Fallback: broadcast same state to all (no per-player GUI)
      const guiElements = this.scriptRunner?.getGuiElements() ?? [];
      const state: RenderState = {
        tick, serverTime: broadcastTime,
        objects: renderObjects,
        players: renderPlayers,
        gui: guiElements.map(toRenderGui),
        localPlayerId: null,
        camera: cameraState,
      };
      this.broadcastFn({ type: "worldState", state });
    }
  }

  // ── Player death/respawn ──────────────────────────────────────────────────────

  private _handlePlayerDeath(p: PlayerState) {
    this.scriptRunner?.firePlayerDied(this._makeScriptPlayer(p));
    this._respawnPlayer(p);
    p.health = p.maxHealth;
    this.scriptRunner?.firePlayerSpawned(this._makeScriptPlayer(p));
  }

  private _respawnPlayer(p: PlayerState) {
    p.x = p.spawnX; p.y = p.spawnY; p.z = p.spawnZ;
    p.vx = 0; p.vy = 0; p.vz = 0;
  }

  // ── AABB helpers ──────────────────────────────────────────────────────────────

  private _pushPlayerOutOfStatics(p: PlayerState) {
    for (const b of this.statics) {
      const ox = Math.min(p.x+PLAYER_RADIUS, b.maxX) - Math.max(p.x-PLAYER_RADIUS, b.minX);
      const oy = Math.min(p.y+PLAYER_HALF_H, b.maxY) - Math.max(p.y-PLAYER_HALF_H, b.minY);
      const oz = Math.min(p.z+PLAYER_RADIUS, b.maxZ) - Math.max(p.z-PLAYER_RADIUS, b.minZ);
      if (ox>0 && oy>0 && oz>0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (p.y > (b.minY+b.maxY)/2) { p.y += oy; if (p.vy < 0) { p.vy = 0; p.onGround = true; } }
          else { p.y -= oy; if (p.vy > 0) p.vy = 0; }
        } else if (min === ox) {
          if (p.x > (b.minX+b.maxX)/2) p.x += ox; else p.x -= ox; p.vx = 0;
        } else {
          if (p.z > (b.minZ+b.maxZ)/2) p.z += oz; else p.z -= oz; p.vz = 0;
        }
      }
    }
  }

  private _pushObjOutOfStatics(obj: DynamicObj) {
    const hx=obj.sx/2, hy=obj.sy/2, hz=obj.sz/2;
    for (const b of this.statics) {
      const ox = Math.min(obj.x+hx, b.maxX) - Math.max(obj.x-hx, b.minX);
      const oy = Math.min(obj.y+hy, b.maxY) - Math.max(obj.y-hy, b.minY);
      const oz = Math.min(obj.z+hz, b.maxZ) - Math.max(obj.z-hz, b.minZ);
      if (ox>0 && oy>0 && oz>0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (obj.y > (b.minY+b.maxY)/2) { obj.y += oy; obj.vy = Math.abs(obj.vy)*OBJ_BOUNCE; }
          else { obj.y -= oy; obj.vy = -Math.abs(obj.vy)*OBJ_BOUNCE; }
        } else if (min === ox) {
          if (obj.x > (b.minX+b.maxX)/2) obj.x += ox; else obj.x -= ox;
          obj.vx = -obj.vx * OBJ_BOUNCE;
        } else {
          if (obj.z > (b.minZ+b.maxZ)/2) obj.z += oz; else obj.z -= oz;
          obj.vz = -obj.vz * OBJ_BOUNCE;
        }
      }
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  private _toRenderObj = (o: DynamicObj): RenderObject => ({
    id: o.id, name: o.name, type: o.type, primitiveType: o.primitiveType,
    position: { x: o.x, y: o.y, z: o.z },
    rotation: { x: o.rotX, y: o.rotY, z: o.rotZ },
    scale: { x: o.sx, y: o.sy, z: o.sz },
    color: o.color, visible: o.visible, transparency: o.transparency ?? 0,
    modelUrl: o.modelUrl, modelScale: o.modelScale, audioUrl: o.audioUrl,
    animation: o.animation, animationSpeed: o.animationSpeed, animationLoop: o.animationLoop,
  });

  private _toRenderPlayer = (p: PlayerState): RenderPlayer => ({
    id: p.id, name: p.name,
    position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
    rotation: { x: 0, y: p.rotY, z: 0 },
    velocity: { x: p.vx, y: p.vy, z: p.vz },
    onGround: p.onGround, animation: p.animation,
    health: p.health, maxHealth: p.maxHealth,
    colors: { shirt: p.shirtColor, skin: p.skinColor, pants: p.pantsColor },
    motors: {},
  });

  private _makeScriptPlayer(p: PlayerState): ScriptPlayerState {
    return {
      id: p.id, name: p.name,
      position: { x: p.x, y: p.y, z: p.z },
      health: p.health, maxHealth: p.maxHealth,
      speed: p.speed, runSpeed: p.speed * 1.6, jumpPower: p.jumpPower,
      onGround: p.onGround,
      shirtColor: p.shirtColor, skinColor: p.skinColor, pantsColor: p.pantsColor,
      spawnX: p.spawnX, spawnY: p.spawnY - PLAYER_HALF_H, spawnZ: p.spawnZ,
    };
  }

  get playerCount() { return this.players.size; }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  getSnapshot(localPlayerId: string): RenderState {
    const guiElements = this.scriptRunner?.getGuiElementsForPlayer(localPlayerId) ?? this.scriptRunner?.getGuiElements() ?? [];
    return {
      tick: this.tickNumber, serverTime: Date.now(),
      objects: Array.from(this.allObjs.values()).map(this._toRenderObj),
      players: Array.from(this.players.values()).map(this._toRenderPlayer),
      gui: guiElements.map((g) => ({
        id: g.id, kind: g.kind, text: g.text, x: g.x, y: g.y,
        width: g.width, height: g.height, anchor: g.anchor ?? "topLeft",
        color: g.color ?? "#ffffff", fontSize: g.fontSize ?? 14,
        backgroundColor: g.backgroundColor, imageUrl: g.imageUrl,
        value: g.value, maxValue: g.maxValue,
        visible: g.visible !== false, clickable: g.clickable,
      })),
      localPlayerId,
    };
  }
}
