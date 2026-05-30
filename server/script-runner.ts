/**
 * script-runner.ts — Server-side VM sandbox for Rebur game scripts
 *
 * Primary API: Rebur.* (all documented APIs work here)
 * Legacy API: game.*, Scene.*, Players.* (kept for backward compat)
 *
 * Globals available in scripts:
 *   Rebur — primary engine global
 *   after, every, wait, log, warn, error, random, randInt, pick
 *   Vector3, Color3
 *   Math, JSON, String, Number, Boolean, Array, Object, Date, Promise
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
  isTrigger?: boolean;
  mass?: number;
  impulseX?: number; impulseY?: number; impulseZ?: number;
  forceX?: number;   forceY?: number;   forceZ?: number;
  _destroyed?: boolean;
  _tags?: Set<string>;
  _attrs?: Map<string, any>;
}

export interface ScriptPlayerState {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  speed: number;
  runSpeed?: number;
  jumpPower: number;
  onGround?: boolean;
  shirtColor: string;
  skinColor: string;
  pantsColor: string;
  spawnX?: number; spawnY?: number; spawnZ?: number;
}

export interface ScriptPlayerMutation {
  health?: number;
  maxHealth?: number;
  speed?: number;
  runSpeed?: number;
  jumpPower?: number;
  teleport?: { x: number; y: number; z: number };
  respawn?: true;
  shirtColor?: string;
  skinColor?: string;
  pantsColor?: string;
  spawnPoint?: { x: number; y: number; z: number };
}

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
  isTrigger?: boolean;
}

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

export interface NetworkMessage {
  event: string;
  payload: any;
}

export interface NetworkToPlayer {
  playerId: string;
  event: string;
  payload: any;
}

type EventHandler = (...args: any[]) => void;

interface TimerEntry {
  remaining: number;
  fn: (...a: any[]) => void;
  repeat: number | null;
}

interface TweenEntry {
  target: any;
  to: Record<string, number>;
  from: Record<string, number>;
  elapsed: number;
  duration: number;
  easing: (t: number) => number;
  onDone?: () => void;
  cancelled?: boolean;
}

// ── Easing ────────────────────────────────────────────────────────────────────

const EASINGS: Record<string, (t: number) => number> = {
  linear:          (t) => t,
  easeIn:          (t) => t * t,
  easeInQuad:      (t) => t * t,
  easeOut:         (t) => t * (2 - t),
  easeOutQuad:     (t) => t * (2 - t),
  easeInOut:       (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInOutQuad:   (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic:     (t) => t*t*t,
  easeOutCubic:    (t) => (--t)*t*t+1,
  easeInOutCubic:  (t) => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
  bounce: (t) => {
    const n1=7.5625, d1=2.75;
    if (t<1/d1)   return n1*t*t;
    if (t<2/d1)   return n1*(t-=1.5/d1)*t+0.75;
    if (t<2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
    return n1*(t-=2.625/d1)*t+0.984375;
  },
  elastic: (t) => t===0?0:t===1?1:(-Math.pow(2,10*(t-1))*Math.sin((t-1.1)*5*Math.PI)),
};

// ── Anchor name mapping (new short form → old full form) ─────────────────────

const ANCHOR_MAP: Record<string, string> = {
  tl: "topLeft",    tc: "topCenter",    tr: "topRight",
  cl: "centerLeft", cc: "center",       cr: "centerRight",
  bl: "bottomLeft", bc: "bottomCenter", br: "bottomRight",
};

function mapGuiOpts(opts: any): Partial<GuiElement> {
  if (!opts) return {};
  return {
    anchor: ANCHOR_MAP[opts.anchor] ?? opts.anchor ?? "topLeft",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    fontSize: opts.size ?? opts.fontSize ?? 14,
    color: opts.color ?? "#ffffff",
    backgroundColor: opts.bg ?? opts.backgroundColor,
    width: opts.width,
    height: opts.height,
  };
}

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  private globalHandlers   = new Map<string, EventHandler[]>();
  private objHandlers      = new Map<string, EventHandler[]>();
  private guiClickHandlers = new Map<string, EventHandler>();
  private logs: string[]   = [];
  private guiElements      = new Map<string, GuiElement>();
  private playerGuiElements      = new Map<string, Map<string, GuiElement>>();
  private playerGuiClickHandlers = new Map<string, Map<string, EventHandler>>();

  private timerQueue   = new Map<number, TimerEntry>();
  timerIdCounter       = 0;

  private tweens: TweenEntry[] = [];
  private playerMutations  = new Map<string, ScriptPlayerMutation>();
  private soundQueue: ScriptSoundEvent[]       = [];
  private createdObjects: ScriptCreatedObject[] = [];
  private destroyQueue: string[]               = [];
  private gameState        = new Map<string, any>();
  private stateHandlers    = new Map<string, Array<(val: any, prev: any) => void>>();
  private dataStore        = new Map<string, any>();
  private playerData       = new Map<string, Map<string, any>>();

  private networkMessages: NetworkMessage[]    = [];
  private networkToPlayer: NetworkToPlayer[]   = [];
  private networkHandlers  = new Map<string, EventHandler[]>();

  private tagMap      = new Map<string, Set<string>>(); // tag → entity names
  private entityTags  = new Map<string, Set<string>>(); // entity name → tags

  // Input — class-level so all loaded scripts share one set of handlers
  private inputPressHandlers   = new Map<string, EventHandler[]>();
  private inputReleaseHandlers = new Map<string, EventHandler[]>();
  private mouseClickHandlers: EventHandler[] = [];

  private cameraSettings: Record<string, any> = {
    mode: "thirdPerson", distance: 8, fov: 70, sensitivity: 1,
    offset: { x: 0, y: 1.5, z: 0 }, position: { x: 0, y: 10, z: 10 }, lookAt: { x: 0, y: 0, z: 0 },
  };
  private physicsSettings = { gravity: 9.81, airDrag: 0 };

  constructor(
    private readonly objects: Map<string, ScriptObjState>,
    private readonly players: Map<string, ScriptPlayerState>
  ) {}

  // ── Script loading ──────────────────────────────────────────────────────────

  loadScript(code: string, fileName = "Script") {
    const makeLog = (prefix: string) => (...args: any[]) => {
      const msg = args.map((a) => {
        try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(" ");
      this.logs.push(`[${prefix}${fileName}] ${msg}`);
    };
    const log  = makeLog("");
    const warn = makeLog("warn:");
    const error = makeLog("error:");

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

    // after / every / wait — documented top-level helpers
    const after = (seconds: number, fn: EventHandler) => {
      const id = _setTimeout(fn, seconds * 1000);
      return () => runner.timerQueue.delete(id);
    };
    const every = (seconds: number, fn: EventHandler) => {
      const id = _setInterval(fn, seconds * 1000);
      return () => runner.timerQueue.delete(id);
    };
    // wait() returns a real Promise so async/await works
    const wait = (seconds = 0) => new Promise<void>((resolve) => {
      _setTimeout(resolve, seconds * 1000);
    });

    // random / randInt / pick
    const random = (min = 0, max = 1) => min + Math.random() * (max - min);
    const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

    // ── Vector3 ───────────────────────────────────────────────────────────
    function mkVec3(x = 0, y = 0, z = 0) {
      const v: any = { x, y, z, X: x, Y: y, Z: z };
      Object.defineProperty(v, "magnitude", { get() { return Math.sqrt(x*x+y*y+z*z); } });
      v.add       = (o: any) => mkVec3(x+(o.x??o.X??0), y+(o.y??o.Y??0), z+(o.z??o.Z??0));
      v.sub       = (o: any) => mkVec3(x-(o.x??o.X??0), y-(o.y??o.Y??0), z-(o.z??o.Z??0));
      v.scale     = (s: number) => mkVec3(x*s, y*s, z*s);
      v.normalize = () => { const m=Math.sqrt(x*x+y*y+z*z)||1; return mkVec3(x/m,y/m,z/m); };
      v.dot       = (o: any) => x*(o.x??o.X)+y*(o.y??o.Y)+z*(o.z??o.Z);
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

    // ── Entity proxy builder ──────────────────────────────────────────────
    const makeEntityProxy = (obj: ScriptObjState): any => {
      // Mutable position proxy — entity.position.x = 5 works
      const makePosProxy = () => new Proxy({} as any, {
        get(_t, prop: string) {
          if (prop === 'x') return obj.positionX;
          if (prop === 'y') return obj.positionY;
          if (prop === 'z') return obj.positionZ;
          return undefined;
        },
        set(_t, prop: string, val: any) {
          if (prop === 'x') { obj.positionX = +val; return true; }
          if (prop === 'y') { obj.positionY = +val; return true; }
          if (prop === 'z') { obj.positionZ = +val; return true; }
          return true;
        },
      });
      const makeRotProxy = () => new Proxy({} as any, {
        get(_t, prop: string) {
          if (prop === 'x') return obj.rotationX;
          if (prop === 'y') return obj.rotationY;
          if (prop === 'z') return obj.rotationZ;
          return undefined;
        },
        set(_t, prop: string, val: any) {
          if (prop === 'x') { obj.rotationX = +val; return true; }
          if (prop === 'y') { obj.rotationY = +val; return true; }
          if (prop === 'z') { obj.rotationZ = +val; return true; }
          return true;
        },
      });
      const makeScaleProxy = () => new Proxy({} as any, {
        get(_t, prop: string) {
          if (prop === 'x') return obj.scaleX;
          if (prop === 'y') return obj.scaleY;
          if (prop === 'z') return obj.scaleZ;
          return undefined;
        },
        set(_t, prop: string, val: any) {
          if (prop === 'x') { obj.scaleX = +val; return true; }
          if (prop === 'y') { obj.scaleY = +val; return true; }
          if (prop === 'z') { obj.scaleZ = +val; return true; }
          return true;
        },
      });

      let _posProxy: any = null;
      let _rotProxy: any = null;
      let _scaleProxy: any = null;

      // Body proxy
      const body = {
        get anchored()     { return obj.anchored; },
        set anchored(v)    { obj.anchored = Boolean(v); },
        get canCollide()   { return obj.canCollide !== false; },
        set canCollide(v)  { obj.canCollide = Boolean(v); },
        get isTrigger()    { return obj.isTrigger ?? false; },
        set isTrigger(v)   { obj.isTrigger = Boolean(v); },
        get mass()         { return obj.mass ?? 1; },
        set mass(v)        { obj.mass = Math.max(0.01, +v); },
        get friction()     { return 0.5; },
        get restitution()  { return 0; },
        get isKinematic()  { return obj.anchored; },
        set isKinematic(v) { obj.anchored = Boolean(v); },
        get velocity()     { return { x: obj.velX, y: obj.velY, z: obj.velZ }; },
        get angularVelocity() { return { x: 0, y: 0, z: 0 }; },
        applyForce(f: any) {
          obj.forceX = (obj.forceX ?? 0) + (+f?.x ?? 0);
          obj.forceY = (obj.forceY ?? 0) + (+f?.y ?? 0);
          obj.forceZ = (obj.forceZ ?? 0) + (+f?.z ?? 0);
        },
        applyImpulse(f: any) {
          obj.impulseX = (obj.impulseX ?? 0) + (+f?.x ?? 0);
          obj.impulseY = (obj.impulseY ?? 0) + (+f?.y ?? 0);
          obj.impulseZ = (obj.impulseZ ?? 0) + (+f?.z ?? 0);
        },
        applyTorque(_t: any) { /* stub */ },
        setVelocity(v: any) {
          obj.velX = +(v?.x ?? 0); obj.velY = +(v?.y ?? 0); obj.velZ = +(v?.z ?? 0);
        },
        setAngularVelocity(_v: any) { /* stub */ },
      };

      const ep: any = {
        get id()        { return obj.id; },
        get name()      { return obj.name; },
        set name(v)     { obj.name = String(v); },
        get type()      { return "primitive"; },
        get isPlayer()  { return false; },
        get destroyed() { return obj._destroyed === true; },

        get position() {
          if (!_posProxy) _posProxy = makePosProxy();
          return _posProxy;
        },
        set position(v: any) {
          obj.positionX = +(v?.x ?? v?.X ?? obj.positionX);
          obj.positionY = +(v?.y ?? v?.Y ?? obj.positionY);
          obj.positionZ = +(v?.z ?? v?.Z ?? obj.positionZ);
          _posProxy = null;
        },
        get rotation() {
          if (!_rotProxy) _rotProxy = makeRotProxy();
          return _rotProxy;
        },
        set rotation(v: any) {
          obj.rotationX = +(v?.x ?? v?.X ?? obj.rotationX);
          obj.rotationY = +(v?.y ?? v?.Y ?? obj.rotationY);
          obj.rotationZ = +(v?.z ?? v?.Z ?? obj.rotationZ);
          _rotProxy = null;
        },
        get scale() {
          if (!_scaleProxy) _scaleProxy = makeScaleProxy();
          return _scaleProxy;
        },
        set scale(v: any) {
          obj.scaleX = +(v?.x ?? v?.X ?? obj.scaleX);
          obj.scaleY = +(v?.y ?? v?.Y ?? obj.scaleY);
          obj.scaleZ = +(v?.z ?? v?.Z ?? obj.scaleZ);
          _scaleProxy = null;
        },

        get color()        { return obj.color; },
        set color(v)       { obj.color = String(v); },
        get visible()      { return obj.visible; },
        set visible(v)     { obj.visible = Boolean(v); },
        get transparency() { return obj.transparency ?? 0; },
        set transparency(v){ obj.transparency = Math.max(0, Math.min(1, +v)); },

        get body() { return body; },
        get parent() { return null; },
        get children() { return []; },

        find(_n: string) { return null; },
        setParent(_p: any) { /* stub */ },

        destroy() {
          if (obj._destroyed) return;
          obj._destroyed = true;
          obj.visible = false;
          runner.destroyQueue.push(obj.name);
          runner._fireObj(obj.name, "destroyed");
        },

        on(event: string, fn: EventHandler) {
          if (obj._destroyed) { warn(`on() called on destroyed entity "${obj.name}"`); return () => {}; }
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
          if (obj._destroyed) { warn(`emit() called on destroyed entity "${obj.name}"`); return false; }
          runner._fireObj(obj.name, event.toLowerCase(), ...args);
          return true;
        },
        setAttribute(key: string, value: any) {
          if (!obj._attrs) obj._attrs = new Map();
          obj._attrs.set(key, value);
        },
        getAttribute(key: string) {
          return obj._attrs?.get(key);
        },

        // Legacy aliases
        get Name()      { return obj.name; },
        get Position()  { return { X:obj.positionX, Y:obj.positionY, Z:obj.positionZ }; },
        set Position(v:any){ obj.positionX=+(v?.X??v?.x??obj.positionX); obj.positionY=+(v?.Y??v?.y??obj.positionY); obj.positionZ=+(v?.Z??v?.z??obj.positionZ); },
        get Rotation()  { return { X:obj.rotationX, Y:obj.rotationY, Z:obj.rotationZ }; },
        set Rotation(v:any){ obj.rotationX=+(v?.X??v?.x??0); obj.rotationY=+(v?.Y??v?.y??0); obj.rotationZ=+(v?.Z??v?.z??0); },
        get Color()     { return obj.color; },
        set Color(v)    { obj.color = String(v); },
        get Visible()   { return obj.visible; },
        set Visible(v)  { obj.visible = Boolean(v); },
        get Anchored()  { return obj.anchored; },
        set Anchored(v) { obj.anchored = Boolean(v); },
      };

      return ep;
    };

    // ── Player entity proxy builder ───────────────────────────────────────
    const makePlayerProxy = (p: ScriptPlayerState): any => {
      const mut = (): ScriptPlayerMutation => {
        let m = runner.playerMutations.get(p.id);
        if (!m) { m = {}; runner.playerMutations.set(p.id, m); }
        return m;
      };

      // Per-player GUI (new ID-based API)
      const makePlayerGui = () => ({
        text(id: string, text: string, opts?: any) {
          const map = runner.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          runner.playerGuiElements.set(p.id, map);
          map.set(id, { id, kind:"text", text, ...mapGuiOpts(opts), visible: true });
        },
        button(id: string, text: string, opts?: any, onClick?: EventHandler) {
          const map = runner.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          runner.playerGuiElements.set(p.id, map);
          const handlers = runner.playerGuiClickHandlers.get(p.id) ?? new Map<string, EventHandler>();
          runner.playerGuiClickHandlers.set(p.id, handlers);
          map.set(id, { id, kind:"button", text, width:160, height:36, ...mapGuiOpts(opts), visible:true, clickable:true });
          if (onClick) handlers.set(id, onClick);
        },
        bar(id: string, value: number, maxValue: number, opts?: any) {
          const map = runner.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          runner.playerGuiElements.set(p.id, map);
          map.set(id, { id, kind:"bar", value, maxValue, width:200, height:14, ...mapGuiOpts(opts), visible:true });
        },
        image(id: string, url: string, opts?: any) {
          const map = runner.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          runner.playerGuiElements.set(p.id, map);
          map.set(id, { id, kind:"image", imageUrl:url, width:64, height:64, ...mapGuiOpts(opts), visible:true });
        },
        clear(id?: string) {
          const map = runner.playerGuiElements.get(p.id);
          const handlers = runner.playerGuiClickHandlers.get(p.id);
          if (id !== undefined) { map?.delete(id); handlers?.delete(id); }
          else { map?.clear(); handlers?.clear(); }
        },
      });

      // Per-player data (persistent-backed by in-memory Map for now)
      const makePlayerData = () => {
        const getData = () => {
          if (!runner.playerData.has(p.id)) runner.playerData.set(p.id, new Map());
          return runner.playerData.get(p.id)!;
        };
        return {
          get(key: string) { return getData().get(key); },
          set(key: string, value: any) { getData().set(key, value); },
          delete(key: string) { getData().delete(key); },
          increment(key: string, amount = 1) {
            const d = getData();
            const n = (d.get(key) ?? 0) + amount;
            d.set(key, n);
            return n;
          },
          getAll() { return Object.fromEntries(getData()); },
        };
      };

      const gui = makePlayerGui();
      const data = makePlayerData();

      // Stub animator
      const animator = {
        current: null as string | null,
        playing: false,
        play(_name: string, _opts?: any) {},
        stop() {},
        on(_ev: string, _fn: any) { return () => {}; },
      };

      // Stub inventory
      const inventory = {
        items: [] as any[],
        maxSlots: 36,
        equipped: null as any,
        add(_name: string, _opts?: any) { return null; },
        remove(_name: string, _count?: number) { return 0; },
        has(_name: string, _count?: number) { return false; },
        get(_name: string) { return null; },
        equip(_name: string | null) { return false; },
        drop(_name: string, _count?: number) { return null; },
        clear() {},
      };

      // Stub motors
      const motors = {
        attach(_slot: string, _entity: any, _offset?: any) {},
        detach(_slot: string) { return null; },
        get(_slot: string) { return null; },
      };

      const pp: any = {
        get id()         { return p.id; },
        get name()       { return p.name; },
        get username()   { return p.name; },
        get isPlayer()   { return true; },
        get destroyed()  { return false; },
        get type()       { return "player"; },

        // position is READ-ONLY for players
        get position()   { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
        set position(_v) { warn("player.position is read-only — use player.teleport(x,y,z) to move a player."); },
        get rotation()   { return { x: 0, y: 0, z: 0 }; },
        set rotation(_v) { warn("player.rotation is read-only — the movement system controls it."); },

        get health()        { return p.health; },
        set health(v:any)   { const n=Math.max(0,+v); p.health=n; mut().health=n; },
        get maxHealth()     { return p.maxHealth; },
        set maxHealth(v:any){ const n=Math.max(1,+v); p.maxHealth=n; mut().maxHealth=n; },
        get walkSpeed()     { return p.speed; },
        set walkSpeed(v:any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
        get runSpeed()      { return p.runSpeed ?? p.speed * 1.6; },
        set runSpeed(v:any) { const n=Math.max(0,+v); p.runSpeed=n; mut().runSpeed=n; },
        get jumpPower()     { return p.jumpPower; },
        set jumpPower(v:any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
        get onGround()      { return p.onGround ?? false; },
        get color()         { return p.shirtColor; },
        set color(v:any)    { p.shirtColor=String(v); mut().shirtColor=String(v); },

        get spawnPoint()    {
          return { x: p.spawnX ?? 0, y: p.spawnY ?? 0, z: p.spawnZ ?? 0 };
        },
        set spawnPoint(v:any) {
          p.spawnX = +(v?.x ?? 0); p.spawnY = +(v?.y ?? 0); p.spawnZ = +(v?.z ?? 0);
          mut().spawnPoint = { x: p.spawnX, y: p.spawnY, z: p.spawnZ };
        },

        get gui()           { return gui; },
        get data()          { return data; },
        get animator()      { return animator; },
        get inventory()     { return inventory; },
        get motors()        { return motors; },

        takeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
        heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
        kill()              { p.health=0; mut().health=0; },
        respawn()           { mut().respawn=true; },
        teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },

        on(event: string, fn: EventHandler) {
          const key = `player::${p.id}::${event.toLowerCase()}`;
          const arr = runner.objHandlers.get(key) ?? [];
          arr.push(fn);
          runner.objHandlers.set(key, arr);
          return () => runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
        },
        off(event: string, fn: EventHandler) {
          const key = `player::${p.id}::${event.toLowerCase()}`;
          runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
        },
        emit(event: string, ...args: any[]) {
          const key = `player::${p.id}::${event.toLowerCase()}`;
          for (const h of runner.objHandlers.get(key) ?? []) {
            try { h(...args); } catch { /* isolate */ }
          }
          return true;
        },
        setAttribute(_k: string, _v: any) {},
        getAttribute(_k: string) { return undefined; },

        // Legacy aliases
        get Name()       { return p.name; },
        get UserId()     { return p.id; },
        get Health()       { return p.health; },
        set Health(v:any)  { const n=Math.max(0,+v); p.health=n; mut().health=n; },
        get WalkSpeed()    { return p.speed; },
        set WalkSpeed(v:any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
        get Speed()        { return p.speed; },
        set Speed(v:any)   { const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
        get JumpPower()    { return p.jumpPower; },
        set JumpPower(v:any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
        get MaxHealth()    { return p.maxHealth; },
        TakeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
        Heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
        Kill()              { p.health=0; mut().health=0; },
        Respawn()           { mut().respawn=true; },
        Teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },
      };

      return pp;
    };

    // ── Rebur.Gui (shared HUD, new ID-based API) ──────────────────────────
    const reburGui = {
      text(id: string, text: string, opts?: any) {
        runner.guiElements.set(id, { id, kind:"text", text, ...mapGuiOpts(opts), visible:true });
      },
      button(id: string, text: string, opts?: any, onClick?: EventHandler) {
        runner.guiElements.set(id, { id, kind:"button", text, width:160, height:36, ...mapGuiOpts(opts), visible:true, clickable:true });
        if (onClick) runner.guiClickHandlers.set(id, onClick);
      },
      bar(id: string, value: number, maxValue: number, opts?: any) {
        runner.guiElements.set(id, { id, kind:"bar", value, maxValue, width:200, height:14, ...mapGuiOpts(opts), visible:true });
      },
      image(id: string, url: string, opts?: any) {
        runner.guiElements.set(id, { id, kind:"image", imageUrl:url, width:64, height:64, ...mapGuiOpts(opts), visible:true });
      },
      clear(id?: string) {
        if (id !== undefined) { runner.guiElements.delete(id); runner.guiClickHandlers.delete(id); }
        else { runner.guiElements.clear(); runner.guiClickHandlers.clear(); }
      },
    };

    // ── Rebur.State ───────────────────────────────────────────────────────
    const reburState = {
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
    };

    // ── Rebur.DataStore (in-memory persistent, per-session) ───────────────
    const reburDataStore = {
      get(key: string) { return runner.dataStore.get(key); },
      set(key: string, value: any) { runner.dataStore.set(key, value); },
      delete(key: string) { runner.dataStore.delete(key); },
      increment(key: string, amount = 1) {
        const n = (runner.dataStore.get(key) ?? 0) + amount;
        runner.dataStore.set(key, n);
        return n;
      },
      keys() { return Array.from(runner.dataStore.keys()); },
    };

    // ── Rebur.Scene ───────────────────────────────────────────────────────
    const reburScene = {
      find(name: string) {
        const obj = runner.objects.get(name);
        if (!obj || obj._destroyed) return null;
        return makeEntityProxy(obj);
      },
      findById(id: string) {
        for (const obj of runner.objects.values()) {
          if (obj.id === id && !obj._destroyed) return makeEntityProxy(obj);
        }
        return null;
      },
      all() {
        return Array.from(runner.objects.values())
          .filter(o => !o._destroyed)
          .map(o => makeEntityProxy(o));
      },
      query(filter: any) {
        let results = Array.from(runner.objects.values()).filter(o => !o._destroyed);

        if (filter?.tag) {
          const names = runner.tagMap.get(filter.tag) ?? new Set();
          results = results.filter(o => names.has(o.name));
        }
        if (filter?.tags) {
          for (const tag of filter.tags) {
            const names = runner.tagMap.get(tag) ?? new Set();
            results = results.filter(o => names.has(o.name));
          }
        }
        if (filter?.type) {
          results = results.filter(o => (o as any).type === filter.type || "primitive" === filter.type);
        }
        if (filter?.where) {
          results = results.filter(o => {
            try { return filter.where(makeEntityProxy(o)); } catch { return false; }
          });
        }
        const proxies = results.map(o => makeEntityProxy(o));
        return filter?.limit ? proxies.slice(0, filter.limit) : proxies;
      },
      raycast(_origin: any, _direction: any, _opts?: any) {
        // Stub — returns null until physics-side raycast is implemented
        return null;
      },
      create(opts: any) {
        const name = opts.name ?? `Part_${++runner.timerIdCounter}`;
        const px = +(opts.position?.x ?? opts.x ?? 0);
        const py = +(opts.position?.y ?? opts.y ?? 5);
        const pz = +(opts.position?.z ?? opts.z ?? 0);
        const sx = +(opts.scale?.x ?? opts.size?.x ?? 1);
        const sy = +(opts.scale?.y ?? opts.size?.y ?? 1);
        const sz = +(opts.scale?.z ?? opts.size?.z ?? 1);
        runner.createdObjects.push({
          name,
          primitiveType: opts.primitiveType ?? opts.type ?? "cube",
          positionX: px, positionY: py, positionZ: pz,
          rotationX: +(opts.rotation?.x??0), rotationY: +(opts.rotation?.y??0), rotationZ: +(opts.rotation?.z??0),
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          anchored: opts.anchored ?? false,
          canCollide: opts.canCollide !== false,
          transparency: +(opts.transparency ?? 0),
          isTrigger: !!opts.isTrigger,
        });
        // Return a proxy for the not-yet-spawned object (will be available next tick)
        const placeholder: ScriptObjState = {
          id: `pending_${name}`, name,
          positionX: px, positionY: py, positionZ: pz,
          rotationX: 0, rotationY: 0, rotationZ: 0,
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          visible: true, anchored: opts.anchored ?? false,
          velX: 0, velY: 0, velZ: 0,
          transparency: +(opts.transparency ?? 0),
          canCollide: opts.canCollide !== false,
        };
        runner.objects.set(name, placeholder);
        return makeEntityProxy(placeholder);
      },
    };

    // ── Rebur.Players ─────────────────────────────────────────────────────
    const reburPlayers = {
      all() { return Array.from(runner.players.values()).map(p => makePlayerProxy(p)); },
      find(username: string) {
        for (const p of runner.players.values()) {
          if (p.name === username) return makePlayerProxy(p);
        }
        return null;
      },
      get(id: string) {
        const p = runner.players.get(id);
        return p ? makePlayerProxy(p) : null;
      },
    };

    // ── Rebur.Tags ────────────────────────────────────────────────────────
    const reburTags = {
      add(entityOrName: any, tag: string) {
        const name = typeof entityOrName === "string" ? entityOrName : entityOrName?.name;
        if (!name) return;
        if (!runner.tagMap.has(tag)) runner.tagMap.set(tag, new Set());
        runner.tagMap.get(tag)!.add(name);
        if (!runner.entityTags.has(name)) runner.entityTags.set(name, new Set());
        runner.entityTags.get(name)!.add(tag);
        if (runner.objects.has(name)) {
          const obj = runner.objects.get(name)!;
          if (!obj._tags) obj._tags = new Set();
          obj._tags.add(tag);
        }
      },
      remove(entityOrName: any, tag: string) {
        const name = typeof entityOrName === "string" ? entityOrName : entityOrName?.name;
        if (!name) return;
        runner.tagMap.get(tag)?.delete(name);
        runner.entityTags.get(name)?.delete(tag);
        runner.objects.get(name)?._tags?.delete(tag);
      },
      has(entityOrName: any, tag: string) {
        const name = typeof entityOrName === "string" ? entityOrName : entityOrName?.name;
        return runner.tagMap.get(tag)?.has(name) ?? false;
      },
      get(tag: string) {
        const names = runner.tagMap.get(tag) ?? new Set();
        const results: any[] = [];
        for (const name of names) {
          const obj = runner.objects.get(name);
          if (obj && !obj._destroyed) results.push(makeEntityProxy(obj));
        }
        return results;
      },
      all(entityOrName: any) {
        const name = typeof entityOrName === "string" ? entityOrName : entityOrName?.name;
        return Array.from(runner.entityTags.get(name) ?? []);
      },
    };

    // ── Rebur.Sound ───────────────────────────────────────────────────────
    const reburSound = {
      play(id: string, opts?: { volume?: number; loop?: boolean }) {
        runner.soundQueue.push({ soundId: id, options: opts });
      },
      stop(_id: string) { /* stub — stop is client-side */ },
    };

    // ── Rebur.Tween ───────────────────────────────────────────────────────
    const reburTween = (
      target: any,
      to: Record<string, number>,
      duration: number,
      easing?: string | ((t: number) => number),
      onDone?: () => void
    ) => {
      const easeFn = typeof easing === "function" ? easing : (EASINGS[easing as string] ?? EASINGS.linear);
      const from: Record<string, number> = {};
      for (const key of Object.keys(to)) {
        try { from[key] = +(target[key] ?? 0); } catch { from[key] = 0; }
      }
      const entry: TweenEntry = { target, to, from, elapsed: 0, duration: Math.max(duration, 0.001), easing: easeFn, onDone, cancelled: false };
      runner.tweens.push(entry);
      return () => { entry.cancelled = true; };
    };

    // ── Rebur.Camera ──────────────────────────────────────────────────────
    const reburCamera = new Proxy(runner.cameraSettings, {
      get(t, key: string) { return t[key]; },
      set(t, key: string, val) { t[key] = val; return true; },
    });

    // ── Rebur.Input ───────────────────────────────────────────────────────
    const reburInput = {
      onPress(key: string, fn: EventHandler) {
        const k = key.toLowerCase();
        if (!runner.inputPressHandlers.has(k)) runner.inputPressHandlers.set(k, []);
        runner.inputPressHandlers.get(k)!.push(fn);
        return () => runner.inputPressHandlers.set(k, (runner.inputPressHandlers.get(k)??[]).filter(h=>h!==fn));
      },
      onRelease(key: string, fn: EventHandler) {
        const k = key.toLowerCase();
        if (!runner.inputReleaseHandlers.has(k)) runner.inputReleaseHandlers.set(k, []);
        runner.inputReleaseHandlers.get(k)!.push(fn);
        return () => runner.inputReleaseHandlers.set(k, (runner.inputReleaseHandlers.get(k)??[]).filter(h=>h!==fn));
      },
      isDown(_key: string) { return false; /* stub — requires client polling */ },
      onMouseClick(fn: EventHandler) {
        runner.mouseClickHandlers.push(fn);
        return () => { const i = runner.mouseClickHandlers.indexOf(fn); if (i >= 0) runner.mouseClickHandlers.splice(i, 1); };
      },
    };

    // ── Rebur.Physics ─────────────────────────────────────────────────────
    const reburPhysics = new Proxy(runner.physicsSettings, {
      get(t, key: string) { return (t as any)[key]; },
      set(t, key: string, val) { (t as any)[key] = val; return true; },
    });

    // ── Rebur.RunService ──────────────────────────────────────────────────
    const reburRunService = {
      on(phase: string, fn: EventHandler) {
        // All phases map to tick for now; future: separate phase queues
        const key = "tick";
        const arr = runner.globalHandlers.get(key) ?? [];
        arr.push(fn);
        runner.globalHandlers.set(key, arr);
        return () => runner.globalHandlers.set(key, (runner.globalHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(_phase: string, fn: EventHandler) {
        runner.globalHandlers.set("tick", (runner.globalHandlers.get("tick")??[]).filter(h=>h!==fn));
      },
    };

    // ── Rebur.Network ─────────────────────────────────────────────────────
    const reburNetwork = {
      broadcast(event: string, payload: any) {
        runner.networkMessages.push({ event, payload });
      },
      broadcastTo(playerOrId: any, event: string, payload: any) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        if (id) runner.networkToPlayer.push({ playerId: id, event, payload });
      },
      on(event: string, fn: EventHandler) {
        const arr = runner.networkHandlers.get(event) ?? [];
        arr.push(fn);
        runner.networkHandlers.set(event, arr);
        return () => runner.networkHandlers.set(event, (runner.networkHandlers.get(event)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        runner.networkHandlers.set(event, (runner.networkHandlers.get(event)??[]).filter(h=>h!==fn));
      },
      send(_event: string, _payload: any) { /* client-only stub */ },
      onMessage(_event: string, _fn: EventHandler) { return () => {}; /* client-only stub */ },
    };

    // ── Event name mapping (Rebur.on "playerJoined" → internal "playeradded") ─
    const EVENT_MAP: Record<string, string> = {
      playerjoined: "playeradded",
      playerleft: "playerremoving",
      playerjoins: "playeradded",
      playerleaves: "playerremoving",
    };

    // ── Rebur global object ───────────────────────────────────────────────
    const Rebur = {
      on(event: string, fn: EventHandler) {
        const key = EVENT_MAP[event.toLowerCase()] ?? event.toLowerCase();
        const arr = runner.globalHandlers.get(key) ?? [];
        arr.push(fn);
        runner.globalHandlers.set(key, arr);
        return () => runner.globalHandlers.set(key, (runner.globalHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const key = EVENT_MAP[event.toLowerCase()] ?? event.toLowerCase();
        runner.globalHandlers.set(key, (runner.globalHandlers.get(key)??[]).filter(h=>h!==fn));
      },

      Scene:      reburScene,
      Players:    reburPlayers,
      Lighting:   { find:()=>null, findById:()=>null, all:()=>[], query:()=>[], create:()=>null },
      Storage:    { find:()=>null, findById:()=>null, all:()=>[], query:()=>[], create:()=>null },
      State:      reburState,
      DataStore:  reburDataStore,
      Gui:        reburGui,
      Sound:      reburSound,
      Tween:      reburTween,
      Camera:     reburCamera,
      Input:      reburInput,
      Physics:    reburPhysics,
      RunService: reburRunService,
      Network:    reburNetwork,
      Tags:       reburTags,
    };

    // ── Legacy game API ───────────────────────────────────────────────────
    const _create = reburScene.create.bind(reburScene);
    const gameAPI = {
      on(event: string, fn: EventHandler) { return Rebur.on(event, fn); },
      state: reburState,
      sound: reburSound,
      tween: reburTween,
      create: _create,
      find(name: string) { return reburScene.find(name); },
      destroy(name: string) { const obj = runner.objects.get(name); if (obj) { obj._destroyed=true; obj.visible=false; runner.destroyQueue.push(name); } },
      log, print: log,
    };

    const legacyWorkspace = new Proxy({} as any, {
      get(_t, name: string|symbol) {
        if (typeof name !== "string") return undefined;
        const obj = runner.objects.get(name);
        if (obj && !obj._destroyed) return makeEntityProxy(obj);
        return makeNullProxy(name);
      },
      has(_t, name: string|symbol) { return typeof name === "string" && runner.objects.has(name); },
      ownKeys() { return Array.from(runner.objects.keys()); },
    });

    const legacyPlayers = new Proxy({} as any, {
      get(_t, name: string|symbol) {
        if (typeof name !== "string") return undefined;
        if (name === "GetPlayers" || name === "getPlayers" || name === "all") {
          return () => Array.from(runner.players.values()).map(p => makePlayerProxy(p));
        }
        if (name === "find" || name === "Find") {
          return (username: string) => reburPlayers.find(username);
        }
        if (name === "get" || name === "Get") {
          return (id: string) => reburPlayers.get(id);
        }
        for (const p of runner.players.values()) {
          if (p.name === name) return makePlayerProxy(p);
        }
        return undefined;
      },
    });

    function makeNullProxy(name: string): any {
      let warned = false;
      const warn2 = () => { if (!warned) { warned = true; log(`Warning: entity "${name}" not found or destroyed`); } };
      return new Proxy({} as any, {
        get(_t, prop: string|symbol) { warn2(); const p=String(prop); if(p==="on"||p==="off"||p==="emit") return ()=>()=>{}; if(p==="body") return {anchored:false,canCollide:true,isTrigger:false}; return undefined; },
        set() { return true; },
      });
    }

    // ── Build VM context ──────────────────────────────────────────────────
    const ctx = createContext({
      // Primary API
      Rebur,

      // Top-level helpers
      after, every, wait,
      random, randInt, pick,
      log, print: log, warn, error,

      // Math/data types
      Vector3, Color3,
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite, Symbol, Promise,

      // Timer primitives
      setTimeout: _setTimeout, setInterval: _setInterval,
      clearTimeout: _clearTimeout, clearInterval: _clearInterval,

      // Legacy APIs (backward compat)
      Scene: legacyWorkspace,
      workspace: legacyWorkspace,
      Players: legacyPlayers,
      game: gameAPI,
      gui: reburGui,
      find: (name: string) => reburScene.find(name),
      destroy: gameAPI.destroy,

      runService: {
        on: (_ev: string, fn: EventHandler) => Rebur.on("tick", fn),
        Heartbeat: { Connect: (fn: EventHandler) => Rebur.on("tick", fn) },
      },

      task: {
        wait: (s = 0) => wait(s),
        delay: (s: number, fn: EventHandler) => { after(s, fn); },
        spawn: (fn: EventHandler) => { _setTimeout(fn, 0); },
      },

      // Blocked for security
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

    // Advance tweens (target-based, works with entity proxies)
    const done: number[] = [];
    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i];
      if (tw.cancelled) { done.push(i); continue; }
      tw.elapsed += dt;
      const t  = Math.min(tw.elapsed / tw.duration, 1);
      const et = tw.easing(t);
      for (const [key, toVal] of Object.entries(tw.to)) {
        try { tw.target[key] = tw.from[key] + (toVal - tw.from[key]) * et; } catch { /* proxy may be stale */ }
      }
      if (t >= 1) { try { tw.onDone?.(); } catch { /* isolate */ } done.push(i); }
    }
    for (let i = done.length - 1; i >= 0; i--) this.tweens.splice(done[i], 1);

    this._fireGlobal("tick", dt);
  }

  // ── Global event firing ─────────────────────────────────────────────────────

  firePlayerAdded(player: ScriptPlayerState) {
    this._fireGlobal("playeradded", this._makePlayerProxy(player));
    this._fireGlobal("playerjoined", this._makePlayerProxy(player));
  }
  firePlayerRemoving(player: ScriptPlayerState) {
    this._fireGlobal("playerremoving", this._makePlayerProxy(player));
    this._fireGlobal("playerleft", this._makePlayerProxy(player));
  }
  firePlayerDied(player: ScriptPlayerState)    { this._fireGlobal("playerdied", this._makePlayerProxy(player)); }
  firePlayerSpawned(player: ScriptPlayerState) { this._fireGlobal("playerspawned", this._makePlayerProxy(player)); this._fireGlobal("playerrespawned", this._makePlayerProxy(player)); }

  fireTouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "touched", this._makePlayerProxy(player));
  }
  fireUntouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "untouched", this._makePlayerProxy(player));
  }
  fireObjClicked(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "clicked", this._makePlayerProxy(player));
  }
  fireObjEvent(objName: string, event: string, ...args: any[]) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }
  fireNetworkMessage(event: string, payload: any, sender: ScriptPlayerState) {
    const handlers = this.networkHandlers.get(event) ?? [];
    for (const h of handlers) {
      try { h(payload, this._makePlayerProxy(sender)); } catch { /* isolate */ }
    }
  }
  fireInputPress(key: string, player: ScriptPlayerState) {
    const handlers = this.inputPressHandlers.get(key.toLowerCase()) ?? [];
    for (const h of handlers) { try { h(this._makePlayerProxy(player)); } catch { /* isolate */ } }
  }
  fireInputRelease(key: string, player: ScriptPlayerState) {
    const handlers = this.inputReleaseHandlers.get(key.toLowerCase()) ?? [];
    for (const h of handlers) { try { h(this._makePlayerProxy(player)); } catch { /* isolate */ } }
  }
  fireMouseClick(entityName: string | null, player: ScriptPlayerState) {
    const entityProxy = entityName ? this._makeEntityProxyById(entityName) : null;
    for (const h of this.mouseClickHandlers) { try { h(entityProxy, this._makePlayerProxy(player)); } catch { /* isolate */ } }
    if (entityName) this._fireObj(entityName, "clicked", this._makePlayerProxy(player));
  }

  // ── Logs & GUI ──────────────────────────────────────────────────────────────

  drainLogs(): string[] { const l = [...this.logs]; this.logs = []; return l; }
  getGuiElements(): GuiElement[] { return Array.from(this.guiElements.values()); }
  getGuiElementsForPlayer(playerId: string): GuiElement[] {
    const global = Array.from(this.guiElements.values());
    const perPlayer = Array.from(this.playerGuiElements.get(playerId)?.values() ?? []);
    return [...global, ...perPlayer];
  }
  fireGuiClick(elementId: string, player: ScriptPlayerState) {
    const perPlayerHandlers = this.playerGuiClickHandlers.get(player.id);
    const ph = perPlayerHandlers?.get(elementId);
    if (ph) { try { ph(this._makePlayerProxy(player)); } catch { /* isolate */ } return; }
    const h = this.guiClickHandlers.get(elementId);
    if (h) try { h(this._makePlayerProxy(player)); } catch { /* isolate */ }
  }
  clearPlayerGui(playerId: string) {
    this.playerGuiElements.delete(playerId);
    this.playerGuiClickHandlers.delete(playerId);
  }

  // ── Drain queues (called by GameRoom each tick) ─────────────────────────────

  drainSounds(): ScriptSoundEvent[] { const s = [...this.soundQueue]; this.soundQueue = []; return s; }
  drainCreatedObjects(): ScriptCreatedObject[] { const o = [...this.createdObjects]; this.createdObjects = []; return o; }
  drainDestroyQueue(): string[] { const d = [...this.destroyQueue]; this.destroyQueue = []; return d; }
  drainNetworkMessages(): NetworkMessage[] { const m = [...this.networkMessages]; this.networkMessages = []; return m; }
  drainNetworkToPlayer(): NetworkToPlayer[] { const m = [...this.networkToPlayer]; this.networkToPlayer = []; return m; }
  drainAllPlayerMutations(): Map<string, ScriptPlayerMutation> {
    const m = new Map(this.playerMutations); this.playerMutations.clear(); return m;
  }
  getCameraSettings() { return { ...this.cameraSettings }; }
  getPhysicsSettings() { return { ...this.physicsSettings }; }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _fireGlobal(event: string, ...args: any[]) {
    for (const h of this.globalHandlers.get(event) ?? []) {
      try { h(...args); } catch { /* isolate */ }
    }
  }
  _fireObj(objName: string, event: string, ...args: any[]) {
    const key = `${objName}::${event}`;
    for (const h of this.objHandlers.get(key) ?? []) {
      try { h(...args); } catch { /* isolate */ }
    }
  }

  private _makePlayerProxy(p: ScriptPlayerState): any {
    // Build a minimal proxy for use in event firing
    const mut = (): ScriptPlayerMutation => {
      let m = this.playerMutations.get(p.id);
      if (!m) { m = {}; this.playerMutations.set(p.id, m); }
      return m;
    };
    return {
      id: p.id, username: p.name, name: p.name, isPlayer: true, destroyed: false,
      position: { x: p.position.x, y: p.position.y, z: p.position.z },
      rotation: { x: 0, y: 0, z: 0 },
      get health()        { return p.health; },
      set health(v:any)   { const n=Math.max(0,+v); p.health=n; mut().health=n; },
      get maxHealth()     { return p.maxHealth; },
      get walkSpeed()     { return p.speed; },
      set walkSpeed(v:any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get jumpPower()     { return p.jumpPower; },
      set jumpPower(v:any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
      get color()         { return p.shirtColor; },
      set color(v:any)    { p.shirtColor=String(v); mut().shirtColor=String(v); },
      get onGround()      { return p.onGround ?? false; },
      takeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
      heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
      kill()              { p.health=0; mut().health=0; },
      respawn()           { mut().respawn=true; },
      teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },
      // Legacy
      Name: p.name, UserId: p.id,
      get Health()        { return p.health; },
      set Health(v:any)   { const n=Math.max(0,+v); p.health=n; mut().health=n; },
      get WalkSpeed()     { return p.speed; },
      set WalkSpeed(v:any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get Speed()         { return p.speed; },
      set Speed(v:any)    { const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get JumpPower()     { return p.jumpPower; },
      set JumpPower(v:any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
      TakeDamage(n:number){ const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
      Heal(n:number)      { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
      Kill()              { p.health=0; mut().health=0; },
      Respawn()           { mut().respawn=true; },
      Teleport(x:number,y:number,z:number){ mut().teleport={x,y,z}; },
      gui: {
        text: (id: string, text: string, opts?: any) => {
          const m = this.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          this.playerGuiElements.set(p.id, m);
          m.set(id, { id, kind:"text", text, ...mapGuiOpts(opts), visible:true });
        },
        button: (id: string, text: string, opts?: any, onClick?: any) => {
          const m = this.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          this.playerGuiElements.set(p.id, m);
          const h = this.playerGuiClickHandlers.get(p.id) ?? new Map<string, EventHandler>();
          this.playerGuiClickHandlers.set(p.id, h);
          m.set(id, { id, kind:"button", text, width:160, height:36, ...mapGuiOpts(opts), visible:true, clickable:true });
          if (onClick) h.set(id, onClick);
        },
        bar: (id: string, value: number, maxValue: number, opts?: any) => {
          const m = this.playerGuiElements.get(p.id) ?? new Map<string, GuiElement>();
          this.playerGuiElements.set(p.id, m);
          m.set(id, { id, kind:"bar", value, maxValue, width:200, height:14, ...mapGuiOpts(opts), visible:true });
        },
        clear: (id?: string) => {
          const map = this.playerGuiElements.get(p.id);
          const hs  = this.playerGuiClickHandlers.get(p.id);
          if (id !== undefined) { map?.delete(id); hs?.delete(id); }
          else { map?.clear(); hs?.clear(); }
        },
      },
      data: {
        get: (key:string) => { if (!this.playerData.has(p.id)) this.playerData.set(p.id, new Map()); return this.playerData.get(p.id)!.get(key); },
        set: (key:string, value:any) => { if (!this.playerData.has(p.id)) this.playerData.set(p.id, new Map()); this.playerData.get(p.id)!.set(key, value); },
        delete: (key:string) => { this.playerData.get(p.id)?.delete(key); },
        increment: (key:string, amount=1) => { if (!this.playerData.has(p.id)) this.playerData.set(p.id, new Map()); const d=this.playerData.get(p.id)!; const n=(d.get(key)??0)+amount; d.set(key,n); return n; },
        getAll: () => Object.fromEntries(this.playerData.get(p.id) ?? []),
      },
      animator: { current:null, playing:false, play(){}, stop(){}, on(){ return ()=>{}; } },
      inventory: { items:[], maxSlots:36, equipped:null, add(){return null;}, remove(){return 0;}, has(){return false;}, get(){return null;}, equip(){return false;}, drop(){return null;}, clear(){} },
      motors: { attach(){}, detach(){return null;}, get(){return null;} },
    };
  }

  private _makeEntityProxyById(nameOrId: string): any {
    const obj = this.objects.get(nameOrId);
    if (!obj || obj._destroyed) return null;
    return { name: obj.name, id: obj.id, destroyed: false };
  }
}
