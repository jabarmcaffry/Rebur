/**
 * script-runner.ts — Server-side VM sandbox for game scripts
 *
 * Provides a complete scripting API sandboxed via Node.js `vm`.
 * Scripts are event-driven: they register handlers at load time and
 * react to physics events, timers, and player actions.
 *
 * Full API surface:
 *   Scene.Part.Position = {X,Y,Z}         // object movement
 *   Scene.Part.on("Touched", fn)          // touch event
 *   Scene.Part.on("clicked", fn)          // 3D click event
 *   Scene.Part.emit("myEvent", data)      // custom events
 *   Players.GetPlayers()                  // all connected players
 *   Players["Alice"]                      // player by name
 *   player.Health / player.TakeDamage(n) // health system
 *   player.Speed / player.JumpPower       // movement tuning
 *   player.Respawn() / player.Teleport(x,y,z)
 *   game.on("tick"|"playerAdded"|"playerRemoving"|"playerDied"|"playerSpawned", fn)
 *   game.state.set(key, val) / .get(key) / .on(key, fn)
 *   game.sound.play("name", opts?)        // broadcast sound to clients
 *   game.tween(obj, {Y:5}, 1.5, "easeInOut")
 *   game.create({name, primitiveType, position, ...})
 *   gui.text / gui.button / gui.bar / gui.image / gui.clear
 *   setTimeout / setInterval / task.delay / task.spawn
 *   find("Name") / destroy("Name")
 *   log / print / warn / error
 *   Vector3 / Color3
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
  health: number;
  maxHealth: number;
  speed: number;
  jumpPower: number;
  shirtColor: string;
  skinColor: string;
  pantsColor: string;
}

/** What scripts changed about a player this tick — drained by game-room each tick. */
export interface ScriptPlayerMutation {
  health?: number;
  maxHealth?: number;
  speed?: number;
  jumpPower?: number;
  teleport?: { x: number; y: number; z: number };
  respawn?: true;
  shirtColor?: string;
  skinColor?: string;
  pantsColor?: string;
}

/** An object creation request queued by game.create() — applied by game-room. */
export interface ScriptCreatedObject {
  name: string;
  primitiveType: string;
  positionX: number; positionY: number; positionZ: number;
  rotationX: number; rotationY: number; rotationZ: number;
  scaleX: number;    scaleY: number;    scaleZ: number;
  color: string;
  anchored: boolean;
  canCollide: boolean;
  transparency: number;
}

/** A sound event queued by game.sound.play() — broadcast to all clients by game-room. */
export interface ScriptSoundEvent {
  soundId: string;
  options?: { volume?: number; loop?: boolean };
}

export interface GuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar";
  text?: string;
  x: number; y: number;
  width?: number; height?: number;
  anchor?: string;
  color?: string;
  fontSize?: number;
  backgroundColor?: string;
  imageUrl?: string;
  value?: number; maxValue?: number;
  visible?: boolean;
  clickable?: boolean;
}

type EventHandler = (...args: any[]) => void;

interface TimerEntry {
  remaining: number;
  fn: (...a: any[]) => void;
  repeat: number | null;
}

interface TweenEntry {
  objName: string;
  to: Record<string, number>;
  from: Record<string, number>;
  elapsed: number;
  duration: number;
  easing: (t: number) => number;
  onDone?: () => void;
}

// ── Easing ────────────────────────────────────────────────────────────────────

const EASINGS: Record<string, (t: number) => number> = {
  linear:    (t) => t,
  easeIn:    (t) => t * t,
  easeOut:   (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  bounce:    (t) => {
    const n1=7.5625, d1=2.75;
    if (t<1/d1)   return n1*t*t;
    if (t<2/d1)   return n1*(t-=1.5/d1)*t+0.75;
    if (t<2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
    return n1*(t-=2.625/d1)*t+0.984375;
  },
  elastic: (t) => t===0?0:t===1?1:(-Math.pow(2,10*(t-1))*Math.sin((t-1.1)*5*Math.PI)),
};

const TWEEN_PROP_MAP: Record<string, string> = {
  X:"positionX", Y:"positionY", Z:"positionZ",
  RotX:"rotationX", RotY:"rotationY", RotZ:"rotationZ",
  ScaleX:"scaleX", ScaleY:"scaleY", ScaleZ:"scaleZ",
  Transparency:"transparency",
};

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  private globalHandlers   = new Map<string, EventHandler[]>();
  private objHandlers      = new Map<string, EventHandler[]>();
  private guiClickHandlers = new Map<string, EventHandler>();
  private logs: string[]   = [];
  private guiElements      = new Map<string, GuiElement>();
  private guiIdCounter     = 0;

  private timerQueue       = new Map<number, TimerEntry>();
  timerIdCounter           = 0;

  private tweens: TweenEntry[] = [];
  private playerMutations  = new Map<string, ScriptPlayerMutation>();
  private soundQueue: ScriptSoundEvent[]     = [];
  private createdObjects: ScriptCreatedObject[] = [];
  private gameState        = new Map<string, any>();
  private stateHandlers    = new Map<string, Array<(val: any, prev: any) => void>>();

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

    const runner = this;

    // ── Timers ────────────────────────────────────────────────────────────
    const _setTimeout  = (fn: EventHandler, ms: number) => {
      const id = ++runner.timerIdCounter;
      runner.timerQueue.set(id, { remaining: Math.max(ms, 0) / 1000, fn, repeat: null });
      return id;
    };
    const _setInterval = (fn: EventHandler, ms: number) => {
      const id = ++runner.timerIdCounter;
      const s  = Math.max(ms, 50) / 1000;
      runner.timerQueue.set(id, { remaining: s, fn, repeat: s });
      return id;
    };
    const _clearTimeout  = (id: number) => runner.timerQueue.delete(id);
    const _clearInterval = (id: number) => runner.timerQueue.delete(id);

    // ── Vector3 ───────────────────────────────────────────────────────────
    function mkVec3(x = 0, y = 0, z = 0) {
      const v: any = { X: x, Y: y, Z: z, x, y, z };
      Object.defineProperty(v, "magnitude", { get() { return Math.sqrt(x*x+y*y+z*z); } });
      v.add       = (o: any) => mkVec3(x+(o.X??o.x??0), y+(o.Y??o.y??0), z+(o.Z??o.z??0));
      v.sub       = (o: any) => mkVec3(x-(o.X??o.x??0), y-(o.Y??o.y??0), z-(o.Z??o.z??0));
      v.scale     = (s: number) => mkVec3(x*s, y*s, z*s);
      v.normalize = () => { const m=Math.sqrt(x*x+y*y+z*z)||1; return mkVec3(x/m,y/m,z/m); };
      v.dot       = (o: any) => x*(o.X??o.x)+y*(o.Y??o.y)+z*(o.Z??o.z);
      return v;
    }
    const Vector3 = Object.assign(
      (x=0,y=0,z=0) => mkVec3(x,y,z),
      { new:(x=0,y=0,z=0)=>mkVec3(x,y,z), zero:()=>mkVec3(0,0,0), one:()=>mkVec3(1,1,1),
        up:()=>mkVec3(0,1,0), right:()=>mkVec3(1,0,0), forward:()=>mkVec3(0,0,-1) }
    );

    // ── Color3 ────────────────────────────────────────────────────────────
    const Color3 = Object.assign(
      (r=0,g=0,b=0) => `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
      { new:(r=0,g=0,b=0)=>`rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
        fromRGB:(r=0,g=0,b=0)=>`rgb(${r},${g},${b})`,
        fromHex:(h:string)=>h }
    );

    // ── Tween helper ──────────────────────────────────────────────────────
    const _tween = (
      objProxy: any,
      to: Record<string, number>,
      duration: number,
      easing?: string | ((t: number) => number),
      onDone?: () => void
    ) => {
      const objName: string = objProxy?.Name ?? objProxy?.name ?? "";
      const obj = runner.objects.get(objName);
      if (!obj || !objName) return;
      const easeFn = typeof easing === "function" ? easing : (EASINGS[easing as string] ?? EASINGS.linear);
      const from: Record<string, number> = {};
      for (const key of Object.keys(to)) {
        const prop = TWEEN_PROP_MAP[key];
        from[key] = prop ? ((obj as any)[prop] ?? 0) : 0;
      }
      runner.tweens.push({ objName, to, from, elapsed: 0, duration: Math.max(duration, 0.001), easing: easeFn, onDone });
    };

    // ── game.create ───────────────────────────────────────────────────────
    const _create = (opts: {
      name?: string; primitiveType?: string; type?: string;
      position?: any; x?: number; y?: number; z?: number;
      rotation?: any; scale?: any; size?: any;
      color?: string; anchored?: boolean; canCollide?: boolean; transparency?: number;
    }) => {
      const name = opts.name ?? `Part_${++runner.timerIdCounter}`;
      const px = opts.position?.x ?? opts.position?.X ?? opts.x ?? 0;
      const py = opts.position?.y ?? opts.position?.Y ?? opts.y ?? 5;
      const pz = opts.position?.z ?? opts.position?.Z ?? opts.z ?? 0;
      const sx = opts.scale?.x ?? opts.scale?.X ?? opts.size?.x ?? opts.size?.X ?? 1;
      const sy = opts.scale?.y ?? opts.scale?.Y ?? opts.size?.y ?? opts.size?.Y ?? 1;
      const sz = opts.scale?.z ?? opts.scale?.Z ?? opts.size?.z ?? opts.size?.Z ?? 1;
      runner.createdObjects.push({
        name,
        primitiveType: opts.primitiveType ?? opts.type ?? "cube",
        positionX: px, positionY: py, positionZ: pz,
        rotationX: opts.rotation?.x??0, rotationY: opts.rotation?.y??0, rotationZ: opts.rotation?.z??0,
        scaleX: sx, scaleY: sy, scaleZ: sz,
        color: opts.color ?? "#888888",
        anchored: opts.anchored ?? false,
        canCollide: opts.canCollide !== false,
        transparency: opts.transparency ?? 0,
      });
      return runner._nullObjProxy(name, log);
    };

    // ── GUI helpers ───────────────────────────────────────────────────────
    const guiAPI = {
      text: (text: string, x: number, y: number, opts?: Partial<GuiElement>) => {
        const id = `g${runner.guiIdCounter++}`;
        runner.guiElements.set(id, { id, kind:"text", text, x, y, color:"#ffffff", fontSize:14, anchor:"topLeft", visible:true, ...opts });
        return { id, update:(c:Partial<GuiElement>)=>{ const e=runner.guiElements.get(id); if(e) Object.assign(e,c); }, remove:()=>runner.guiElements.delete(id) };
      },
      button: (text: string, x: number, y: number, onClick: EventHandler, opts?: Partial<GuiElement>) => {
        const id = `g${runner.guiIdCounter++}`;
        runner.guiElements.set(id, { id, kind:"button", text, x, y, width:120, height:36, color:"#ffffff", backgroundColor:"#3b82f6", fontSize:14, anchor:"topLeft", visible:true, clickable:true, ...opts });
        runner.guiClickHandlers.set(id, onClick);
        return { id, update:(c:Partial<GuiElement>)=>{ const e=runner.guiElements.get(id); if(e) Object.assign(e,c); }, remove:()=>{ runner.guiElements.delete(id); runner.guiClickHandlers.delete(id); } };
      },
      bar: (x: number, y: number, value: number, maxValue: number, opts?: Partial<GuiElement>) => {
        const id = `g${runner.guiIdCounter++}`;
        runner.guiElements.set(id, { id, kind:"bar", x, y, width:200, height:14, value, maxValue, color:"#22c55e", backgroundColor:"#374151", anchor:"topLeft", visible:true, ...opts });
        return { id, update:(c:Partial<GuiElement>)=>{ const e=runner.guiElements.get(id); if(e) Object.assign(e,c); }, setValue:(v:number)=>{ const e=runner.guiElements.get(id); if(e) e.value=v; }, remove:()=>runner.guiElements.delete(id) };
      },
      image: (imageUrl: string, x: number, y: number, opts?: Partial<GuiElement>) => {
        const id = `g${runner.guiIdCounter++}`;
        runner.guiElements.set(id, { id, kind:"image", imageUrl, x, y, width:64, height:64, anchor:"topLeft", visible:true, ...opts });
        return { id, update:(c:Partial<GuiElement>)=>{ const e=runner.guiElements.get(id); if(e) Object.assign(e,c); }, remove:()=>runner.guiElements.delete(id) };
      },
      clear: () => { runner.guiElements.clear(); runner.guiClickHandlers.clear(); },
    };

    // ── Shared game context ───────────────────────────────────────────────
    const gameAPI = {
      on: (event: string, fn: EventHandler) => {
        const key = event.toLowerCase();
        const arr = runner.globalHandlers.get(key) ?? [];
        arr.push(fn);
        runner.globalHandlers.set(key, arr);
      },
      state: {
        set(key: string, value: any) {
          const prev = runner.gameState.get(key);
          runner.gameState.set(key, value);
          for (const h of runner.stateHandlers.get(key) ?? []) {
            try { h(value, prev); } catch { /* isolate */ }
          }
        },
        get(key: string) { return runner.gameState.get(key); },
        on(key: string, fn: (val: any, prev: any) => void) {
          const arr = runner.stateHandlers.get(key) ?? [];
          arr.push(fn);
          runner.stateHandlers.set(key, arr);
          return () => runner.stateHandlers.set(key, (runner.stateHandlers.get(key)??[]).filter(h=>h!==fn));
        },
        keys() { return Array.from(runner.gameState.keys()); },
        getAll() { return Object.fromEntries(runner.gameState); },
      },
      sound: {
        play(soundId: string, opts?: { volume?: number; loop?: boolean }) {
          runner.soundQueue.push({ soundId, options: opts });
        },
      },
      tween: _tween,
      create: _create,
      find(name: string) {
        const obj = runner.objects.get(name);
        return obj ? runner._objProxy(obj, log) : runner._nullObjProxy(name, log);
      },
      destroy(name: string) {
        const obj = runner.objects.get(name);
        if (obj) obj.visible = false;
      },
      log, print: log,
    };

    const ctx = createContext({
      Scene:   runner._buildWorkspace(log),
      workspace: runner._buildWorkspace(log),
      Players: runner._buildPlayers(log),

      game:    gameAPI,
      gui:     guiAPI,
      events:  { on: gameAPI.on },

      runService: {
        on: (_ev: string, fn: EventHandler) => gameAPI.on("tick", fn),
        Heartbeat: { Connect: (fn: EventHandler) => gameAPI.on("tick", fn) },
      },

      // Top-level helpers
      find:    gameAPI.find,
      destroy: gameAPI.destroy,
      log, print: log, warn: log, error: log,

      setTimeout: _setTimeout, setInterval: _setInterval,
      clearTimeout: _clearTimeout, clearInterval: _clearInterval,

      wait:  (_s?: number) => { /* no-op — use setTimeout/task.delay */ },
      spawn: (fn: EventHandler) => _setTimeout(fn, 0),
      task: {
        wait:  (_s?: number) => { /* no-op */ },
        delay: (s: number, fn: EventHandler) => _setTimeout(fn, s * 1000),
        spawn: (fn: EventHandler) => _setTimeout(fn, 0),
      },

      Vector3, Color3,
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite, Symbol,
      Promise: undefined,
      process: undefined, require: undefined, fetch: undefined,
      __filename: undefined, __dirname: undefined,
    });

    try {
      new Script(code, { filename: fileName }).runInContext(ctx, { timeout: 2000 });
    } catch (err: any) {
      log(`Runtime error: ${err?.message ?? err}`);
    }
  }

  // ── Tick — called every frame by GameRoom ───────────────────────────────────

  tick(dt: number) {
    // Advance timers
    for (const [id, timer] of this.timerQueue) {
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        try { timer.fn(); } catch { /* isolate */ }
        if (timer.repeat !== null) timer.remaining = timer.repeat;
        else this.timerQueue.delete(id);
      }
    }

    // Advance tweens
    const done: number[] = [];
    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      const t  = Math.min(tw.elapsed / tw.duration, 1);
      const et = tw.easing(t);
      const obj = this.objects.get(tw.objName);
      if (obj) {
        for (const [key, toVal] of Object.entries(tw.to)) {
          const prop = TWEEN_PROP_MAP[key];
          if (prop) (obj as any)[prop] = tw.from[key] + (toVal - tw.from[key]) * et;
        }
      }
      if (t >= 1) { try { tw.onDone?.(); } catch { /* isolate */ } done.push(i); }
    }
    for (let i = done.length - 1; i >= 0; i--) this.tweens.splice(done[i], 1);

    this._fireGlobal("tick", dt);
  }

  // ── Global event firing ─────────────────────────────────────────────────────

  firePlayerAdded(player: ScriptPlayerState)    { this._fireGlobal("playeradded", this._playerProxy(player)); }
  firePlayerRemoving(player: ScriptPlayerState) { this._fireGlobal("playerremoving", this._playerProxy(player)); }
  firePlayerDied(player: ScriptPlayerState)     { this._fireGlobal("playerdied", this._playerProxy(player)); }
  firePlayerSpawned(player: ScriptPlayerState)  { this._fireGlobal("playerspawned", this._playerProxy(player)); }

  fireTouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "touched", this._playerProxy(player));
  }
  fireObjClicked(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "clicked", this._playerProxy(player));
  }
  fireObjEvent(objName: string, event: string, ...args: any[]) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }

  // ── Logs & GUI ──────────────────────────────────────────────────────────────

  drainLogs(): string[] { const l = [...this.logs]; this.logs = []; return l; }
  getGuiElements(): GuiElement[] { return Array.from(this.guiElements.values()); }
  fireGuiClick(elementId: string, player: ScriptPlayerState) {
    const h = this.guiClickHandlers.get(elementId);
    if (h) try { h(this._playerProxy(player)); } catch { /* isolate */ }
  }

  // ── Drain queues (called by GameRoom each tick) ─────────────────────────────

  drainSounds(): ScriptSoundEvent[] { const s = [...this.soundQueue]; this.soundQueue = []; return s; }
  drainCreatedObjects(): ScriptCreatedObject[] { const o = [...this.createdObjects]; this.createdObjects = []; return o; }
  drainAllPlayerMutations(): Map<string, ScriptPlayerMutation> {
    const m = new Map(this.playerMutations); this.playerMutations.clear(); return m;
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
    return new Proxy({} as any, {
      get(_t, name: string|symbol) {
        if (typeof name !== "string") return undefined;
        const obj = runner.objects.get(name);
        return obj ? runner._objProxy(obj, log) : runner._nullObjProxy(name, log);
      },
      has(_t, name: string|symbol) { return typeof name === "string" && runner.objects.has(name); },
      ownKeys() { return Array.from(runner.objects.keys()); },
    });
  }

  private _buildPlayers(log: (...a: any[]) => void): any {
    const runner = this;
    return new Proxy({} as any, {
      get(_t, name: string|symbol) {
        if (typeof name !== "string") return undefined;
        if (name === "GetPlayers" || name === "getPlayers") {
          return () => Array.from(runner.players.values()).map(p => runner._playerProxy(p));
        }
        for (const p of runner.players.values()) {
          if (p.name === name) return runner._playerProxy(p);
        }
        return undefined;
      },
      has(_t, name: string|symbol) {
        if (typeof name !== "string") return false;
        for (const p of runner.players.values()) { if (p.name === name) return true; }
        return false;
      },
      ownKeys() { return [...Array.from(runner.players.values()).map(p => p.name), "GetPlayers"]; },
    });
  }

  private _nullObjProxy(name: string, log: (...a: any[]) => void): any {
    let warned = false;
    const warn = () => { if (!warned) { warned = true; log(`Warning: object "${name}" not found`); } };
    return new Proxy({} as any, {
      get(_t, prop: string|symbol) { warn(); const p=String(prop); if(p==="on"||p==="off"||p==="emit") return ()=>{}; return undefined; },
      set() { return true; },
    });
  }

  _objProxy(obj: ScriptObjState, log: (...a: any[]) => void): any {
    const runner = this;
    return {
      get Name()    { return obj.name; },
      get name()    { return obj.name; },

      get Position()      { return { X:obj.positionX, Y:obj.positionY, Z:obj.positionZ, x:obj.positionX, y:obj.positionY, z:obj.positionZ }; },
      set Position(v:any) { obj.positionX=+(v?.X??v?.x??obj.positionX); obj.positionY=+(v?.Y??v?.y??obj.positionY); obj.positionZ=+(v?.Z??v?.z??obj.positionZ); },
      get position()      { return { X:obj.positionX, Y:obj.positionY, Z:obj.positionZ }; },
      set position(v:any) { obj.positionX=+(v?.X??v?.x??obj.positionX); obj.positionY=+(v?.Y??v?.y??obj.positionY); obj.positionZ=+(v?.Z??v?.z??obj.positionZ); },

      get Rotation()      { return { X:obj.rotationX, Y:obj.rotationY, Z:obj.rotationZ }; },
      set Rotation(v:any) { obj.rotationX=+(v?.X??v?.x??obj.rotationX); obj.rotationY=+(v?.Y??v?.y??obj.rotationY); obj.rotationZ=+(v?.Z??v?.z??obj.rotationZ); },

      get Color()    { return obj.color; },
      set Color(v)   { obj.color = String(v); },
      get color()    { return obj.color; },
      set color(v)   { obj.color = String(v); },

      get Visible()  { return obj.visible; },
      set Visible(v) { obj.visible = Boolean(v); },
      get visible()  { return obj.visible; },
      set visible(v) { obj.visible = Boolean(v); },

      get Anchored()  { return obj.anchored; },
      set Anchored(v) { obj.anchored = Boolean(v); },

      get CanCollide()  { return obj.canCollide !== false; },
      set CanCollide(v) { obj.canCollide = Boolean(v); },

      get Transparency()  { return obj.transparency ?? 0; },
      set Transparency(v) { obj.transparency = Math.max(0, Math.min(1, +v)); },
      get transparency()  { return obj.transparency ?? 0; },
      set transparency(v) { obj.transparency = Math.max(0, Math.min(1, +v)); },

      get Velocity()      { return { X:obj.velX, Y:obj.velY, Z:obj.velZ }; },
      set Velocity(v:any) { obj.velX=+(v?.X??v?.x??0); obj.velY=+(v?.Y??v?.y??0); obj.velZ=+(v?.Z??v?.z??0); },

      get Size()  { return { X:obj.scaleX, Y:obj.scaleY, Z:obj.scaleZ }; },
      get Scale() { return { X:obj.scaleX, Y:obj.scaleY, Z:obj.scaleZ }; },

      on(event: string, fn: EventHandler) {
        const key = `${obj.name}::${event.toLowerCase()}`;
        const arr = runner.objHandlers.get(key) ?? [];
        arr.push(fn);
        runner.objHandlers.set(key, arr);
        return () => runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const key = `${obj.name}::${event.toLowerCase()}`;
        runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      emit(event: string, ...args: any[]) {
        runner._fireObj(obj.name, event.toLowerCase(), ...args);
      },
    };
  }

  private _playerProxy(p: ScriptPlayerState): any {
    const runner = this;
    const mut = (): ScriptPlayerMutation => {
      let m = runner.playerMutations.get(p.id);
      if (!m) { m = {}; runner.playerMutations.set(p.id, m); }
      return m;
    };
    return {
      get Name()      { return p.name; },
      get UserId()    { return p.id; },
      get Position()  { return { X:p.position.x, Y:p.position.y, Z:p.position.z, x:p.position.x, y:p.position.y, z:p.position.z }; },

      get Health()       { return p.health; },
      set Health(v:any)  { const n=Math.max(0,+v); p.health=n; mut().health=n; },
      get MaxHealth()    { return p.maxHealth; },
      set MaxHealth(v:any){ const n=Math.max(1,+v); p.maxHealth=n; mut().maxHealth=n; },

      get WalkSpeed()    { return p.speed; },
      set WalkSpeed(v:any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get Speed()        { return p.speed; },
      set Speed(v:any)   { const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get JumpPower()    { return p.jumpPower; },
      set JumpPower(v:any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },

      get ShirtColor()   { return p.shirtColor; },
      set ShirtColor(v:any){ p.shirtColor=String(v); mut().shirtColor=String(v); },
      get SkinColor()    { return p.skinColor; },
      set SkinColor(v:any){ p.skinColor=String(v); mut().skinColor=String(v); },
      get PantsColor()   { return p.pantsColor; },
      set PantsColor(v:any){ p.pantsColor=String(v); mut().pantsColor=String(v); },

      TakeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
      takeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
      Heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
      heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
      Kill()              { p.health=0; mut().health=0; },
      kill()              { p.health=0; mut().health=0; },
      Respawn()           { mut().respawn=true; },
      respawn()           { mut().respawn=true; },
      Teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },
      teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },
    };
  }
}
