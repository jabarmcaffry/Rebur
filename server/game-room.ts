/**
 * game-room.ts — Server-authoritative game room
 *
 * Tick pipeline (correct order):
 *  1. Run script tick — scripts see last frame's physics state, write new values
 *  2. Apply script changes (scriptObjs → allObjs)
 *  3. Player physics
 *  4. Dynamic object physics (uses positions already updated by scripts)
 *  5. Sync physics results → scriptObjs (so next frame's scripts see current physics)
 *  6. Detect player↔object touches → fire scriptRunner.fireTouched()
 *  7. Broadcast authoritative worldState (players + objects)
 */

import { ScriptRunner, type ScriptObjState, type ScriptPlayerState, type GuiElement } from "./script-runner";
import type { RenderState, RenderObject, RenderPlayer, RenderGuiElement } from "@shared/render-types";

// ── Constants ─────────────────────────────────────────────────────────────────
const TICK_MS       = 50;    // 20 Hz
const GRAVITY       = -28;
const MOVE_SPEED    = 14;
const JUMP_VEL      = 14;
const PLAYER_HALF_H = 0.9;
const PLAYER_RADIUS = 0.4;
const OBJ_BOUNCE    = 0.25;
const OBJ_DRAG      = 0.88;  // per-second linear damping
const KILL_Y        = -50;   // fall below this → respawn

// ── Interfaces ────────────────────────────────────────────────────────────────
interface PlayerState {
  id: string; name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number; onGround: boolean;
  moveX: number; moveZ: number; jumpQueued: boolean; camY: number;
  spawnX: number; spawnY: number; spawnZ: number;
  shirtColor?: string; skinColor?: string; pantsColor?: string;
  health: number; maxHealth: number;
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
}

// ── GameRoom ──────────────────────────────────────────────────────────────────
export class GameRoom {
  private players    = new Map<string, PlayerState>();
  private statics: StaticBox[] = [];
  private dynamics   = new Map<string, DynamicObj>();  // unanchored
  private allObjs    = new Map<string, DynamicObj>();  // every workspace object
  private scriptObjs = new Map<string, ScriptObjState>(); // shared w/ ScriptRunner
  private scriptRunner: ScriptRunner | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick   = Date.now();
  /** Tracks which (player,object) pairs are currently touching to avoid repeat fires */
  private touchedPairs = new Set<string>();
  /** Current tick number for client interpolation */
  private tickNumber = 0;
  /** Spawn position extracted from the SpawnLocation object in the scene */
  private spawnPoint = { x: 0, y: 1.5, z: 0 };

  constructor(private readonly broadcastFn: (msg: object) => void) {}

  /** Returns the current spawn position (above the SpawnLocation surface). */
  getSpawnPoint(): { x: number; y: number; z: number } {
    return { ...this.spawnPoint };
  }

  /** Returns a full RenderPlayer record for a player already added via addPlayer().
   *  Used by the routes layer to broadcast proper data in `playerJoined` messages. */
  getPlayerRender(id: string): object | null {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
      rotation: { x: 0, y: p.rotY, z: 0 },
      velocity: { x: p.vx, y: p.vy, z: p.vz },
      onGround: p.onGround,
      animation: p.animation,
      health: p.health,
      maxHealth: p.maxHealth,
      colors: {
        shirt: p.shirtColor ?? "#3b82f6",
        skin: p.skinColor ?? "#d4a574",
        pants: p.pantsColor ?? "#374151",
      },
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

    // Detect SpawnLocation so addPlayer can place new players correctly
    const spawnObj = objects.find(
      (o: any) => o.type === "spawn" || o.name === "SpawnLocation"
    );
    if (spawnObj) {
      const sy = spawnObj.scaleY ?? 1;
      this.spawnPoint = {
        x: spawnObj.positionX ?? 0,
        // Spawn just above the top surface of the pad (0.05 clearance).
        y: (spawnObj.positionY ?? 0) + sy / 2 + PLAYER_HALF_H + 0.05,
        z: spawnObj.positionZ ?? 0,
      };
    }

    for (const o of objects) {
      const c = o.container ?? "Workspace";
      // "Scene" is the user-facing name; "Workspace" is the internal DB value
      if (c !== "Workspace" && c !== "Scene" && c !== "") continue;
      if (o.type === "light" || o.type === "folder") continue;

      const anchored = o.properties?.anchored !== false;
      const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, sz = o.scaleZ ?? 1;
      const px = o.positionX ?? 0, py = o.positionY ?? 0, pz = o.positionZ ?? 0;

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
      };
      this.allObjs.set(o.id, dobj);

      this.scriptObjs.set(o.name ?? o.id, {
        id: o.id, name: o.name ?? "Part",
        positionX: px, positionY: py, positionZ: pz,
        rotationX: o.rotationX ?? 0, rotationY: o.rotationY ?? 0, rotationZ: o.rotationZ ?? 0,
        scaleX: sx, scaleY: sy, scaleZ: sz,
        color: dobj.color, visible: true, anchored,
        velX: 0, velY: 0, velZ: 0,
        transparency: o.properties?.transparency ?? 0,
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
      playerMap.set(p.id, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
    }
    this.scriptRunner = new ScriptRunner(this.scriptObjs, playerMap);
    for (const s of scripts) {
      if (s.enabled && s.code?.trim()) {
        this.scriptRunner.loadScript(s.code, s.name);
      }
    }
  }

  // ── Players ─────────────────────────────────────────────────────────────────

  addPlayer(id: string, name: string, x = 0, y = 5, z = 0, colors?: Record<string, string>) {
    this.players.set(id, {
      id, name, x, y, z,
      vx: 0, vy: 0, vz: 0,
      rotY: 0, onGround: false,
      moveX: 0, moveZ: 0, jumpQueued: false, camY: 0,
      spawnX: x, spawnY: y, spawnZ: z,
      health: 100, maxHealth: 100,
      animation: "idle",
      ...colors,
    });
    this.scriptRunner?.firePlayerAdded({ id, name, position: { x, y, z } });
    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (p) this.scriptRunner?.firePlayerRemoving({ id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
    this.players.delete(id);
    // Clean up touch pairs for this player
    for (const key of this.touchedPairs) {
      if (key.startsWith(id + ":")) this.touchedPairs.delete(key);
    }
    if (this.players.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  applyInput(id: string, moveX: number, moveZ: number, jump: boolean, rotY: number, camY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.moveX = moveX; p.moveZ = moveZ;
    if (jump) p.jumpQueued = true;
    p.rotY = rotY; p.camY = camY;
  }

  syncPosition(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x; p.y = y; p.z = z; p.rotY = rotY;
  }

  // ── Main tick ─────────────────────────────────────────────────────────────────

  private _tick() {
    const now = Date.now();
    const dt  = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;

    // ── Step 1: Run script tick ───────────────────────────────────────────────
    // Scripts write to scriptObjs via proxies; they see physics state from end
    // of the PREVIOUS frame (since step 5 synced physics → scriptObjs last tick).
    if (this.scriptRunner) {
      this.scriptRunner.tick(dt);
      const logs = this.scriptRunner.drainLogs();
      if (logs.length > 0) this.broadcastFn({ type: "scriptLog", logs });
    }

    // ── Step 2: Apply script changes → allObjs ────────────────────────────────
    if (this.scriptRunner) {
      for (const [name, so] of this.scriptObjs) {
        for (const obj of this.allObjs.values()) {
          if (obj.name !== name) continue;
          obj.x     = so.positionX; obj.y     = so.positionY; obj.z     = so.positionZ;
          obj.rotX  = so.rotationX; obj.rotY  = so.rotationY; obj.rotZ  = so.rotationZ;
          obj.color = so.color;     obj.visible = so.visible;
          obj.transparency = so.transparency ?? obj.transparency;
          // Allow scripts to directly set velocity on dynamic objects
          if (!obj.anchored) {
            obj.vx = so.velX; obj.vy = so.velY; obj.vz = so.velZ;
          }
          break;
        }
      }
    }

    // ── Step 3: Player physics ────────────────────────────────────────────────
    for (const p of this.players.values()) {
      p.vy += GRAVITY * dt;

      // camY = atan2(fwd.x, fwd.z) where fwd is the camera world direction.
      // Camera forward XZ unit: (sin(camY), cos(camY)).
      // Camera right XZ unit: (-cos(camY), sin(camY)).
      // Player velocity: moveX along right, -moveZ along forward (W = moveZ=-1 = forward).
      const cos = Math.cos(p.camY), sin = Math.sin(p.camY);
      p.vx = (-p.moveX * cos - p.moveZ * sin) * MOVE_SPEED;
      p.vz = ( p.moveX * sin - p.moveZ * cos) * MOVE_SPEED;

      // Rotate character to face movement direction.
      if (Math.abs(p.vx) > 0.01 || Math.abs(p.vz) > 0.01) {
        p.rotY = Math.atan2(p.vx, p.vz);
      }

      if (p.jumpQueued && p.onGround) { p.vy = JUMP_VEL; p.onGround = false; }
      p.jumpQueued = false;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      p.onGround = false;
      // No hard floor — players only land on anchored objects.
      // Fell past kill-Y → respawn at spawn point.
      if (p.y - PLAYER_HALF_H < KILL_Y) {
        p.x = p.spawnX; p.y = p.spawnY; p.z = p.spawnZ;
        p.vx = 0; p.vy = 0; p.vz = 0;
      }

      this._pushPlayerOutOfStatics(p);
    }

    // ── Step 4: Dynamic object physics ───────────────────────────────────────
    for (const obj of this.dynamics.values()) {
      if (obj.anchored) continue;

      obj.vy += GRAVITY * dt;
      const drag = Math.pow(OBJ_DRAG, dt);
      obj.vx *= drag; obj.vz *= drag;

      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.z += obj.vz * dt;

      // No hard floor — objects only rest on anchored surfaces.
      // Despawn objects that fall past kill-Y to keep the sim clean.
      if (obj.y < KILL_Y) {
        obj.x = 0; obj.y = 5; obj.z = 0;
        obj.vx = 0; obj.vy = 0; obj.vz = 0;
      }

      this._pushObjOutOfStatics(obj);

      // Player push
      for (const p of this.players.values()) {
        const dx = obj.x - p.x, dz = obj.z - p.z, dy = obj.y - p.y;
        const distSq = dx * dx + dz * dz;
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

    // ── Step 5: Sync physics results → scriptObjs ─────────────────────────────
    for (const obj of this.allObjs.values()) {
      const so = this.scriptObjs.get(obj.name);
      if (!so) continue;
      so.positionX = obj.x; so.positionY = obj.y; so.positionZ = obj.z;
      so.rotationX = obj.rotX; so.rotationY = obj.rotY; so.rotationZ = obj.rotZ;
      so.color = obj.color;   so.visible = obj.visible;
      so.transparency = obj.transparency ?? 0;
      if (!obj.anchored) { so.velX = obj.vx; so.velY = obj.vy; so.velZ = obj.vz; }
    }

    // ── Step 6: Touched event detection ──────────────────────────────────────
    if (this.scriptRunner) {
      const nowTouching = new Set<string>();

      for (const p of this.players.values()) {
        // Check against all workspace objects
        for (const obj of this.allObjs.values()) {
          const hx = obj.sx / 2, hy = obj.sy / 2, hz = obj.sz / 2;
          const ox = Math.min(p.x + PLAYER_RADIUS, obj.x + hx) - Math.max(p.x - PLAYER_RADIUS, obj.x - hx);
          const oy = Math.min(p.y + PLAYER_HALF_H, obj.y + hy) - Math.max(p.y - PLAYER_HALF_H, obj.y - hy);
          const oz = Math.min(p.z + PLAYER_RADIUS, obj.z + hz) - Math.max(p.z - PLAYER_RADIUS, obj.z - hz);

          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `${p.id}:${obj.id}`;
            nowTouching.add(pairKey);
            // Fire Touched only on the leading edge (first contact)
            if (!this.touchedPairs.has(pairKey)) {
              this.scriptRunner.fireTouched(obj.name, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
            }
          }
        }

        // Also check static objects
        for (const b of this.statics) {
          const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
          const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
          const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `${p.id}:static:${b.name}`;
            nowTouching.add(pairKey);
            if (!this.touchedPairs.has(pairKey)) {
              this.scriptRunner.fireTouched(b.name, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
            }
          }
        }
      }

      this.touchedPairs = nowTouching;
    }

    // ── Step 7: Broadcast worldState ──────────────────────────────────────────
    // Update player animations based on movement
    for (const p of this.players.values()) {
      const moving = Math.abs(p.vx) > 0.5 || Math.abs(p.vz) > 0.5;
      if (!p.onGround) {
        p.animation = p.vy > 2 ? "jump" : "fall";
      } else if (moving) {
        p.animation = "run";
      } else {
        p.animation = "idle";
      }
    }

    this.tickNumber++;

    if (this.players.size > 0) {
      // Get GUI state from script runner
      const guiElements = this.scriptRunner?.getGuiElements() ?? [];

      // Build full RenderState for the new protocol
      const renderPlayers: RenderPlayer[] = Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        // p.y is capsule centre; subtract half-height so the client receives
        // the feet/anchor position that Avatar.tsx expects.
        position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
        rotation: { x: 0, y: p.rotY, z: 0 },
        velocity: { x: p.vx, y: p.vy, z: p.vz },
        onGround: p.onGround,
        animation: p.animation,
        health: p.health,
        maxHealth: p.maxHealth,
        colors: {
          shirt: p.shirtColor ?? "#3b82f6",
          skin: p.skinColor ?? "#d4a574",
          pants: p.pantsColor ?? "#374151",
        },
        motors: {},
      }));

      const renderObjects: RenderObject[] = Array.from(this.allObjs.values()).map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        primitiveType: o.primitiveType,
        position: { x: o.x, y: o.y, z: o.z },
        rotation: { x: o.rotX, y: o.rotY, z: o.rotZ },
        scale: { x: o.sx, y: o.sy, z: o.sz },
        color: o.color,
        visible: o.visible,
        transparency: o.transparency ?? 0,
        modelUrl: o.modelUrl,
        modelScale: o.modelScale,
        animation: o.animation,
        animationSpeed: o.animationSpeed,
        animationLoop: o.animationLoop,
      }));

      const renderGui: RenderGuiElement[] = guiElements.map((g) => ({
        id: g.id,
        kind: g.kind,
        text: g.text,
        x: g.x,
        y: g.y,
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
      }));

      const state: RenderState = {
        tick: this.tickNumber,
        serverTime: Date.now(),
        objects: renderObjects,
        players: renderPlayers,
        gui: renderGui,
        localPlayerId: null, // Set per-client when sending
      };

      this.broadcastFn({
        type: "worldState",
        state,
        players: renderPlayers.map((p) => ({
          id: p.id, name: p.name,
          position: p.position,
          rotY: p.rotation.y, onGround: p.onGround,
          shirtColor: p.colors.shirt, skinColor: p.colors.skin, pantsColor: p.colors.pants,
        })),
        objects: Array.from(this.allObjs.values()).map((o) => ({
          id: o.id,
          x: o.x, y: o.y, z: o.z,
          rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ,
          color: o.color, visible: o.visible,
        })),
      });
    }
  }

  // ── AABB helpers ─────────────────────────────────────────────────────────────

  private _pushPlayerOutOfStatics(p: PlayerState) {
    for (const b of this.statics) {
      const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
      const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
      const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (p.y > (b.minY + b.maxY) / 2) { p.y += oy; if (p.vy < 0) { p.vy = 0; p.onGround = true; } }
          else { p.y -= oy; if (p.vy > 0) p.vy = 0; }
        } else if (min === ox) {
          if (p.x > (b.minX + b.maxX) / 2) p.x += ox; else p.x -= ox; p.vx = 0;
        } else {
          if (p.z > (b.minZ + b.maxZ) / 2) p.z += oz; else p.z -= oz; p.vz = 0;
        }
      }
    }
  }

  private _pushObjOutOfStatics(obj: DynamicObj) {
    const hx = obj.sx/2, hy = obj.sy/2, hz = obj.sz/2;
    for (const b of this.statics) {
      const ox = Math.min(obj.x + hx, b.maxX) - Math.max(obj.x - hx, b.minX);
      const oy = Math.min(obj.y + hy, b.maxY) - Math.max(obj.y - hy, b.minY);
      const oz = Math.min(obj.z + hz, b.maxZ) - Math.max(obj.z - hz, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (obj.y > (b.minY + b.maxY) / 2) { obj.y += oy; obj.vy = Math.abs(obj.vy) * OBJ_BOUNCE; }
          else { obj.y -= oy; obj.vy = -Math.abs(obj.vy) * OBJ_BOUNCE; }
        } else if (min === ox) {
          if (obj.x > (b.minX + b.maxX) / 2) obj.x += ox; else obj.x -= ox;
          obj.vx = -obj.vx * OBJ_BOUNCE;
        } else {
          if (obj.z > (b.minZ + b.maxZ) / 2) obj.z += oz; else obj.z -= oz;
          obj.vz = -obj.vz * OBJ_BOUNCE;
        }
      }
    }
  }

  get playerCount() { return this.players.size; }

  /** Handle a GUI click from a client */
  handleGuiClick(playerId: string, elementId: string) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    this.scriptRunner.fireGuiClick(elementId, {
      id: player.id,
      name: player.name,
      position: { x: player.x, y: player.y, z: player.z },
    });
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  /** Return the current world state for a specific player (used in the init handshake). */
  getSnapshot(localPlayerId: string): RenderState {
    const renderPlayers: RenderPlayer[] = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      position: { x: p.x, y: p.y - PLAYER_HALF_H, z: p.z },
      rotation: { x: 0, y: p.rotY, z: 0 },
      velocity: { x: p.vx, y: p.vy, z: p.vz },
      onGround: p.onGround,
      animation: p.animation,
      health: p.health,
      maxHealth: p.maxHealth,
      colors: {
        shirt: p.shirtColor ?? "#3b82f6",
        skin: p.skinColor ?? "#d4a574",
        pants: p.pantsColor ?? "#374151",
      },
      motors: {},
    }));

    const renderObjects: RenderObject[] = Array.from(this.allObjs.values()).map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      primitiveType: o.primitiveType,
      position: { x: o.x, y: o.y, z: o.z },
      rotation: { x: o.rotX, y: o.rotY, z: o.rotZ },
      scale: { x: o.sx, y: o.sy, z: o.sz },
      color: o.color,
      visible: o.visible,
      transparency: o.transparency ?? 0,
      modelUrl: o.modelUrl,
      modelScale: o.modelScale,
      animation: o.animation,
      animationSpeed: o.animationSpeed,
      animationLoop: o.animationLoop,
    }));

    return {
      tick: this.tickNumber,
      serverTime: Date.now(),
      objects: renderObjects,
      players: renderPlayers,
      gui: [],
      localPlayerId,
    };
  }
}
