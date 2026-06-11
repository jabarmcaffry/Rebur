/**
 * game-room.ts — Server-authoritative game room (20 Hz tick)
 * Updated to support new ScriptRunner API.
 */

import { ScriptRunner, type ScriptObjState, type ScriptPlayerState } from "./script-runner";
import type { RenderState, RenderObject, RenderPlayer, RenderGuiElement, DebugDraw, ParticleEvent } from "../shared/render-types";

// ── Constants ─────────────────────────────────────────────────────────────────
const TICK_MS       = 50;    // 20 Hz
const DEFAULT_SPEED = 6;
const DEFAULT_JUMP  = 8;
const PLAYER_HALF_H = 0.9;
const KILL_Y        = -50;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PlayerState {
  id: string; name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number; onGround: boolean;
  moveX: number; moveZ: number;
  jumpQueued: boolean;
  heading: number;
  shirtColor: string; skinColor: string; pantsColor: string;
  health: number; maxHealth: number;
  speed: number; jumpPower: number;
  animation: string;
  // Camera state
  camWx: number; camWy: number; camWz: number;
  camFx: number; camFy: number; camFz: number;
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
  parentId?: string | null;
  gravity?: any;
  avX: number; avY: number; avZ: number;
  torqueX: number; torqueY: number; torqueZ: number;
  health?: number;
  maxHealth?: number;
}

// ── GameRoom ──────────────────────────────────────────────────────────────────

export class GameRoom {
  private players    = new Map<string, PlayerState>();
  private dynamics   = new Map<string, DynamicObj>();
  private allObjs    = new Map<string, DynamicObj>();
  private scriptObjs = new Map<string, ScriptObjState>();
  private scriptRunner: ScriptRunner = new ScriptRunner();
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick   = Date.now();
  private spawnPoint = { x: 0, y: 1.5, z: 0 };

  constructor(
    private readonly broadcastFn: (msg: object) => void,
    private readonly sendToPlayerFn?: (playerId: string, msg: object) => void,
  ) {}

  setObjects(objects: any[]) {
    this.allObjs.clear();
    this.scriptObjs.clear();
    this.dynamics.clear();

    for (const o of objects) {
      const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, sz = o.scaleZ ?? 1;
      const px = o.positionX ?? 0, py = o.positionY ?? 0, pz = o.positionZ ?? 0;
      const anchored = o.properties?.anchored !== false;

      const sobj: ScriptObjState = {
        id: o.id, name: o.name ?? "Part",
        container: o.container ?? "Workspace",
        type: o.type ?? "primitive",
        primitiveType: o.primitiveType ?? undefined,
        positionX: px, positionY: py, positionZ: pz,
        rotationX: o.rotationX ?? 0, rotationY: o.rotationY ?? 0, rotationZ: o.rotationZ ?? 0,
        scaleX: sx, scaleY: sy, scaleZ: sz,
        color: o.color ?? "#888888", visible: true, anchored,
        velX: 0, velY: 0, velZ: 0,
        transparency: o.properties?.transparency ?? 0,
        canCollide: o.properties?.canCollide !== false,
      };
      this.scriptObjs.set(sobj.name, sobj);

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
        avX: 0, avY: 0, avZ: 0,
        torqueX: 0, torqueY: 0, torqueZ: 0,
      };
      this.allObjs.set(o.id, dobj);
      if (!anchored) this.dynamics.set(o.id, dobj);
    }
  }

  loadScripts(scripts: { code: string; name: string; enabled: boolean }[]) {
    const objs = Array.from(this.scriptObjs.values());
    this.scriptRunner = new ScriptRunner();
    for (const s of scripts) {
      if (s.enabled && s.code) {
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
      heading: 0,
      shirtColor: colors.shirtColor ?? "#3b82f6",
      skinColor:  colors.skinColor  ?? "#d4a574",
      pantsColor: colors.pantsColor ?? "#374151",
      health: 100, maxHealth: 100,
      speed: DEFAULT_SPEED, jumpPower: DEFAULT_JUMP,
      animation: "idle",
      camWx: x, camWy: y+6, camWz: z+8,
      camFx: 0, camFy: 0, camFz: -1,
    };
    this.players.set(id, p);
    this.scriptRunner.players.set(id, this._makeScriptPlayer(p));
    this.scriptRunner._fireGlobal("playerjoined", this.scriptRunner.players.get(id));

    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }

  removePlayer(id: string) {
    const p = this.scriptRunner.players.get(id);
    if (p) this.scriptRunner._fireGlobal("playerleft", p);
    this.players.delete(id);
    this.scriptRunner.players.delete(id);
  }

  private _makeScriptPlayer(p: PlayerState): ScriptPlayerState {
    return {
      id: p.id, name: p.name,
      position: { x: p.x, y: p.y, z: p.z },
      rotation: { x: 0, y: p.rotY, z: 0 },
      heading: p.heading,
      health: p.health, maxHealth: p.maxHealth,
      speed: p.speed, jumpPower: p.jumpPower,
      shirtColor: p.shirtColor, skinColor: p.skinColor, pantsColor: p.pantsColor,
      onGround: p.onGround
    };
  }

  private _tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // 1. Script Tick
    this.scriptRunner.tick(dt);

    // 2. Sync Script Objects back to Physics
    for (const [name, sobj] of this.scriptRunner.objects) {
      const dobj = Array.from(this.allObjs.values()).find(o => o.name === name);
      if (dobj) {
        dobj.x = sobj.positionX; dobj.y = sobj.positionY; dobj.z = sobj.positionZ;
        dobj.rotX = sobj.rotationX; dobj.rotY = sobj.rotationY; dobj.rotZ = sobj.rotationZ;
        dobj.sx = sobj.scaleX; dobj.sy = sobj.scaleY; dobj.sz = sobj.scaleZ;
        dobj.color = sobj.color; dobj.visible = sobj.visible; dobj.anchored = sobj.anchored;
        dobj.vx = sobj.velX ?? 0; dobj.vy = sobj.velY ?? 0; dobj.vz = sobj.velZ ?? 0;
      }
    }

    // 3. Sync Script Players back to State
    for (const [id, sp] of this.scriptRunner.players) {
      const p = this.players.get(id);
      if (p) {
        if ((sp as any).teleport) {
          p.x = (sp as any).teleport.x; p.y = (sp as any).teleport.y; p.z = (sp as any).teleport.z;
          delete (sp as any).teleport;
        }
        p.health = sp.health; p.maxHealth = sp.maxHealth;
        p.speed = sp.speed; p.jumpPower = sp.jumpPower;
        p.heading = sp.heading ?? 0;
      }
    }

    // 4. Broadcast State
    this._broadcast();
  }

  private _broadcast() {
    const renderObjs: RenderObject[] = Array.from(this.allObjs.values()).map(o => ({
      id: o.id, name: o.name, type: o.type as any, primitiveType: o.primitiveType as any,
      positionX: o.x, positionY: o.y, positionZ: o.z,
      rotationX: o.rotX, rotationY: o.rotY, rotationZ: o.rotZ,
      scaleX: o.sx, scaleY: o.sy, scaleZ: o.sz,
      color: o.color, visible: o.visible, anchored: o.anchored,
      transparency: o.transparency
    }));

    const renderPlayers: RenderPlayer[] = Array.from(this.players.values()).map(p => ({
      id: p.id, name: p.name,
      position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
      rotation: { x: 0, y: p.rotY, z: 0 },
      heading: p.heading,
      health: p.health, maxHealth: p.maxHealth,
      speed: p.speed, jumpPower: p.jumpPower,
      shirtColor: p.shirtColor, skinColor: p.skinColor, pantsColor: p.pantsColor
    }));

    const guiElements = Array.from(this.scriptRunner.guiElements.values());

    this.broadcastFn({
      type: "worldState",
      objects: renderObjs,
      players: renderPlayers,
      gui: guiElements,
      lighting: this.scriptRunner.worldSettings
    });
  }
}
