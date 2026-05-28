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
  private tickNumber = 0;
  private spawnPoint = { x: 0, y: 1.5, z: 0 };
  private objIdCounter = 0;

  constructor(private readonly broadcastFn: (msg: object) => void) {}

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
      if (c !== "Workspace" && c !== "Scene" && c !== "") continue;
      if (o.type === "light" || o.type === "folder") continue;

      const anchored = o.properties?.anchored !== false;
      const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, sz = o.scaleZ ?? 1;
      const px = o.positionX ?? 0, py = o.positionY ?? 0, pz = o.positionZ ?? 0;

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
        modelUrl: o.properties?.fileUrl,
        modelScale: o.properties?.modelScale,
        animation: o.properties?.animation ?? null,
        animationSpeed: o.properties?.animationSpeed ?? 1,
        animationLoop: o.properties?.animationLoop !== false,
        gravityEnabled: !!gravProp,
        gravityStrength: gravProp?.strength ?? 20,
        gravityRadius: gravProp?.radius ?? 20,
      };
      this.allObjs.set(o.id, dobj);
      this.scriptObjs.set(o.name ?? o.id, {
        id: o.id, name: o.name ?? "Part",
        positionX: px, positionY: py, positionZ: pz,
        rotationX: dobj.rotX, rotationY: dobj.rotY, rotationZ: dobj.rotZ,
        scaleX: sx, scaleY: sy, scaleZ: sz,
        color: dobj.color, visible: true, anchored,
        velX: 0, velY: 0, velZ: 0,
        transparency: dobj.transparency,
        canCollide: o.properties?.canCollide !== false,
      });

      if (anchored) {
        this.statics.push({
          name: dobj.name,
          minX: px - sx/2, maxX: px + sx/2,
          minY: py - sy/2, maxY: py + sy/2,
          minZ: pz - sz/2, maxZ: pz + sz/2,
        });
      } else {
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
    }
    this.players.delete(id);
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

  /** Fire obj.on("clicked") when a client clicks a 3D object. */
  handleObjectClick(playerId: string, objId: string | null) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    if (!objId) return;
    const obj = this.allObjs.get(objId);
    if (obj) this.scriptRunner.fireObjClicked(obj.name, this._makeScriptPlayer(player));
  }

  /** Forward a GUI button click to scripts. */
  handleGuiClick(playerId: string, elementId: string) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    this.scriptRunner.fireGuiClick(elementId, this._makeScriptPlayer(player));
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
        if (mut.jumpPower !== undefined) p.jumpPower = Math.max(0, mut.jumpPower);
        if (mut.shirtColor !== undefined) p.shirtColor = mut.shirtColor;
        if (mut.skinColor  !== undefined) p.skinColor  = mut.skinColor;
        if (mut.pantsColor !== undefined) p.pantsColor = mut.pantsColor;
        if (mut.teleport)  { p.x = mut.teleport.x; p.y = mut.teleport.y + PLAYER_HALF_H; p.z = mut.teleport.z; p.vx=0;p.vy=0;p.vz=0; }
        if (mut.respawn)   { this._respawnPlayer(p); }
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

    // ── Step 11: Broadcast worldState ─────────────────────────────────────────
    const guiElements = this.scriptRunner?.getGuiElements() ?? [];

    const state: RenderState = {
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
      localPlayerId: null,
    };

    this.broadcastFn({ type: "worldState", state });
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
    modelUrl: o.modelUrl, modelScale: o.modelScale,
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
      speed: p.speed, jumpPower: p.jumpPower,
      shirtColor: p.shirtColor, skinColor: p.skinColor, pantsColor: p.pantsColor,
    };
  }

  get playerCount() { return this.players.size; }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  getSnapshot(localPlayerId: string): RenderState {
    const guiElements = this.scriptRunner?.getGuiElements() ?? [];
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
