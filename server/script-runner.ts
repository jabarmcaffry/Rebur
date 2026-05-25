/**
 * script-runner.ts — Server-side VM sandbox for game scripts
 *
 * Scripts run exclusively on the server. The runner provides a Roblox-flavored
 * API that is fully sandboxed via Node.js `vm`:
 *
 *   workspace.PartName.Position = {X, Y, Z}
 *   workspace.PartName.Color    = "#ff0000"
 *   workspace.PartName.Velocity = {X, Y, Z}
 *   workspace.PartName.on("Touched", fn)   // player walked into this object
 *   workspace.PartName.on("Custom", fn)    // custom emitted events
 *   workspace.PartName.emit("Custom", ...) // fire a custom event
 *   game.on("tick",          fn)           // called every physics tick with dt
 *   game.on("playerAdded",   fn)           // fired when a player joins
 *   game.on("playerRemoving",fn)           // fired when a player leaves
 *   log(...) / print(...)                  // captured, forwarded to HUD console
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

export interface GuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar";
  text?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  anchor?: string;
  color?: string;
  fontSize?: number;
  backgroundColor?: string;
  imageUrl?: string;
  value?: number;
  maxValue?: number;
  visible?: boolean;
  clickable?: boolean;
}

type EventHandler = (...args: any[]) => void;

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  /** Global game events: "tick", "playerAdded", "playerRemoving" */
  private globalHandlers = new Map<string, EventHandler[]>();
  /** Per-object events keyed as "objName::eventName" */
  private objHandlers = new Map<string, EventHandler[]>();
  /** GUI click handlers keyed by element id */
  private guiClickHandlers = new Map<string, EventHandler>();
  private logs: string[] = [];
  /** GUI elements created by scripts */
  private guiElements = new Map<string, GuiElement>();
  private guiIdCounter = 0;

  constructor(
    private readonly objects: Map<string, ScriptObjState>,   // keyed by name
    private readonly players: Map<string, ScriptPlayerState> // keyed by id
  ) {}

  // ── Script loading ──────────────────────────────────────────────────────────

  /** Compile and execute a script file inside a fresh VM context. */
  loadScript(code: string, fileName = "Script") {
    const log = (...args: any[]) => {
      const msg = args.map((a) => {
        try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(" ");
      this.logs.push(`[${fileName}] ${msg}`);
    };

    const workspaceProxy = this._buildWorkspace(log);
    const playersProxy   = this._buildPlayers();

    const ctx = createContext({
      workspace: workspaceProxy,
      Workspace: workspaceProxy,
      players:   playersProxy,
      game: {
        on: (event: string, fn: EventHandler) => {
          const key = event.toLowerCase();
          const arr = this.globalHandlers.get(key) ?? [];
          arr.push(fn);
          this.globalHandlers.set(key, arr);
        },
      },
      // GUI API for creating UI elements from scripts
      gui: {
        text: (text: string, x: number, y: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem: GuiElement = {
            id,
            kind: "text",
            text,
            x,
            y,
            color: opts?.color ?? "#ffffff",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts,
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes: Partial<GuiElement>) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => { this.guiElements.delete(id); },
          };
        },
        button: (text: string, x: number, y: number, onClick: EventHandler, opts?: Partial<GuiElement>) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem: GuiElement = {
            id,
            kind: "button",
            text,
            x,
            y,
            width: opts?.width ?? 100,
            height: opts?.height ?? 32,
            color: opts?.color ?? "#ffffff",
            backgroundColor: opts?.backgroundColor ?? "#3b82f6",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            clickable: true,
            ...opts,
          };
          this.guiElements.set(id, elem);
          this.guiClickHandlers.set(id, onClick);
          return {
            id,
            update: (changes: Partial<GuiElement>) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => {
              this.guiElements.delete(id);
              this.guiClickHandlers.delete(id);
            },
          };
        },
        bar: (x: number, y: number, value: number, maxValue: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem: GuiElement = {
            id,
            kind: "bar",
            x,
            y,
            width: opts?.width ?? 100,
            height: opts?.height ?? 12,
            value,
            maxValue,
            color: opts?.color ?? "#22c55e",
            backgroundColor: opts?.backgroundColor ?? "#374151",
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts,
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes: Partial<GuiElement>) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            setValue: (v: number) => {
              const e = this.guiElements.get(id);
              if (e) e.value = v;
            },
            remove: () => { this.guiElements.delete(id); },
          };
        },
        image: (imageUrl: string, x: number, y: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem: GuiElement = {
            id,
            kind: "image",
            imageUrl,
            x,
            y,
            width: opts?.width ?? 64,
            height: opts?.height ?? 64,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts,
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes: Partial<GuiElement>) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => { this.guiElements.delete(id); },
          };
        },
        clear: () => {
          this.guiElements.clear();
          this.guiClickHandlers.clear();
        },
      },
      // convenience aliases matching the old client API
      runService: {
        on: (_ev: string, fn: EventHandler) => {
          // map runService.on("Heartbeat") → game.on("tick")
          const arr = this.globalHandlers.get("tick") ?? [];
          arr.push(fn);
          this.globalHandlers.set("tick", arr);
        },
      },
      log,
      print: log,
      warn: log,
      error: log,
      // safe stdlib
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite,
      Vector3: (x = 0, y = 0, z = 0) => ({ X: x, Y: y, Z: z, x, y, z }),
      Color3:  (r = 0, g = 0, b = 0) =>
        `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
      // blocked globals
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

  // ── Global event firing ─────────────────────────────────────────────────────

  tick(dt: number) {
    this._fireGlobal("tick", dt);
  }

  firePlayerAdded(player: ScriptPlayerState) {
    this._fireGlobal("playerAdded", this._playerProxy(player));
  }

  firePlayerRemoving(player: ScriptPlayerState) {
    this._fireGlobal("playerRemoving", this._playerProxy(player));
  }

  // ── Object event firing ─────────────────────────────────────────────────────

  /** Call when a player's collision box overlaps an object. */
  fireTouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "touched", this._playerProxy(player));
  }

  /** Call to fire a custom event on an object (from scripts via .emit). */
  fireObjEvent(objName: string, event: string, ...args: any[]) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }

  // ── Logs ────────────────────────────────────────────────────────────────────

  drainLogs(): string[] {
    const l = [...this.logs];
    this.logs = [];
    return l;
  }

  /** Get all GUI elements for rendering on the client */
  getGuiElements(): GuiElement[] {
    return Array.from(this.guiElements.values());
  }

  /** Fire a GUI click event (called from server when client sends guiClick) */
  fireGuiClick(elementId: string, player: ScriptPlayerState) {
    const handler = this.guiClickHandlers.get(elementId);
    if (handler) {
      try {
        handler(this._playerProxy(player));
      } catch {
        // Isolate script errors
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _fireGlobal(event: string, ...args: any[]) {
    for (const h of this.globalHandlers.get(event) ?? []) {
      try { h(...args); } catch { /* isolate */ }
    }
  }

  private _fireObj(objName: string, event: string, ...args: any[]) {
    const key = `${objName}::${event}`;
    for (const h of this.objHandlers.get(key) ?? []) {
      try { h(...args); } catch { /* isolate */ }
    }
  }

  private _buildWorkspace(log: (...a: any[]) => void): Record<string, any> {
    const proxy: Record<string, any> = {};
    for (const [name, obj] of this.objects) {
      proxy[name] = this._objProxy(obj, log);
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

  private _objProxy(obj: ScriptObjState, log: (...a: any[]) => void): any {
    const runner = this;
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

      /** Register an event listener: .on("Touched", fn) */
      on(event: string, fn: EventHandler) {
        const key = `${obj.name}::${event.toLowerCase()}`;
        const arr = runner.objHandlers.get(key) ?? [];
        arr.push(fn);
        runner.objHandlers.set(key, arr);
      },

      /** Emit a custom event on this object */
      emit(event: string, ...args: any[]) {
        runner._fireObj(obj.name, event.toLowerCase(), ...args);
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
