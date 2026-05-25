/**
 * script-runner.ts — Server-side VM sandbox for game scripts
 *
 * Scripts execute exclusively on the server so they are never exposed in the
 * browser. The runner provides a Roblox-flavored API:
 *   workspace.PartName.Position = {X,Y,Z}
 *   workspace.PartName.Color = "#ff0000"
 *   game.on("tick", fn)          — called every physics tick
 *   game.on("playerAdded", fn)   — called when a player joins
 *   log(...) / print(...)        — captured, safe to forward to console
 */

import { createContext, Script } from "vm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptObjState {
  id: string;
  name: string;
  positionX: number; positionY: number; positionZ: number;
  rotationX: number; rotationY: number; rotationZ: number;
  scaleX: number;    scaleY: number;    scaleZ: number;
  color: string;
  visible: boolean;
  anchored: boolean;
  velX: number;      velY: number;      velZ: number;
}

export interface ScriptPlayerState {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
}

type EventHandler = (...args: any[]) => void;

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  private handlers = new Map<string, EventHandler[]>();
  private logs: string[] = [];

  constructor(
    private readonly objects: Map<string, ScriptObjState>,   // keyed by name
    private readonly players: Map<string, ScriptPlayerState> // keyed by id
  ) {}

  /** Compile and execute a single script file inside a fresh VM context. */
  loadScript(code: string, fileName = "Script") {
    const log = (...args: any[]) => {
      const msg = args.map((a) => {
        try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(" ");
      this.logs.push(`[${fileName}] ${msg}`);
    };

    const workspaceProxy = this._buildWorkspace();
    const playersProxy   = this._buildPlayers();

    const ctx = createContext({
      workspace: workspaceProxy,
      Workspace: workspaceProxy,
      players:   playersProxy,
      game: {
        on: (event: string, fn: EventHandler) => {
          const arr = this.handlers.get(event) ?? [];
          arr.push(fn);
          this.handlers.set(event, arr);
        },
      },
      log,
      print: log,
      warn:  log,
      error: log,
      // safe stdlib subset
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite,
      Vector3: (x = 0, y = 0, z = 0) => ({ X: x, Y: y, Z: z, x, y, z }),
      Color3:  (r = 0, g = 0, b = 0) => `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
      // block dangerous globals
      process: undefined, require: undefined, fetch: undefined,
      setTimeout: undefined, setInterval: undefined,
      __filename: undefined, __dirname: undefined,
    });

    try {
      new Script(code, { filename: fileName }).runInContext(ctx, { timeout: 2000 });
    } catch (err: any) {
      log(`Runtime error: ${err?.message ?? err}`);
    }
  }

  /** Fire the "tick" event every physics step. */
  tick(dt: number) {
    this._fire("tick", dt);
  }

  /** Fire "playerAdded" when a new player joins. */
  firePlayerAdded(player: ScriptPlayerState) {
    this._fire("playerAdded", this._playerProxy(player));
  }

  /** Fire "playerRemoving" when a player leaves. */
  firePlayerRemoving(player: ScriptPlayerState) {
    this._fire("playerRemoving", this._playerProxy(player));
  }

  /** Drain and return buffered log lines. */
  drainLogs(): string[] {
    const l = [...this.logs];
    this.logs = [];
    return l;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _fire(event: string, ...args: any[]) {
    for (const h of this.handlers.get(event) ?? []) {
      try { h(...args); } catch { /* isolate script errors */ }
    }
  }

  private _buildWorkspace(): Record<string, any> {
    const proxy: Record<string, any> = {};
    for (const [name, obj] of this.objects) {
      proxy[name] = this._objProxy(obj);
    }
    return proxy;
  }

  private _buildPlayers(): Record<string, any> {
    const proxy: Record<string, any> = {};
    for (const [, p] of this.players) {
      proxy[p.name] = this._playerProxy(p);
    }
    return proxy;
  }

  private _objProxy(obj: ScriptObjState): any {
    return {
      get Name()     { return obj.name; },
      get Position() { return { X: obj.positionX, Y: obj.positionY, Z: obj.positionZ, x: obj.positionX, y: obj.positionY, z: obj.positionZ }; },
      set Position(v: any) {
        obj.positionX = +(v?.X ?? v?.x ?? obj.positionX);
        obj.positionY = +(v?.Y ?? v?.y ?? obj.positionY);
        obj.positionZ = +(v?.Z ?? v?.z ?? obj.positionZ);
      },
      get Rotation() { return { X: obj.rotationX, Y: obj.rotationY, Z: obj.rotationZ }; },
      set Rotation(v: any) {
        obj.rotationX = +(v?.X ?? v?.x ?? obj.rotationX);
        obj.rotationY = +(v?.Y ?? v?.y ?? obj.rotationY);
        obj.rotationZ = +(v?.Z ?? v?.z ?? obj.rotationZ);
      },
      get Color()    { return obj.color; },
      set Color(v: any) { obj.color = String(v); },
      get Visible()  { return obj.visible; },
      set Visible(v: any) { obj.visible = Boolean(v); },
      get Anchored() { return obj.anchored; },
      set Anchored(v: any) { obj.anchored = Boolean(v); },
      get Velocity() { return { X: obj.velX, Y: obj.velY, Z: obj.velZ }; },
      set Velocity(v: any) {
        obj.velX = +(v?.X ?? v?.x ?? 0);
        obj.velY = +(v?.Y ?? v?.y ?? 0);
        obj.velZ = +(v?.Z ?? v?.z ?? 0);
      },
    };
  }

  private _playerProxy(p: ScriptPlayerState): any {
    return {
      get Name()     { return p.name; },
      get UserId()   { return p.id; },
      get Position() { return { X: p.position.x, Y: p.position.y, Z: p.position.z }; },
    };
  }
}
