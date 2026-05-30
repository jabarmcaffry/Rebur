/**
 * script-runner.ts — Server-side VM sandbox for Rebur game scripts.
 *
 * Globals available in scripts (exactly as documented):
 *   Rebur — the only engine global
 *   after, every, wait, log, warn, error, random, randInt, pick
 *   Vector3, Color3
 *   Math, JSON, String, Number, Boolean, Array, Object, Date,
 *   parseInt, parseFloat, isNaN, isFinite, Symbol, Promise
 *   Blocked: process, require, fetch, __filename, __dirname
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
  isKinematic?: boolean;
  mass?: number;
  friction?: number;
  restitution?: number;
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
  shirtColor: string;
  skinColor: string;
  pantsColor: string;
  spawnX?: number; spawnY?: number; spawnZ?: number;
  onGround?: boolean;
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
  impulseX?: number; impulseY?: number; impulseZ?: number;
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

// ── Easing functions ──────────────────────────────────────────────────────────

const EASINGS: Record<string, (t: number) => number> = {
  linear:          (t) => t,
  easeInQuad:      (t) => t * t,
  easeOutQuad:     (t) => t * (2 - t),
  easeInOutQuad:   (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic:     (t) => t*t*t,
  easeOutCubic:    (t) => (--t)*t*t+1,
  easeInOutCubic:  (t) => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
  easeInOut:       (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  bounce: (t) => {
    const n1=7.5625, d1=2.75;
    if (t<1/d1)   return n1*t*t;
    if (t<2/d1)   return n1*(t-=1.5/d1)*t+0.75;
    if (t<2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
    return n1*(t-=2.625/d1)*t+0.984375;
  },
  elastic: (t) => t===0?0:t===1?1:(-Math.pow(2,10*(t-1))*Math.sin((t-1.1)*5*Math.PI)),
};

// ── GUI anchor mapping ────────────────────────────────────────────────────────

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
  private guiElements            = new Map<string, GuiElement>();
  private playerGuiElements      = new Map<string, Map<string, GuiElement>>();
  private playerGuiClickHandlers = new Map<string, Map<string, EventHandler>>();

  private timerQueue   = new Map<number, TimerEntry>();
  timerIdCounter       = 0;

  private tweens: TweenEntry[]             = [];
  private playerMutations                  = new Map<string, ScriptPlayerMutation>();
  private soundQueue: ScriptSoundEvent[]   = [];
  private createdObjects: ScriptCreatedObject[] = [];
  private destroyQueue: string[]           = [];
  private gameState                        = new Map<string, any>();
  private stateHandlers                    = new Map<string, Array<(val: any, prev: any) => void>>();
  private dataStore                        = new Map<string, any>();
  private playerData                       = new Map<string, Map<string, any>>();
  private networkMessages: NetworkMessage[] = [];
  private networkToPlayer: NetworkToPlayer[] = [];
  private networkHandlers                  = new Map<string, EventHandler[]>();
  private tagMap                           = new Map<string, Set<string>>();
  private entityTags                       = new Map<string, Set<string>>();

  // Input — unified event map keyed by "press" | "release" | "mouseclick"
  private inputHandlers = new Map<string, EventHandler[]>();
  // Keys currently held by any player in this room
  private heldKeys = new Set<string>();

  // Camera is a plain writable store — no preset modes
  private cameraSettings: Record<string, any> = {};
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
    const log   = makeLog("");
    const warn  = makeLog("warn:");
    const error = makeLog("error:");

    const runner = this;

    // ── Timers (internal — NOT exposed in VM context) ──────────────────────
    const _setTimeout = (fn: EventHandler, ms: number) => {
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

    // ── Documented timer globals ───────────────────────────────────────────
    const after = (seconds: number, fn: EventHandler) => {
      const id = _setTimeout(fn, seconds * 1000);
      return () => runner.timerQueue.delete(id);
    };
    const every = (seconds: number, fn: EventHandler) => {
      const id = _setInterval(fn, seconds * 1000);
      return () => runner.timerQueue.delete(id);
    };
    const wait = (seconds = 0) => new Promise<void>((resolve) => {
      _setTimeout(resolve, seconds * 1000);
    });

    // ── Utility globals ────────────────────────────────────────────────────
    const random = (min = 0, max = 1) => min + Math.random() * (max - min);
    const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

    // ── Vector3 ───────────────────────────────────────────────────────────
    function mkVec3(x = 0, y = 0, z = 0) {
      const v: any = { x, y, z };
      Object.defineProperty(v, "magnitude", { get() { return Math.sqrt(x*x+y*y+z*z); } });
      v.add       = (o: any) => mkVec3(x+(o.x??0), y+(o.y??0), z+(o.z??0));
      v.sub       = (o: any) => mkVec3(x-(o.x??0), y-(o.y??0), z-(o.z??0));
      v.scale     = (s: number) => mkVec3(x*s, y*s, z*s);
      v.normalize = () => { const m = Math.sqrt(x*x+y*y+z*z)||1; return mkVec3(x/m,y/m,z/m); };
      v.dot       = (o: any) => x*(o.x??0)+y*(o.y??0)+z*(o.z??0);
      return v;
    }
    const Vector3 = Object.assign(
      (x=0,y=0,z=0) => mkVec3(x,y,z),
      { zero:()=>mkVec3(0,0,0), one:()=>mkVec3(1,1,1),
        up:()=>mkVec3(0,1,0), right:()=>mkVec3(1,0,0), forward:()=>mkVec3(0,0,-1) }
    );

    // ── Color3 ────────────────────────────────────────────────────────────
    const Color3 = Object.assign(
      (r=0,g=0,b=0) => `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
      { fromRGB:(r=0,g=0,b=0)=>`rgb(${r},${g},${b})`, fromHex:(h:string)=>h }
    );

    // ── Internal engine events (scripts cannot emit these) ────────────────
    const INTERNAL_ENTITY_EVENTS = new Set([
      "touched", "untouched", "touchstarted", "touchended",
      "clicked", "destroyed", "woke", "slept",
      "collisionstarted", "collisionended",
      "propertychanged", "changed",
    ]);

    // ── Entity proxy ──────────────────────────────────────────────────────
    const makeEntityProxy = (obj: ScriptObjState): any => {
      const makePosProxy = () => new Proxy({} as any, {
        get(_t, p: string) {
          if (p==='x') return obj.positionX;
          if (p==='y') return obj.positionY;
          if (p==='z') return obj.positionZ;
        },
        set(_t, p: string, v: any) {
          if (p==='x') { obj.positionX = +v; return true; }
          if (p==='y') { obj.positionY = +v; return true; }
          if (p==='z') { obj.positionZ = +v; return true; }
          return true;
        },
      });
      const makeRotProxy = () => new Proxy({} as any, {
        get(_t, p: string) {
          if (p==='x') return obj.rotationX;
          if (p==='y') return obj.rotationY;
          if (p==='z') return obj.rotationZ;
        },
        set(_t, p: string, v: any) {
          if (p==='x') { obj.rotationX = +v; return true; }
          if (p==='y') { obj.rotationY = +v; return true; }
          if (p==='z') { obj.rotationZ = +v; return true; }
          return true;
        },
      });
      const makeScaleProxy = () => new Proxy({} as any, {
        get(_t, p: string) {
          if (p==='x') return obj.scaleX;
          if (p==='y') return obj.scaleY;
          if (p==='z') return obj.scaleZ;
        },
        set(_t, p: string, v: any) {
          if (p==='x') { obj.scaleX = +v; return true; }
          if (p==='y') { obj.scaleY = +v; return true; }
          if (p==='z') { obj.scaleZ = +v; return true; }
          return true;
        },
      });

      let _posProxy: any = null;
      let _rotProxy: any = null;
      let _scaleProxy: any = null;

      const body = {
        get anchored()      { return obj.anchored; },
        set anchored(v)     { obj.anchored = Boolean(v); },
        get canCollide()    { return obj.canCollide !== false; },
        set canCollide(v)   { obj.canCollide = Boolean(v); },
        get isTrigger()     { return obj.isTrigger ?? false; },
        set isTrigger(v)    { obj.isTrigger = Boolean(v); },
        get isKinematic()   { return obj.isKinematic ?? false; },
        set isKinematic(v)  { obj.isKinematic = Boolean(v); },
        get mass()          { return obj.mass ?? 1; },
        set mass(v)         { obj.mass = Math.max(0.01, +v); },
        get friction()      { return obj.friction ?? 0.5; },
        set friction(v)     { obj.friction = Math.max(0, +v); },
        get restitution()   { return obj.restitution ?? 0; },
        set restitution(v)  { obj.restitution = Math.max(0, Math.min(1, +v)); },
        get velocity()      { return { x: obj.velX, y: obj.velY, z: obj.velZ }; },
        get angularVelocity() { return { x: 0, y: 0, z: 0 }; },
        applyForce(f: any) {
          obj.forceX = (obj.forceX ?? 0) + (+(f?.x ?? 0));
          obj.forceY = (obj.forceY ?? 0) + (+(f?.y ?? 0));
          obj.forceZ = (obj.forceZ ?? 0) + (+(f?.z ?? 0));
        },
        applyImpulse(f: any) {
          obj.impulseX = (obj.impulseX ?? 0) + (+(f?.x ?? 0));
          obj.impulseY = (obj.impulseY ?? 0) + (+(f?.y ?? 0));
          obj.impulseZ = (obj.impulseZ ?? 0) + (+(f?.z ?? 0));
        },
        applyTorque(_t: any) { /* stub */ },
        setVelocity(v: any)  { obj.velX = +(v?.x??0); obj.velY = +(v?.y??0); obj.velZ = +(v?.z??0); },
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
          obj.positionX = +(v?.x ?? obj.positionX);
          obj.positionY = +(v?.y ?? obj.positionY);
          obj.positionZ = +(v?.z ?? obj.positionZ);
          _posProxy = null;
        },
        get rotation() {
          if (!_rotProxy) _rotProxy = makeRotProxy();
          return _rotProxy;
        },
        set rotation(v: any) {
          obj.rotationX = +(v?.x ?? obj.rotationX);
          obj.rotationY = +(v?.y ?? obj.rotationY);
          obj.rotationZ = +(v?.z ?? obj.rotationZ);
          _rotProxy = null;
        },
        get scale() {
          if (!_scaleProxy) _scaleProxy = makeScaleProxy();
          return _scaleProxy;
        },
        set scale(v: any) {
          obj.scaleX = +(v?.x ?? obj.scaleX);
          obj.scaleY = +(v?.y ?? obj.scaleY);
          obj.scaleZ = +(v?.z ?? obj.scaleZ);
          _scaleProxy = null;
        },

        get color()        { return obj.color; },
        set color(v)       { obj.color = String(v); },
        get visible()      { return obj.visible; },
        set visible(v)     { obj.visible = Boolean(v); },
        get transparency() { return obj.transparency ?? 0; },
        set transparency(v){ obj.transparency = Math.max(0, Math.min(1, +v)); },

        get body()     { return body; },
        get parent()   { return null; },
        get children() { return []; },

        find(_n: string) { return null; },
        setParent(_p: any) { /* stub */ },

        destroy() {
          if (obj._destroyed) return;
          obj._destroyed = true;
          obj.visible = false;
          runner.destroyQueue.push(obj.name);
          runner._fireObj(obj.name, "destroyed");
          runner._fireGlobal("entityremoved", ep);
        },

        on(event: string, fn: EventHandler) {
          if (obj._destroyed) {
            warn(`on() called on destroyed entity "${obj.name}"`);
            return () => {};
          }
          const key = `${obj.name}::${event.toLowerCase()}`;
          const arr = runner.objHandlers.get(key) ?? [];
          arr.push(fn);
          runner.objHandlers.set(key, arr);
          return () => runner.objHandlers.set(
            key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn)
          );
        },
        off(event: string, fn: EventHandler) {
          const key = `${obj.name}::${event.toLowerCase()}`;
          runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
        },
        emit(event: string, ...args: any[]) {
          if (obj._destroyed) {
            warn(`emit() called on destroyed entity "${obj.name}"`);
            return false;
          }
          const evtLower = event.toLowerCase();
          if (INTERNAL_ENTITY_EVENTS.has(evtLower)) {
            warn(`Cannot emit internal event "${event}" on "${obj.name}" — engine fires these automatically. Use a custom event name instead.`);
            return false;
          }
          runner._fireObj(obj.name, evtLower, ...args);
          return true;
        },
        setAttribute(key: string, value: any) {
          if (!obj._attrs) obj._attrs = new Map();
          obj._attrs.set(key, value);
        },
        getAttribute(key: string) {
          return obj._attrs?.get(key);
        },
      };

      return ep;
    };

    // ── Player entity proxy ────────────────────────────────────────────────
    const makePlayerProxy = (p: ScriptPlayerState): any => {
      const mut = (): ScriptPlayerMutation => {
        let m = runner.playerMutations.get(p.id);
        if (!m) { m = {}; runner.playerMutations.set(p.id, m); }
        return m;
      };

      const getPlayerMap = () => {
        if (!runner.playerGuiElements.has(p.id)) runner.playerGuiElements.set(p.id, new Map());
        return runner.playerGuiElements.get(p.id)!;
      };
      const getPlayerHandlers = () => {
        if (!runner.playerGuiClickHandlers.has(p.id)) runner.playerGuiClickHandlers.set(p.id, new Map());
        return runner.playerGuiClickHandlers.get(p.id)!;
      };
      const getPlayerData = () => {
        if (!runner.playerData.has(p.id)) runner.playerData.set(p.id, new Map());
        return runner.playerData.get(p.id)!;
      };

      const gui = {
        text(id: string, text: string, opts?: any) {
          getPlayerMap().set(id, { id, kind:"text", text, ...mapGuiOpts(opts), visible:true });
        },
        button(id: string, text: string, opts?: any, onClick?: EventHandler) {
          getPlayerMap().set(id, { id, kind:"button", text, width:160, height:36, ...mapGuiOpts(opts), visible:true, clickable:true });
          if (onClick) getPlayerHandlers().set(id, onClick);
        },
        bar(id: string, value: number, maxValue: number, opts?: any) {
          getPlayerMap().set(id, { id, kind:"bar", value, maxValue, width:200, height:14, ...mapGuiOpts(opts), visible:true });
        },
        image(id: string, url: string, opts?: any) {
          getPlayerMap().set(id, { id, kind:"image", imageUrl:url, width:64, height:64, ...mapGuiOpts(opts), visible:true });
        },
        clear(id?: string) {
          if (id !== undefined) { getPlayerMap().delete(id); getPlayerHandlers().delete(id); }
          else { getPlayerMap().clear(); getPlayerHandlers().clear(); }
        },
      };

      const data = {
        get(key: string)         { return getPlayerData().get(key); },
        set(key: string, value: any) { getPlayerData().set(key, value); },
        delete(key: string)      { getPlayerData().delete(key); },
        increment(key: string, amount = 1) {
          const d = getPlayerData();
          const n = (d.get(key) ?? 0) + amount;
          d.set(key, n);
          return n;
        },
        getAll() { return Object.fromEntries(getPlayerData()); },
      };

      const animator = {
        current: null as string | null,
        playing: false,
        play(_name: string, _opts?: any) {},
        stop() {},
        on(_ev: string, _fn: any) { return () => {}; },
      };

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

      const motors = {
        attach(_slot: string, _entity: any, _offset?: any) {},
        detach(_slot: string): any { return null; },
        get(_slot: string): any { return null; },
      };

      // Player body — applyImpulse adds to mutation so GameRoom applies it
      const playerBody = {
        applyImpulse(f: any) {
          const m = mut();
          m.impulseX = (m.impulseX ?? 0) + +(f?.x ?? 0);
          m.impulseY = (m.impulseY ?? 0) + +(f?.y ?? 0);
          m.impulseZ = (m.impulseZ ?? 0) + +(f?.z ?? 0);
        },
        applyForce(_f: any)  {},
        setVelocity(_v: any) {},
      };

      return {
        get id()         { return p.id; },
        get name()       { return p.name; },
        get username()   { return p.name; },
        get isPlayer()   { return true; },
        get destroyed()  { return false; },
        get type()       { return "player"; },

        // position and rotation are READ-ONLY for players
        get position()   { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
        set position(_v) { warn("player.position is read-only — use player.teleport(x,y,z)"); },
        get rotation()   { return { x: 0, y: 0, z: 0 }; },
        set rotation(_v) { warn("player.rotation is read-only"); },

        get health()        { return p.health; },
        set health(v: any)  { const n=Math.max(0,+v); p.health=n; mut().health=n; },
        get maxHealth()     { return p.maxHealth; },
        set maxHealth(v: any){ const n=Math.max(1,+v); p.maxHealth=n; mut().maxHealth=n; },
        get walkSpeed()     { return p.speed; },
        set walkSpeed(v: any){ const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
        get runSpeed()      { return p.runSpeed ?? p.speed * 1.6; },
        set runSpeed(v: any) { const n=Math.max(0,+v); p.runSpeed=n; mut().runSpeed=n; },
        get jumpPower()     { return p.jumpPower; },
        set jumpPower(v: any){ const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
        get color()         { return p.shirtColor; },
        set color(v: any)   { p.shirtColor=String(v); mut().shirtColor=String(v); },
        get spawnPoint()    { return { x: p.spawnX??0, y: p.spawnY??0, z: p.spawnZ??0 }; },
        set spawnPoint(v: any) {
          p.spawnX = +(v?.x??0); p.spawnY = +(v?.y??0); p.spawnZ = +(v?.z??0);
          mut().spawnPoint = { x: p.spawnX, y: p.spawnY, z: p.spawnZ };
        },

        get gui()       { return gui; },
        get data()      { return data; },
        get animator()  { return animator; },
        get inventory() { return inventory; },
        get motors()    { return motors; },
        get body()      { return playerBody; },

        takeDamage(n: number) { const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
        heal(n: number)       { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
        kill()                { p.health=0; mut().health=0; },
        respawn()             { mut().respawn=true; },
        teleport(x: number, y: number, z: number) { mut().teleport={x,y,z}; },

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
      };
    };

    // ── Rebur.Gui (shared HUD) ─────────────────────────────────────────────
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

    // ── Rebur.State ────────────────────────────────────────────────────────
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
      keys()   { return Array.from(runner.gameState.keys()); },
      getAll() { return Object.fromEntries(runner.gameState); },
    };

    // ── Rebur.DataStore ────────────────────────────────────────────────────
    const reburDataStore = {
      get(key: string)             { return runner.dataStore.get(key); },
      set(key: string, value: any) { runner.dataStore.set(key, value); },
      delete(key: string)          { runner.dataStore.delete(key); },
      increment(key: string, amount = 1) {
        const n = (runner.dataStore.get(key) ?? 0) + amount;
        runner.dataStore.set(key, n);
        return n;
      },
      keys() { return Array.from(runner.dataStore.keys()); },
    };

    // ── Rebur.Scene ────────────────────────────────────────────────────────
    const reburScene = {
      find(name: string) {
        const obj = runner.objects.get(name);
        return (obj && !obj._destroyed) ? makeEntityProxy(obj) : null;
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
          results = results.filter(o => "primitive" === filter.type || (o as any).type === filter.type);
        }
        if (filter?.where) {
          results = results.filter(o => {
            try { return filter.where(makeEntityProxy(o)); } catch { return false; }
          });
        }
        const proxies = results.map(o => makeEntityProxy(o));
        return filter?.limit ? proxies.slice(0, filter.limit) : proxies;
      },

      // ── AABB ray cast (slab method) ────────────────────────────────────
      raycast(origin: any, direction: any, opts?: any) {
        const ox = +(origin?.x ?? 0);
        const oy = +(origin?.y ?? 0);
        const oz = +(origin?.z ?? 0);
        const maxDist = +(opts?.maxDistance ?? 500);

        // Normalize direction
        const rx = +(direction?.x ?? 0);
        const ry = +(direction?.y ?? 0);
        const rz = +(direction?.z ?? 0);
        const rlen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
        const dx = rx/rlen, dy = ry/rlen, dz = rz/rlen;

        const ignoreNames = new Set<string>(
          ((opts?.ignore ?? []) as any[]).map((e: any) => e?.name).filter(Boolean)
        );
        const filterTag: string | undefined = opts?.tag;

        let best: any = null;

        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (ignoreNames.has(obj.name)) continue;
          if (filterTag && !(runner.tagMap.get(filterTag)?.has(obj.name))) continue;

          const hx = (obj.scaleX ?? 1) / 2;
          const hy = (obj.scaleY ?? 1) / 2;
          const hz = (obj.scaleZ ?? 1) / 2;

          let tMin = 0, tMax = maxDist;
          let normX = 0, normY = 1, normZ = 0;

          // X slab
          if (Math.abs(dx) > 1e-10) {
            let t1 = (obj.positionX - hx - ox) / dx;
            let t2 = (obj.positionX + hx - ox) / dx;
            if (t1 > t2) { const s=t1; t1=t2; t2=s; }
            if (t1 > tMin) { tMin=t1; normX=dx<0?1:-1; normY=0; normZ=0; }
            if (t2 < tMax) tMax=t2;
            if (tMax < tMin) continue;
          } else if (ox < obj.positionX-hx || ox > obj.positionX+hx) continue;

          // Y slab
          if (Math.abs(dy) > 1e-10) {
            let t1 = (obj.positionY - hy - oy) / dy;
            let t2 = (obj.positionY + hy - oy) / dy;
            if (t1 > t2) { const s=t1; t1=t2; t2=s; }
            if (t1 > tMin) { tMin=t1; normX=0; normY=dy<0?1:-1; normZ=0; }
            if (t2 < tMax) tMax=t2;
            if (tMax < tMin) continue;
          } else if (oy < obj.positionY-hy || oy > obj.positionY+hy) continue;

          // Z slab
          if (Math.abs(dz) > 1e-10) {
            let t1 = (obj.positionZ - hz - oz) / dz;
            let t2 = (obj.positionZ + hz - oz) / dz;
            if (t1 > t2) { const s=t1; t1=t2; t2=s; }
            if (t1 > tMin) { tMin=t1; normX=0; normY=0; normZ=dz<0?1:-1; }
            if (t2 < tMax) tMax=t2;
            if (tMax < tMin) continue;
          } else if (oz < obj.positionZ-hz || oz > obj.positionZ+hz) continue;

          // Hit — tMin is the entry distance (>=0 means in front of origin)
          if (tMin >= 0 && (!best || tMin < best.distance)) {
            best = {
              entity:   makeEntityProxy(obj),
              distance: tMin,
              point:    { x: ox+dx*tMin, y: oy+dy*tMin, z: oz+dz*tMin },
              normal:   { x: normX, y: normY, z: normZ },
            };
          }
        }

        return best;
      },

      create(opts: any) {
        const name = opts.name ?? `Part_${++runner.timerIdCounter}`;
        const px = +(opts.position?.x ?? 0);
        const py = +(opts.position?.y ?? 5);
        const pz = +(opts.position?.z ?? 0);
        const sx = +(opts.scale?.x ?? 1);
        const sy = +(opts.scale?.y ?? 1);
        const sz = +(opts.scale?.z ?? 1);

        const placeholder: ScriptObjState = {
          id: `pending_${name}`, name,
          positionX: px, positionY: py, positionZ: pz,
          rotationX: +(opts.rotation?.x??0), rotationY: +(opts.rotation?.y??0), rotationZ: +(opts.rotation?.z??0),
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          visible: true,
          anchored: opts.anchored ?? false,
          canCollide: opts.canCollide !== false,
          transparency: +(opts.transparency ?? 0),
          isTrigger: !!opts.isTrigger,
          velX: 0, velY: 0, velZ: 0,
        };
        runner.objects.set(name, placeholder);
        runner.createdObjects.push({
          name,
          primitiveType: opts.primitiveType ?? "cube",
          positionX: px, positionY: py, positionZ: pz,
          rotationX: +(opts.rotation?.x??0), rotationY: +(opts.rotation?.y??0), rotationZ: +(opts.rotation?.z??0),
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          anchored: opts.anchored ?? false,
          canCollide: opts.canCollide !== false,
          transparency: +(opts.transparency ?? 0),
          isTrigger: !!opts.isTrigger,
        });

        const proxy = makeEntityProxy(placeholder);
        runner._fireGlobal("entityadded", proxy);
        return proxy;
      },
    };

    // ── Rebur.Players ──────────────────────────────────────────────────────
    const reburPlayers = {
      all()                { return Array.from(runner.players.values()).map(p => makePlayerProxy(p)); },
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

    // ── Rebur.Tags ─────────────────────────────────────────────────────────
    const reburTags = {
      add(entityOrProxy: any, tag: string) {
        const name = typeof entityOrProxy === "string" ? entityOrProxy : entityOrProxy?.name;
        if (!name) return;
        if (!runner.tagMap.has(tag)) runner.tagMap.set(tag, new Set());
        runner.tagMap.get(tag)!.add(name);
        if (!runner.entityTags.has(name)) runner.entityTags.set(name, new Set());
        runner.entityTags.get(name)!.add(tag);
        const obj = runner.objects.get(name);
        if (obj) { if (!obj._tags) obj._tags = new Set(); obj._tags.add(tag); }
      },
      remove(entityOrProxy: any, tag: string) {
        const name = typeof entityOrProxy === "string" ? entityOrProxy : entityOrProxy?.name;
        if (!name) return;
        runner.tagMap.get(tag)?.delete(name);
        runner.entityTags.get(name)?.delete(tag);
        runner.objects.get(name)?._tags?.delete(tag);
      },
      has(entityOrProxy: any, tag: string) {
        const name = typeof entityOrProxy === "string" ? entityOrProxy : entityOrProxy?.name;
        return runner.tagMap.get(tag)?.has(name) ?? false;
      },
      get(tag: string) {
        const names = runner.tagMap.get(tag) ?? new Set();
        const results: any[] = [];
        for (const n of names) {
          const obj = runner.objects.get(n);
          if (obj && !obj._destroyed) results.push(makeEntityProxy(obj));
        }
        return results;
      },
      all(entityOrProxy: any) {
        const name = typeof entityOrProxy === "string" ? entityOrProxy : entityOrProxy?.name;
        return Array.from(runner.entityTags.get(name) ?? []);
      },
    };

    // ── Rebur.Sound ────────────────────────────────────────────────────────
    const reburSound = {
      play(id: string, opts?: { volume?: number; loop?: boolean }) {
        runner.soundQueue.push({ soundId: id, options: opts });
      },
      stop(_id: string) { /* stub — stop is client-side */ },
    };

    // ── Rebur.Tween ────────────────────────────────────────────────────────
    const reburTween = (
      target: any,
      to: Record<string, number>,
      duration: number,
      easing?: string | ((t: number) => number),
      onDone?: () => void
    ) => {
      const easeFn = typeof easing === "function"
        ? easing
        : (EASINGS[easing as string] ?? EASINGS.linear);
      const from: Record<string, number> = {};
      for (const key of Object.keys(to)) {
        try { from[key] = +(target[key] ?? 0); } catch { from[key] = 0; }
      }
      const entry: TweenEntry = {
        target, to, from, elapsed: 0,
        duration: Math.max(duration, 0.001),
        easing: easeFn, onDone, cancelled: false,
      };
      runner.tweens.push(entry);
      return () => { entry.cancelled = true; };
    };

    // ── Rebur.Camera (plain writable proxy — no preset modes) ─────────────
    const reburCamera = new Proxy(runner.cameraSettings, {
      get(t, key: string) { return t[key]; },
      set(t, key: string, val) { t[key] = val; return true; },
    });

    // ── Rebur.Input ────────────────────────────────────────────────────────
    // Consistent .on() pattern:
    //   Rebur.Input.on("press",      (player, key)    => {})
    //   Rebur.Input.on("release",    (player, key)    => {})
    //   Rebur.Input.on("mouseClick", (player, entity) => {})
    const reburInput = {
      on(event: string, fn: EventHandler) {
        const k = event.toLowerCase();
        if (!runner.inputHandlers.has(k)) runner.inputHandlers.set(k, []);
        runner.inputHandlers.get(k)!.push(fn);
        return () => runner.inputHandlers.set(k, (runner.inputHandlers.get(k)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const k = event.toLowerCase();
        runner.inputHandlers.set(k, (runner.inputHandlers.get(k)??[]).filter(h=>h!==fn));
      },
      isDown(key: string) { return runner.heldKeys.has(key.toLowerCase()); },
    };

    // ── Rebur.Physics ──────────────────────────────────────────────────────
    const reburPhysics = new Proxy(runner.physicsSettings as any, {
      get(t, key: string) { return t[key]; },
      set(t, key: string, val) { t[key] = val; return true; },
    });

    // ── Rebur.RunService ───────────────────────────────────────────────────
    const reburRunService = {
      on(phase: string, fn: EventHandler) {
        // All phases currently map to tick
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

    // ── Rebur.Network ──────────────────────────────────────────────────────
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
      // Client-only stubs (future LocalScript context)
      send(_event: string, _payload: any) {},
      onMessage(_event: string, _fn: EventHandler) { return () => {}; },
    };

    // ── Rebur global ───────────────────────────────────────────────────────
    const Rebur = {
      on(event: string, fn: EventHandler) {
        const key = event.toLowerCase(); // docs use camelCase; toLowerCase normalises it
        const arr = runner.globalHandlers.get(key) ?? [];
        arr.push(fn);
        runner.globalHandlers.set(key, arr);
        return () => runner.globalHandlers.set(key, (runner.globalHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const key = event.toLowerCase();
        runner.globalHandlers.set(key, (runner.globalHandlers.get(key)??[]).filter(h=>h!==fn));
      },

      Scene:      reburScene,
      Players:    reburPlayers,
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

    // ── VM context — exactly the documented globals, nothing more ──────────
    const ctx = createContext({
      Rebur,

      after, every, wait,
      random, randInt, pick,
      log, warn, error,

      Vector3, Color3,
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseInt, parseFloat, isNaN, isFinite, Symbol, Promise,

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

    // Advance tweens
    const done: number[] = [];
    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i];
      if (tw.cancelled) { done.push(i); continue; }
      tw.elapsed += dt;
      const t  = Math.min(tw.elapsed / tw.duration, 1);
      const et = tw.easing(t);
      for (const [key, toVal] of Object.entries(tw.to)) {
        try { tw.target[key] = tw.from[key] + (toVal - tw.from[key]) * et; } catch { /* stale proxy */ }
      }
      if (t >= 1) { try { tw.onDone?.(); } catch { /* isolate */ } done.push(i); }
    }
    for (let i = done.length - 1; i >= 0; i--) this.tweens.splice(done[i], 1);

    this._fireGlobal("tick", dt);
  }

  // ── Public event firing (called by GameRoom) ────────────────────────────────

  firePlayerAdded(player: ScriptPlayerState) {
    this._fireGlobal("playerjoined", this._makePlayerProxy(player));
  }
  firePlayerRemoving(player: ScriptPlayerState) {
    this._fireGlobal("playerleft", this._makePlayerProxy(player));
  }
  firePlayerDied(player: ScriptPlayerState) {
    this._fireGlobal("playerdied", this._makePlayerProxy(player));
  }
  firePlayerSpawned(player: ScriptPlayerState) {
    this._fireGlobal("playerrespawned", this._makePlayerProxy(player));
  }

  fireTouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "touched", this._makePlayerProxy(player));
  }
  fireUntouched(objName: string, player: ScriptPlayerState) {
    this._fireObj(objName, "untouched", this._makePlayerProxy(player));
  }
  fireObjEvent(objName: string, event: string, ...args: any[]) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }
  fireMouseClick(entityName: string | null, player: ScriptPlayerState) {
    const pp = this._makePlayerProxy(player);
    const ep = entityName ? this._makeEntityProxyByName(entityName) : null;
    for (const h of this.inputHandlers.get("mouseclick") ?? []) {
      try { h(pp, ep); } catch { /* isolate */ }
    }
    if (entityName) this._fireObj(entityName, "clicked", pp);
  }
  fireInputPress(key: string, player: ScriptPlayerState) {
    this.heldKeys.add(key.toLowerCase());
    const pp = this._makePlayerProxy(player);
    for (const h of this.inputHandlers.get("press") ?? []) {
      try { h(pp, key); } catch { /* isolate */ }
    }
  }
  fireInputRelease(key: string, player: ScriptPlayerState) {
    this.heldKeys.delete(key.toLowerCase());
    const pp = this._makePlayerProxy(player);
    for (const h of this.inputHandlers.get("release") ?? []) {
      try { h(pp, key); } catch { /* isolate */ }
    }
  }
  fireCollisionStarted(objName: string, other: any, impulse: { x: number; y: number; z: number }) {
    this._fireObj(objName, "collisionstarted", other, impulse);
  }
  fireCollisionEnded(objName: string, other: any) {
    this._fireObj(objName, "collisionended", other);
  }
  fireNetworkMessage(event: string, payload: any, sender: ScriptPlayerState) {
    const pp = this._makePlayerProxy(sender);
    for (const h of this.networkHandlers.get(event) ?? []) {
      try { h(payload, pp); } catch { /* isolate */ }
    }
  }
  /** Update the set of keys currently held by any player — called by GameRoom each tick. */
  updateHeldKeys(keys: Set<string>) {
    this.heldKeys = keys;
  }

  // ── Logs & GUI ──────────────────────────────────────────────────────────────

  drainLogs(): string[] { const l = [...this.logs]; this.logs = []; return l; }
  getGuiElements(): GuiElement[] { return Array.from(this.guiElements.values()); }
  getGuiElementsForPlayer(playerId: string): GuiElement[] {
    const shared    = Array.from(this.guiElements.values());
    const perPlayer = Array.from(this.playerGuiElements.get(playerId)?.values() ?? []);
    return [...shared, ...perPlayer];
  }
  fireGuiClick(elementId: string, player: ScriptPlayerState) {
    const perPlayer = this.playerGuiClickHandlers.get(player.id);
    const ph = perPlayer?.get(elementId);
    if (ph) { try { ph(this._makePlayerProxy(player)); } catch { /* isolate */ } return; }
    const h = this.guiClickHandlers.get(elementId);
    if (h) try { h(this._makePlayerProxy(player)); } catch { /* isolate */ }
  }
  clearPlayerGui(playerId: string) {
    this.playerGuiElements.delete(playerId);
    this.playerGuiClickHandlers.delete(playerId);
  }

  // ── Drain queues (called by GameRoom each tick) ─────────────────────────────

  drainSounds(): ScriptSoundEvent[]          { const s=[...this.soundQueue]; this.soundQueue=[]; return s; }
  drainCreatedObjects(): ScriptCreatedObject[]{ const o=[...this.createdObjects]; this.createdObjects=[]; return o; }
  drainDestroyQueue(): string[]              { const d=[...this.destroyQueue]; this.destroyQueue=[]; return d; }
  drainNetworkMessages(): NetworkMessage[]   { const m=[...this.networkMessages]; this.networkMessages=[]; return m; }
  drainNetworkToPlayer(): NetworkToPlayer[]  { const m=[...this.networkToPlayer]; this.networkToPlayer=[]; return m; }
  drainAllPlayerMutations(): Map<string, ScriptPlayerMutation> {
    const m = new Map(this.playerMutations); this.playerMutations.clear(); return m;
  }
  getCameraSettings()  { return { ...this.cameraSettings }; }
  getPhysicsSettings() { return { ...this.physicsSettings }; }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _fireGlobal(event: string, ...args: any[]) {
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

  /** Minimal player proxy used by class-level event firing methods. */
  private _makePlayerProxy(p: ScriptPlayerState): any {
    const self = this;
    const mut = (): ScriptPlayerMutation => {
      let m = this.playerMutations.get(p.id);
      if (!m) { m = {}; this.playerMutations.set(p.id, m); }
      return m;
    };
    const getPlayerMap = () => {
      if (!this.playerGuiElements.has(p.id)) this.playerGuiElements.set(p.id, new Map());
      return this.playerGuiElements.get(p.id)!;
    };
    const getPlayerHandlers = () => {
      if (!this.playerGuiClickHandlers.has(p.id)) this.playerGuiClickHandlers.set(p.id, new Map());
      return this.playerGuiClickHandlers.get(p.id)!;
    };
    const getPlayerData = () => {
      if (!this.playerData.has(p.id)) this.playerData.set(p.id, new Map());
      return this.playerData.get(p.id)!;
    };
    return {
      get id()        { return p.id; },
      get username()  { return p.name; },
      get name()      { return p.name; },
      get isPlayer()  { return true; },
      get destroyed() { return false; },
      get type()      { return "player"; },
      get position()  { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
      get rotation()  { return { x: 0, y: 0, z: 0 }; },
      get health()           { return p.health; },
      set health(v: any)     { const n=Math.max(0,+v); p.health=n; mut().health=n; },
      get maxHealth()        { return p.maxHealth; },
      set maxHealth(v: any)  { const n=Math.max(1,+v); p.maxHealth=n; mut().maxHealth=n; },
      get walkSpeed()        { return p.speed; },
      set walkSpeed(v: any)  { const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get runSpeed()         { return p.runSpeed ?? p.speed * 1.6; },
      set runSpeed(v: any)   { const n=Math.max(0,+v); p.runSpeed=n; mut().runSpeed=n; },
      get jumpPower()        { return p.jumpPower; },
      set jumpPower(v: any)  { const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
      get color()            { return p.shirtColor; },
      set color(v: any)      { p.shirtColor=String(v); mut().shirtColor=String(v); },
      get spawnPoint()       { return { x: p.spawnX??0, y: p.spawnY??0, z: p.spawnZ??0 }; },
      set spawnPoint(v: any) {
        p.spawnX=+(v?.x??0); p.spawnY=+(v?.y??0); p.spawnZ=+(v?.z??0);
        mut().spawnPoint = { x: p.spawnX, y: p.spawnY, z: p.spawnZ };
      },
      takeDamage(n: number) { const h=Math.max(0,p.health-n); p.health=h; mut().health=h; },
      heal(n: number)       { const h=Math.min(p.maxHealth,p.health+n); p.health=h; mut().health=h; },
      kill()                { p.health=0; mut().health=0; },
      respawn()             { mut().respawn=true; },
      teleport(x: number, y: number, z: number) { mut().teleport={x,y,z}; },
      on(event: string, fn: EventHandler) {
        const key = `player::${p.id}::${event.toLowerCase()}`;
        const arr = self.objHandlers.get(key) ?? [];
        arr.push(fn);
        self.objHandlers.set(key, arr);
        return () => self.objHandlers.set(key, (self.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const key = `player::${p.id}::${event.toLowerCase()}`;
        self.objHandlers.set(key, (self.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      emit(event: string, ...args: any[]) {
        const key = `player::${p.id}::${event.toLowerCase()}`;
        for (const h of self.objHandlers.get(key) ?? []) { try { h(...args); } catch { /* isolate */ } }
        return true;
      },
      setAttribute(_k: string, _v: any) {},
      getAttribute(_k: string) { return undefined; },
      gui: {
        text:   (id: string, text: string, opts?: any) => { getPlayerMap().set(id, { id, kind:"text", text, ...mapGuiOpts(opts), visible:true }); },
        button: (id: string, text: string, opts?: any, onClick?: any) => {
          getPlayerMap().set(id, { id, kind:"button", text, width:160, height:36, ...mapGuiOpts(opts), visible:true, clickable:true });
          if (onClick) getPlayerHandlers().set(id, onClick);
        },
        bar:    (id: string, value: number, maxValue: number, opts?: any) => { getPlayerMap().set(id, { id, kind:"bar", value, maxValue, width:200, height:14, ...mapGuiOpts(opts), visible:true }); },
        image:  (id: string, url: string, opts?: any) => { getPlayerMap().set(id, { id, kind:"image", imageUrl:url, width:64, height:64, ...mapGuiOpts(opts), visible:true }); },
        clear:  (id?: string) => {
          if (id !== undefined) { getPlayerMap().delete(id); getPlayerHandlers().delete(id); }
          else { getPlayerMap().clear(); getPlayerHandlers().clear(); }
        },
      },
      data: {
        get:       (key: string) => getPlayerData().get(key),
        set:       (key: string, value: any) => { getPlayerData().set(key, value); },
        delete:    (key: string) => { getPlayerData().delete(key); },
        increment: (key: string, amount = 1) => { const d=getPlayerData(); const n=(d.get(key)??0)+amount; d.set(key,n); return n; },
        getAll:    () => Object.fromEntries(getPlayerData()),
      },
      animator: { current:null, playing:false, play(){}, stop(){}, on(){ return ()=>{}; } },
      inventory: { items:[], maxSlots:36, equipped:null, add(){return null;}, remove(){return 0;}, has(){return false;}, get(){return null;}, equip(){return false;}, drop(){return null;}, clear(){} },
      motors: { attach(){}, detach(){ return null; }, get(){ return null; } },
    };
  }

  private _makeEntityProxyByName(name: string): any {
    const obj = this.objects.get(name);
    if (!obj || obj._destroyed) return null;
    return { name: obj.name, id: obj.id, destroyed: false };
  }

  /** Public accessor so GameRoom can build a player proxy for collision events. */
  makePlayerProxyPublic(p: ScriptPlayerState): any {
    return this._makePlayerProxy(p);
  }

  /** Public accessor so GameRoom can build an entity proxy for collision events. */
  makeEntityProxyPublic(name: string): any {
    return this._makeEntityProxyByName(name);
  }
}
