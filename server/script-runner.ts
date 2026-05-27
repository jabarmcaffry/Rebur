/**
 * script-runner.ts — Server-side VM sandbox for game scripts
 *
 * Scripts run exclusively on the server. The runner provides a Roblox-flavored
 * API that is fully sandboxed via Node.js `vm`:
 *
 *   scene.PartName.Position = {X, Y, Z}
 *   scene.PartName.Color    = "#ff0000"
 *   scene.PartName.Transparency = 0.5
 *   scene.PartName.Velocity = {X, Y, Z}
 *   scene.PartName.on("Touched", fn)
 *   scene.PartName.emit("Custom", ...)
 *   game.on("tick",           fn)
 *   game.on("playerAdded",    fn)
 *   game.on("playerRemoving", fn)
 *   setTimeout(fn, ms)  / setInterval(fn, ms)
 *   find("PartName")         → object proxy
 *   destroy("PartName")      → hides object
 *   task.delay(s, fn)        → schedule fn after s seconds
 *   log(...) / print(...)
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
  transparency: number;
  canCollide: boolean;
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

interface TimerEntry {
  remaining: number;
  fn: (...a: any[]) => void;
  repeat: number | null;
}

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  private globalHandlers  = new Map<string, EventHandler[]>();
  private objHandlers     = new Map<string, EventHandler[]>();
  private guiClickHandlers = new Map<string, EventHandler>();
  private logs: string[] = [];
  private guiElements     = new Map<string, GuiElement>();
  private guiIdCounter    = 0;

  // Tick-based timer system (replaces blocked setTimeout/setInterval)
  private timerQueue      = new Map<number, TimerEntry>();
  timerIdCounter          = 0;

  constructor(
    private readonly objects: Map<string, ScriptObjState>,
    private readonly players: Map<string, ScriptPlayerState>
  ) {}

  // ── Script loading ──────────────────────────────────────────────────────────

  loadScript(code: string, fileName = "Script") {
    const log = (...args: any[]) => {
      const msg = args.map((a) => {
        try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(" ");
      this.logs.push(`[${fileName}] ${msg}`);
    };

    const runner        = this;
    const workspaceProxy = this._buildWorkspace(log);
    const playersProxy  = this._buildPlayers();

    // ── Timer helpers (tick-based, safe) ───────────────────────────────────
    const _setTimeout = (fn: (...a: any[]) => void, ms: number) => {
      const id = ++runner.timerIdCounter;
      runner.timerQueue.set(id, { remaining: ms / 1000, fn, repeat: null });
      return id;
    };
    const _setInterval = (fn: (...a: any[]) => void, ms: number) => {
      const id = ++runner.timerIdCounter;
      runner.timerQueue.set(id, { remaining: Math.max(ms, 50) / 1000, fn, repeat: Math.max(ms, 50) / 1000 });
      return id;
    };
    const _clearTimeout  = (id: number) => { runner.timerQueue.delete(id); };
    const _clearInterval = (id: number) => { runner.timerQueue.delete(id); };

    // ── Vector3 class ──────────────────────────────────────────────────────
    function makeVec3(x = 0, y = 0, z = 0) {
      const v = { X: x, Y: y, Z: z, x, y, z };
      Object.defineProperty(v, 'magnitude', {
        get() { return Math.sqrt(x * x + y * y + z * z); }
      });
      return v;
    }
    const Vector3 = Object.assign(
      (x = 0, y = 0, z = 0) => makeVec3(x, y, z),
      {
        new:    (x = 0, y = 0, z = 0) => makeVec3(x, y, z),
        zero:   () => makeVec3(0, 0, 0),
        one:    () => makeVec3(1, 1, 1),
        up:     () => makeVec3(0, 1, 0),
        right:  () => makeVec3(1, 0, 0),
        forward: () => makeVec3(0, 0, -1),
      }
    );

    // ── Color3 class ───────────────────────────────────────────────────────
    const Color3 = Object.assign(
      (r = 0, g = 0, b = 0) =>
        `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
      {
        new: (r = 0, g = 0, b = 0) =>
          `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
        fromRGB: (r = 0, g = 0, b = 0) => `rgb(${r},${g},${b})`,
        fromHex: (hex: string) => hex,
      }
    );

    const ctx = createContext({
      Scene:   workspaceProxy,
      Players: playersProxy,

      game: {
        on: (event: string, fn: EventHandler) => {
          const key = event.toLowerCase();
          const arr = runner.globalHandlers.get(key) ?? [];
          arr.push(fn);
          runner.globalHandlers.set(key, arr);
        },
      },

      // ── GUI API ──────────────────────────────────────────────────────────
      gui: {
        text: (text: string, x: number, y: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${runner.guiIdCounter++}`;
          const elem: GuiElement = {
            id, kind: "text", text, x, y,
            color: opts?.color ?? "#ffffff",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true, ...opts,
          };
          runner.guiElements.set(id, elem);
          return {
            id,
            update: (c: Partial<GuiElement>) => { const e = runner.guiElements.get(id); if (e) Object.assign(e, c); },
            remove: () => { runner.guiElements.delete(id); },
          };
        },
        button: (text: string, x: number, y: number, onClick: EventHandler, opts?: Partial<GuiElement>) => {
          const id = `gui_${runner.guiIdCounter++}`;
          const elem: GuiElement = {
            id, kind: "button", text, x, y,
            width: opts?.width ?? 100, height: opts?.height ?? 32,
            color: opts?.color ?? "#ffffff",
            backgroundColor: opts?.backgroundColor ?? "#3b82f6",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true, clickable: true, ...opts,
          };
          runner.guiElements.set(id, elem);
          runner.guiClickHandlers.set(id, onClick);
          return {
            id,
            update: (c: Partial<GuiElement>) => { const e = runner.guiElements.get(id); if (e) Object.assign(e, c); },
            remove: () => { runner.guiElements.delete(id); runner.guiClickHandlers.delete(id); },
          };
        },
        bar: (x: number, y: number, value: number, maxValue: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${runner.guiIdCounter++}`;
          const elem: GuiElement = {
            id, kind: "bar", x, y,
            width: opts?.width ?? 100, height: opts?.height ?? 12,
            value, maxValue,
            color: opts?.color ?? "#22c55e",
            backgroundColor: opts?.backgroundColor ?? "#374151",
            anchor: opts?.anchor ?? "topLeft",
            visible: true, ...opts,
          };
          runner.guiElements.set(id, elem);
          return {
            id,
            update: (c: Partial<GuiElement>) => { const e = runner.guiElements.get(id); if (e) Object.assign(e, c); },
            setValue: (v: number) => { const e = runner.guiElements.get(id); if (e) e.value = v; },
            remove: () => { runner.guiElements.delete(id); },
          };
        },
        image: (imageUrl: string, x: number, y: number, opts?: Partial<GuiElement>) => {
          const id = `gui_${runner.guiIdCounter++}`;
          const elem: GuiElement = {
            id, kind: "image", imageUrl, x, y,
            width: opts?.width ?? 64, height: opts?.height ?? 64,
            anchor: opts?.anchor ?? "topLeft",
            visible: true, ...opts,
          };
          runner.guiElements.set(id, elem);
          return {
            id,
            update: (c: Partial<GuiElement>) => { const e = runner.guiElements.get(id); if (e) Object.assign(e, c); },
            remove: () => { runner.guiElements.delete(id); },
          };
        },
        clear: () => {
          runner.guiElements.clear();
          runner.guiClickHandlers.clear();
        },
      },

      // ── RunService alias ─────────────────────────────────────────────────
      runService: {
        on: (_ev: string, fn: EventHandler) => {
          const arr = runner.globalHandlers.get("tick") ?? [];
          arr.push(fn);
          runner.globalHandlers.set("tick", arr);
        },
      },

      // ── Timers (tick-based) ──────────────────────────────────────────────
      setTimeout:  _setTimeout,
      setInterval: _setInterval,
      clearTimeout:  _clearTimeout,
      clearInterval: _clearInterval,

      // ── Task helpers ─────────────────────────────────────────────────────
      wait:  (_seconds?: number) => { /* compatibility no-op; use setTimeout for deferred work */ },
      spawn: (fn: (...a: any[]) => void) => _setTimeout(fn, 0),
      task: {
        wait:  (_seconds?: number) => { /* no-op */ },
        delay: (seconds: number, fn: (...a: any[]) => void) => _setTimeout(fn, seconds * 1000),
        spawn: (fn: (...a: any[]) => void) => _setTimeout(fn, 0),
      },

      // ── Object / world helpers ───────────────────────────────────────────
      find: (name: string) => {
        const obj = runner.objects.get(name);
        return obj ? runner._objProxy(obj, log) : runner._nullObjProxy(name, log);
      },
      destroy: (name: string) => {
        const obj = runner.objects.get(name);
        if (obj) obj.visible = false;
      },

      // ── Logging ─────────────────────────────────────────────────────────
      log, print: log, warn: log, error: log,

      // ── Safe stdlib ─────────────────────────────────────────────────────
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite,
      Vector3,
      Color3,

      // ── Blocked globals (explicit undefined) ─────────────────────────────
      process: undefined, require: undefined, fetch: undefined,
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
    // Advance tick-based timers
    for (const [id, timer] of this.timerQueue) {
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        try { timer.fn(); } catch { /* isolate script errors */ }
        if (timer.repeat !== null) {
          timer.remaining = timer.repeat;
        } else {
          this.timerQueue.delete(id);
        }
      }
    }
    this._fireGlobal("tick", dt);
  }

  firePlayerAdded(player: ScriptPlayerState) {
    this._fireGlobal("playerAdded", this._playerProxy(player));
  }

  firePlayerRemoving(player: ScriptPlayerState) {
    this._fireGlobal("playerRemoving", this._playerProxy(player));
  }

  // ── Object event firing ─────────────────────────────────────────────────────

  fireTouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "touched", this._playerProxy(player));
  }

  fireObjEvent(objName: string, event: string, ...args: any[]) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }

  // ── Logs ────────────────────────────────────────────────────────────────────

  drainLogs(): string[] {
    const l = [...this.logs];
    this.logs = [];
    return l;
  }

  getGuiElements(): GuiElement[] {
    return Array.from(this.guiElements.values());
  }

  fireGuiClick(elementId: string, player: ScriptPlayerState) {
    const handler = this.guiClickHandlers.get(elementId);
    if (handler) {
      try { handler(this._playerProxy(player)); } catch { /* isolate */ }
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

  private _buildWorkspace(log: (...a: any[]) => void): any {
    const runner = this;
    return new Proxy({} as Record<string, any>, {
      get(_target, name: string | symbol) {
        if (typeof name !== "string") return undefined;
        const obj = runner.objects.get(name);
        if (!obj) return runner._nullObjProxy(name, log);
        return runner._objProxy(obj, log);
      },
      has(_target, name: string | symbol) {
        return typeof name === "string" && runner.objects.has(name);
      },
      ownKeys() {
        return Array.from(runner.objects.keys());
      },
    });
  }

  private _nullObjProxy(name: string, log: (...a: any[]) => void): any {
    let warned = false;
    const warn = () => {
      if (!warned) { warned = true; log(`Warning: object "${name}" does not exist in the scene`); }
    };
    const noop = (..._args: any[]) => {};
    return new Proxy({} as Record<string, any>, {
      get(_t, prop: string | symbol) {
        warn();
        const p = String(prop);
        if (p === "on" || p === "emit") return noop;
        return undefined;
      },
      set() { return true; },
    });
  }

  private _buildPlayers(): Record<string, any> {
    const proxy: Record<string, any> = {};
    for (const [, p] of this.players) {
      proxy[p.name] = this._playerProxy(p);
    }
    return proxy;
  }

  _objProxy(obj: ScriptObjState, log: (...a: any[]) => void): any {
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

      get Transparency() { return obj.transparency ?? 0; },
      set Transparency(v: any) { obj.transparency = Math.max(0, Math.min(1, +v)); },
      get transparency() { return obj.transparency ?? 0; },
      set transparency(v: any) { obj.transparency = Math.max(0, Math.min(1, +v)); },

      get CanCollide() { return obj.canCollide !== false; },
      set CanCollide(v: any) { obj.canCollide = Boolean(v); },
      get canCollide() { return obj.canCollide !== false; },
      set canCollide(v: any) { obj.canCollide = Boolean(v); },

      get Size() {
        return { X: obj.scaleX, Y: obj.scaleY, Z: obj.scaleZ };
      },

      on(event: string, fn: EventHandler) {
        const key = `${obj.name}::${event.toLowerCase()}`;
        const arr = runner.objHandlers.get(key) ?? [];
        arr.push(fn);
        runner.objHandlers.set(key, arr);
      },

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
