/**
 * script-runner.ts — Server-side sandbox for Rebur game scripts.
 *
 * Globals available in scripts (exactly as documented):
 *   Rebur — the only engine global
 *   after, every, wait, log, warn, error, random, randInt, pick
 *   Vector3, Color3
 *   Math, JSON, String, Number, Boolean, Array, Object, Date,
 *   parseInt, parseFloat, isNaN, isFinite, Symbol, Promise
 *
 * Dangerous globals (process, require, fetch, etc.) are shadowed to undefined.
 *
 * Scripts run via AsyncFunction — every global is an explicit parameter so
 * closures and async continuations always have them in scope.
 */

const IS_DEV = process.env.NODE_ENV !== "production";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptObjState {
  id: string;
  name: string;
  container?: string;
  type?: string;          // "primitive" | "model" | "light" | "audio" | "folder"
  primitiveType?: string; // "cube" | "sphere" | "cylinder" | "plane"
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
  torqueX?: number;  torqueY?: number;  torqueZ?: number;
  avX?: number;      avY?: number;      avZ?: number;
  gravity?: { strength: number; radius: number } | false;
  _destroyed?: boolean;
  _tags?: Set<string>;
  _attrs?: Map<string, any>;
  _parentName?: string;     // entity hierarchy — name of parent entity
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
  heading?: number;          // yaw in radians — player.rotation.y
  _attrs?: Map<string, any>; // per-player setAttribute store
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
  heading?: number;  // yaw in radians — applied to the player's facing angle
  velX?: number; velY?: number; velZ?: number;  // direct velocity assignment (knockback)
  autoRespawn?: boolean;
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
  container?: string;
  gravity?: { strength: number; radius: number } | false;
}

// ── Sub-system types ───────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  count: number;
  data: Record<string, any>;
}

interface InventoryData {
  items: InventoryItem[];
  equipped: string | null;
  maxSlots: number;
}

interface AnimatorData {
  current: string | null;
  playing: boolean;
  doneHandlers: Array<(name: string) => void>;
}

export interface ScriptSoundEvent {
  soundId: string;
  options?: { volume?: number; loop?: boolean };
}

export interface GuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar";
  text?: string;
  x?: number; y?: number;
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
  private heldKeys                = new Set<string>();
  private perPlayerHeldKeys       = new Map<string, Set<string>>();
  private perPlayerInputHandlers  = new Map<string, Map<string, EventHandler[]>>();
  // Auto-cleanup: all unsubscribe fns returned by player.input.on(), keyed by player id
  private perPlayerInputUnsubs    = new Map<string, Array<() => void>>();

  // Camera is a plain writable store — no preset modes
  private cameraSettings: Record<string, any> = {};
  private physicsSettings: { gravity: number | { x: number; y: number; z: number }; airDrag: number } = { gravity: 28, airDrag: 0 };
  private perPlayerCameraSettings = new Map<string, Record<string, any>>();
  readonly gravityFields: Array<{ id: number; position: {x:number;y:number;z:number}; radius: number; strength: number; direction: {x:number;y:number;z:number}|null; enabled: boolean }> = [];

  // Per-player sub-systems
  private playerInventory = new Map<string, InventoryData>();
  private playerMotors    = new Map<string, Map<string, ScriptObjState>>();
  private playerAnimators = new Map<string, AnimatorData>();

  // Debug visualization & particles (drained each tick by GameRoom)
  debugDraws:     any[] = [];
  particleEvents: any[] = [];

  // Per-player camera state sent from client each tick
  private playerCameraStates = new Map<string, { pos: {x:number;y:number;z:number}; forward: {x:number;y:number;z:number} }>();

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
      "clicked", "destroyed", "predestroy", "removing", "woke", "slept",
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
        get velocity()       { return { x: obj.velX, y: obj.velY, z: obj.velZ }; },
        set velocity(v: any) { obj.velX = +(v?.x??0); obj.velY = +(v?.y??0); obj.velZ = +(v?.z??0); },
        get angularVelocity() { return { x: obj.avX??0, y: obj.avY??0, z: obj.avZ??0 }; },
        set angularVelocity(v: any) { obj.avX = +(v?.x??0); obj.avY = +(v?.y??0); obj.avZ = +(v?.z??0); },
        applyTorque(t: any) {
          obj.torqueX = (obj.torqueX ?? 0) + (+(t?.x ?? 0));
          obj.torqueY = (obj.torqueY ?? 0) + (+(t?.y ?? 0));
          obj.torqueZ = (obj.torqueZ ?? 0) + (+(t?.z ?? 0));
        },
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
        applyAngularImpulse(t: any) {
          obj.avX = (obj.avX ?? 0) + (+(t?.x ?? 0));
          obj.avY = (obj.avY ?? 0) + (+(t?.y ?? 0));
          obj.avZ = (obj.avZ ?? 0) + (+(t?.z ?? 0));
        },
        setVelocity(v: any) {
          obj.velX = +(v?.x ?? 0);
          obj.velY = +(v?.y ?? 0);
          obj.velZ = +(v?.z ?? 0);
        },
      };

      const ep: any = {
        get id()        { return obj.id; },
        get name()      { return obj.name; },
        set name(v)     { obj.name = String(v); },
        get type()      { return obj.type ?? "primitive"; },
        get primitiveType() { return obj.primitiveType ?? null; },
        get isPlayer()  { return false; },
        get destroyed() { return obj._destroyed === true; },

        get position() {
          if (!_posProxy) _posProxy = makePosProxy();
          return _posProxy;
        },
        set position(v: any) {
          if (obj._destroyed) { const m = `position write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; }
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
          if (obj._destroyed) { const m = `rotation write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; }
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
          if (obj._destroyed) { const m = `scale write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; }
          obj.scaleX = +(v?.x ?? obj.scaleX);
          obj.scaleY = +(v?.y ?? obj.scaleY);
          obj.scaleZ = +(v?.z ?? obj.scaleZ);
          _scaleProxy = null;
        },

        get color()        { return obj.color; },
        set color(v)       { if (obj._destroyed) { const m = `color write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; } obj.color = String(v); },
        get visible()      { return obj.visible; },
        set visible(v)     { if (obj._destroyed) { const m = `visible write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; } obj.visible = Boolean(v); },
        get transparency() { return obj.transparency ?? 0; },
        set transparency(v){ if (obj._destroyed) { const m = `transparency write on destroyed entity "${obj.name}"`; if (IS_DEV) throw new Error(m); warn(m); return; } obj.transparency = Math.max(0, Math.min(1, +v)); },

        get gravity() { return obj.gravity ?? false; },
        set gravity(v: any) {
          if (v === false || v === null || v === undefined) {
            obj.gravity = false;
          } else if (typeof v === 'object') {
            obj.gravity = { strength: +(v.strength ?? 20), radius: +(v.radius ?? 20) };
          }
        },

        get body()     { return body; },
        get parent() {
          if (!obj._parentName) return null;
          const par = runner.objects.get(obj._parentName);
          return par && !par._destroyed ? makeEntityProxy(par) : null;
        },
        get children() {
          return Array.from(runner.objects.values())
            .filter(o => !o._destroyed && o._parentName === obj.name)
            .map(o => makeEntityProxy(o));
        },
        find(childName: string): any {
          const search = (parentName: string): any => {
            for (const o of runner.objects.values()) {
              if (o._destroyed || o._parentName !== parentName) continue;
              if (o.name === childName) return makeEntityProxy(o);
              const found = search(o.name);
              if (found) return found;
            }
            return null;
          };
          return search(obj.name);
        },
        setParent(parentEntity: any) {
          if (!parentEntity) { obj._parentName = undefined; return; }
          const pname = typeof parentEntity === "string" ? parentEntity : parentEntity.name;
          if (pname && runner.objects.has(pname)) obj._parentName = pname;
        },

        destroy() {
          if (obj._destroyed) return;
          runner._fireObj(obj.name, "predestroy", ep);
          runner._fireObj(obj.name, "removing", ep);  // backward-compat alias
          obj._destroyed = true;
          obj.visible = false;
          runner.destroyQueue.push(obj.name);
          runner._fireObj(obj.name, "destroyed");
          runner._fireGlobal("entityremoved", ep);
        },

        on(event: string, fn: EventHandler) {
          if (obj._destroyed) {
            const msg = `on() called on destroyed entity "${obj.name}"`;
            if (IS_DEV) throw new Error(msg);
            warn(msg);
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
            const msg = `emit() called on destroyed entity "${obj.name}"`;
            if (IS_DEV) throw new Error(msg);
            warn(msg);
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
        get particles() {
          return {
            emit(opts?: any) {
              runner.particleEvents.push({
                id: `pe_${++runner.timerIdCounter}`,
                position: { x: obj.positionX, y: obj.positionY, z: obj.positionZ },
                effectType: opts?.effectType ?? opts?.type ?? "sparkle",
                color: opts?.color,
                count: opts?.count,
                speed: opts?.speed,
                size: opts?.size,
                lifetime: opts?.lifetime,
                direction: opts?.direction,
                spread: opts?.spread,
              });
            },
          };
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
        get current() { return runner._getAnimator(p.id).current; },
        get playing() { return runner._getAnimator(p.id).playing; },
        play(name: string, _opts?: any) {
          const anim = runner._getAnimator(p.id);
          anim.current = name;
          anim.playing = true;
          // Fixed-duration animations — fire "done" after their natural length
          const durations: Record<string, number> = {
            Jump: 600, Land: 400, Wave: 2000, Dance: 4000,
          };
          const dur = durations[name];
          if (dur) {
            _setTimeout(() => {
              const a = runner._getAnimator(p.id);
              if (a.current === name && a.playing) {
                a.playing = false;
                for (const h of [...a.doneHandlers]) { try { h(name); } catch { /**/ } }
              }
            }, dur);
          }
        },
        stop() {
          runner._getAnimator(p.id).playing = false;
        },
        on(ev: string, fn: any) {
          if (ev === "done") {
            const anim = runner._getAnimator(p.id);
            anim.doneHandlers.push(fn);
            return () => {
              const a = runner._getAnimator(p.id);
              a.doneHandlers = a.doneHandlers.filter(h => h !== fn);
            };
          }
          return () => {};
        },
      };

      const inventory = {
        get items() { return [...runner._getInventory(p.id).items]; },
        get maxSlots() { return runner._getInventory(p.id).maxSlots; },
        get equipped() {
          const eq = runner._getInventory(p.id).equipped;
          if (!eq) return null;
          return runner._getInventory(p.id).items.find(i => i.name === eq) ?? null;
        },
        add(name: string, opts?: any): InventoryItem | null {
          const store = runner._getInventory(p.id);
          if (store.items.length >= store.maxSlots) return null;
          const count = opts?.count ?? 1;
          const existing = store.items.find(i => i.name === name);
          if (existing) { existing.count += count; return { ...existing }; }
          const item: InventoryItem = { id: Math.random().toString(36).slice(2), name, count, data: opts?.data ?? {} };
          store.items.push(item);
          return { ...item };
        },
        remove(name: string, count = 1): number {
          const store = runner._getInventory(p.id);
          const idx = store.items.findIndex(i => i.name === name);
          if (idx === -1) return 0;
          const item = store.items[idx];
          const removed = Math.min(count, item.count);
          item.count -= removed;
          if (item.count <= 0) { store.items.splice(idx, 1); if (store.equipped === name) store.equipped = null; }
          return removed;
        },
        has(name: string, count = 1): boolean {
          return (runner._getInventory(p.id).items.find(i => i.name === name)?.count ?? 0) >= count;
        },
        get(name: string): InventoryItem | null {
          const item = runner._getInventory(p.id).items.find(i => i.name === name);
          return item ? { ...item } : null;
        },
        equip(nameOrNull: string | null): boolean {
          const store = runner._getInventory(p.id);
          if (nameOrNull === null) { store.equipped = null; return true; }
          if (!store.items.find(i => i.name === nameOrNull)) return false;
          store.equipped = nameOrNull;
          return true;
        },
        drop(name: string, count = 1): any {
          const store = runner._getInventory(p.id);
          const idx = store.items.findIndex(i => i.name === name);
          if (idx === -1) return null;
          const item = store.items[idx];
          const removed = Math.min(count, item.count);
          item.count -= removed;
          if (item.count <= 0) { store.items.splice(idx, 1); if (store.equipped === name) store.equipped = null; }
          // Spawn the dropped entity in Workspace near the player
          const dropName = `Drop_${name}_${Date.now()}`;
          const pos = p.position;
          const placeholder: ScriptObjState = {
            id: dropName, name: dropName, container: "Workspace",
            type: "primitive", primitiveType: "cube",
            positionX: pos.x, positionY: pos.y + 0.6, positionZ: pos.z,
            rotationX: 0, rotationY: 0, rotationZ: 0,
            scaleX: 0.4, scaleY: 0.4, scaleZ: 0.4,
            color: "#aaaaaa", visible: true, anchored: false,
            velX: 0, velY: 0, velZ: 0, transparency: 0, canCollide: true,
          };
          runner.objects.set(dropName, placeholder);
          runner.createdObjects.push({
            name: dropName, primitiveType: "cube",
            positionX: pos.x, positionY: pos.y + 0.6, positionZ: pos.z,
            rotationX: 0, rotationY: 0, rotationZ: 0,
            scaleX: 0.4, scaleY: 0.4, scaleZ: 0.4,
            color: "#aaaaaa", anchored: false, canCollide: true, transparency: 0, container: "Workspace",
          });
          return makeEntityProxy(placeholder);
        },
        clear() { const store = runner._getInventory(p.id); store.items = []; store.equipped = null; },
      };

      const motors = {
        attach(slot: string, entity: any, _offset?: any) {
          const obj = entity?._scriptObj as ScriptObjState | undefined
            ?? (entity?.name ? runner.objects.get(entity.name) : undefined);
          if (obj) runner._getMotors(p.id).set(slot.toLowerCase(), obj);
        },
        detach(slot: string): any {
          const m = runner._getMotors(p.id);
          const obj = m.get(slot.toLowerCase());
          m.delete(slot.toLowerCase());
          return obj ? makeEntityProxy(obj) : null;
        },
        get(slot: string): any {
          const obj = runner._getMotors(p.id).get(slot.toLowerCase());
          return obj ? makeEntityProxy(obj) : null;
        },
      };

      const input = {
        key: (k: string) => runner.perPlayerHeldKeys.get(p.id)?.has(k.toLowerCase()) ?? false,
        on: (event: string, fn: EventHandler) => {
          const k = event.toLowerCase();
          if (!runner.perPlayerInputHandlers.has(p.id)) runner.perPlayerInputHandlers.set(p.id, new Map());
          const evtMap = runner.perPlayerInputHandlers.get(p.id)!;
          const arr = evtMap.get(k) ?? [];
          arr.push(fn);
          evtMap.set(k, arr);
          const unsub = () => evtMap.set(k, (evtMap.get(k) ?? []).filter(h => h !== fn));
          if (!runner.perPlayerInputUnsubs.has(p.id)) runner.perPlayerInputUnsubs.set(p.id, []);
          runner.perPlayerInputUnsubs.get(p.id)!.push(unsub);
          return unsub;
        },
        off: (event: string, fn: EventHandler) => {
          const k = event.toLowerCase();
          const evtMap = runner.perPlayerInputHandlers.get(p.id);
          if (evtMap) evtMap.set(k, (evtMap.get(k) ?? []).filter(h => h !== fn));
        },
      };

      return {
        get id()         { return p.id; },
        get name()       { return p.name; },
        get username()   { return p.name; },
        get isPlayer()   { return true; },
        get destroyed()  { return false; },
        get type()       { return "player"; },

        get position()   { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
        set position(v: any) { mut().teleport = { x: +(v?.x??0), y: +(v?.y??0), z: +(v?.z??0) }; },
        get rotation()   { return { x: 0, y: p.heading ?? 0, z: 0 }; },
        set rotation(v: any) { const y = +(v?.y ?? 0); p.heading = y; mut().heading = y; },

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

        get respawn()    { return false; },
        set respawn(v: any) { if (v) mut().respawn = true; },

        get autoRespawn()   { return (p as any)._autoRespawn !== false; },
        set autoRespawn(v: any) {
          (p as any)._autoRespawn = Boolean(v);
          mut().autoRespawn = Boolean(v);
        },

        get body() {
          return {
            get velocity() { return { x: 0, y: 0, z: 0 }; },
            set velocity(v: any) {
              const m = mut();
              m.velX = +(v?.x ?? 0);
              m.velY = +(v?.y ?? 0);
              m.velZ = +(v?.z ?? 0);
            },
            applyForce(f: any) {
              const dt = 0.05;
              const m = mut();
              m.impulseX = (m.impulseX ?? 0) + (+(f?.x ?? 0)) * dt;
              m.impulseY = (m.impulseY ?? 0) + (+(f?.y ?? 0)) * dt;
              m.impulseZ = (m.impulseZ ?? 0) + (+(f?.z ?? 0)) * dt;
            },
            applyImpulse(f: any) {
              const m = mut();
              m.impulseX = (m.impulseX ?? 0) + (+(f?.x ?? 0));
              m.impulseY = (m.impulseY ?? 0) + (+(f?.y ?? 0));
              m.impulseZ = (m.impulseZ ?? 0) + (+(f?.z ?? 0));
            },
          };
        },

        get gui()       { return gui; },
        get data()      { return data; },
        get animator()  { return animator; },
        get inventory() { return inventory; },
        get motors()    { return motors; },
        get input()     { return input; },

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
        setAttribute(k: string, v: any) { if (!p._attrs) p._attrs = new Map(); p._attrs.set(k, v); },
        getAttribute(k: string) { return p._attrs?.get(k); },
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
      delete(key: string) { runner.gameState.delete(key); },
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

    // ── Rebur.Workspace ───────────────────────────────────────────────────
    const isWorkspaceObj = (o: ScriptObjState) => {
      const c = o.container ?? "Workspace";
      return c === "Workspace" || c === "Scene" || c === "";
    };

    // Helper — true for Assets/Shared and any user-created sub-folders within it
    const isAssetsSharedObj = (c: string | null | undefined) => {
      if (!c) return false;
      return c === "Assets/Shared" || c.startsWith("Assets/Shared/");
    };

    // Helper — true for Assets/Server and any user-created sub-folders within it
    const isAssetsServerObj = (c: string | null | undefined) => {
      if (!c) return false;
      return c === "Assets/Server" || c.startsWith("Assets/Server/");
    };
    const reburWorkspace = {
      find(name: string) {
        const obj = runner.objects.get(name);
        return (obj && !obj._destroyed && isWorkspaceObj(obj)) ? makeEntityProxy(obj) : null;
      },
      get(id: string) {
        for (const obj of runner.objects.values()) {
          if (obj.id === id && !obj._destroyed && isWorkspaceObj(obj)) return makeEntityProxy(obj);
        }
        return null;
      },
      all() {
        return Array.from(runner.objects.values())
          .filter(o => !o._destroyed && isWorkspaceObj(o))
          .map(o => makeEntityProxy(o));
      },
      query(filter: any) {
        let results = Array.from(runner.objects.values()).filter(o => !o._destroyed && isWorkspaceObj(o));
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
          results = results.filter(o => (o.type ?? "primitive") === filter.type);
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

      // ── AABB ray cast — ALL hits sorted by distance ────────────────────
      raycastAll(origin: any, direction: any, opts?: any) {
        const ox = +(origin?.x??0), oy = +(origin?.y??0), oz = +(origin?.z??0);
        const maxDist = +(opts?.maxDistance ?? 500);
        const rx = +(direction?.x??0), ry = +(direction?.y??0), rz = +(direction?.z??0);
        const rlen = Math.sqrt(rx*rx+ry*ry+rz*rz)||1;
        const dx=rx/rlen, dy=ry/rlen, dz=rz/rlen;
        const ignoreNames = new Set<string>(((opts?.ignore??[]) as any[]).map((e:any)=>e?.name).filter(Boolean));
        const filterTag: string|undefined = opts?.tag;
        const results: any[] = [];

        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (ignoreNames.has(obj.name)) continue;
          if (filterTag && !(runner.tagMap.get(filterTag)?.has(obj.name))) continue;

          const hx=(obj.scaleX??1)/2, hy=(obj.scaleY??1)/2, hz=(obj.scaleZ??1)/2;
          let tMin=0, tMax=maxDist, normX=0, normY=1, normZ=0;

          if(Math.abs(dx)>1e-10){let t1=(obj.positionX-hx-ox)/dx,t2=(obj.positionX+hx-ox)/dx;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin){tMin=t1;normX=dx<0?1:-1;normY=0;normZ=0;}if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(ox<obj.positionX-hx||ox>obj.positionX+hx)continue;
          if(Math.abs(dy)>1e-10){let t1=(obj.positionY-hy-oy)/dy,t2=(obj.positionY+hy-oy)/dy;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin){tMin=t1;normX=0;normY=dy<0?1:-1;normZ=0;}if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(oy<obj.positionY-hy||oy>obj.positionY+hy)continue;
          if(Math.abs(dz)>1e-10){let t1=(obj.positionZ-hz-oz)/dz,t2=(obj.positionZ+hz-oz)/dz;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin){tMin=t1;normX=0;normY=0;normZ=dz<0?1:-1;}if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(oz<obj.positionZ-hz||oz>obj.positionZ+hz)continue;

          if(tMin>=0){
            results.push({
              entity: makeEntityProxy(obj),
              distance: tMin,
              point: {x:ox+dx*tMin, y:oy+dy*tMin, z:oz+dz*tMin},
              normal: {x:normX, y:normY, z:normZ},
            });
          }
        }
        results.sort((a,b)=>a.distance-b.distance);
        return opts?.limit ? results.slice(0, +(opts.limit)) : results;
      },

      // ── Multiple simultaneous raycasts (spread, shotgun, etc.) ─────────
      multiRaycast(rays: any[], opts?: any) {
        if (!Array.isArray(rays)) return [];
        const ws = reburWorkspace;
        return rays.map(r => ws.raycast(
          r?.origin ?? r?.from ?? {x:0,y:0,z:0},
          r?.direction ?? r?.dir ?? {x:0,y:0,z:1},
          opts
        ));
      },

      // ── Sphere sweep — AABB expanded by radius, good for hit scan ──────
      sphereCast(origin: any, radius: number, direction: any, opts?: any) {
        const ox = +(origin?.x??0), oy = +(origin?.y??0), oz = +(origin?.z??0);
        const r  = Math.max(0, +(radius ?? 0.5));
        const maxDist = +(opts?.maxDistance ?? 500);
        const rx = +(direction?.x??0), ry = +(direction?.y??0), rz = +(direction?.z??0);
        const rlen = Math.sqrt(rx*rx+ry*ry+rz*rz)||1;
        const dx=rx/rlen, dy=ry/rlen, dz=rz/rlen;
        const ignoreNames = new Set<string>(((opts?.ignore??[]) as any[]).map((e:any)=>e?.name).filter(Boolean));
        let best: any = null;

        for (const obj of runner.objects.values()) {
          if (obj._destroyed || ignoreNames.has(obj.name)) continue;
          const hx=(obj.scaleX??1)/2+r, hy=(obj.scaleY??1)/2+r, hz=(obj.scaleZ??1)/2+r;
          let tMin=0, tMax=maxDist;
          if(Math.abs(dx)>1e-10){let t1=(obj.positionX-hx-ox)/dx,t2=(obj.positionX+hx-ox)/dx;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin)tMin=t1;if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(ox<obj.positionX-hx||ox>obj.positionX+hx)continue;
          if(Math.abs(dy)>1e-10){let t1=(obj.positionY-hy-oy)/dy,t2=(obj.positionY+hy-oy)/dy;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin)tMin=t1;if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(oy<obj.positionY-hy||oy>obj.positionY+hy)continue;
          if(Math.abs(dz)>1e-10){let t1=(obj.positionZ-hz-oz)/dz,t2=(obj.positionZ+hz-oz)/dz;if(t1>t2){const s=t1;t1=t2;t2=s;}if(t1>tMin)tMin=t1;if(t2<tMax)tMax=t2;if(tMax<tMin)continue;}else if(oz<obj.positionZ-hz||oz>obj.positionZ+hz)continue;
          if(tMin>=0&&(!best||tMin<best.distance)){
            best={entity:makeEntityProxy(obj),distance:tMin,point:{x:ox+dx*tMin,y:oy+dy*tMin,z:oz+dz*tMin},normal:{x:0,y:1,z:0},radius:r};
          }
        }
        return best;
      },

      // ── Sphere overlap — all AABB objects intersecting a sphere ───────────
      overlapSphere(center: any, radius: number, opts?: any) {
        const cx = +(center?.x ?? 0), cy = +(center?.y ?? 0), cz = +(center?.z ?? 0);
        const r  = Math.max(0, +(radius ?? 1));
        const filterTag: string | string[] | undefined = opts?.tag;
        const results: any[] = [];
        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (filterTag) {
            const tags = Array.isArray(filterTag) ? filterTag : [filterTag];
            if (!tags.every(t => runner.tagMap.get(t)?.has(obj.name))) continue;
          }
          // Closest point on AABB to sphere center
          const hx = (obj.scaleX ?? 1) / 2, hy = (obj.scaleY ?? 1) / 2, hz = (obj.scaleZ ?? 1) / 2;
          const cpx = Math.max(obj.positionX - hx, Math.min(cx, obj.positionX + hx));
          const cpy = Math.max(obj.positionY - hy, Math.min(cy, obj.positionY + hy));
          const cpz = Math.max(obj.positionZ - hz, Math.min(cz, obj.positionZ + hz));
          const ddx = cx - cpx, ddy = cy - cpy, ddz = cz - cpz;
          if (ddx*ddx + ddy*ddy + ddz*ddz <= r*r) results.push(makeEntityProxy(obj));
        }
        return results;
      },

      // ── Box overlap — all AABB objects intersecting an axis-aligned box ──
      overlapBox(center: any, halfExtents: any, _rotation?: any, opts?: any) {
        const cx = +(center?.x ?? 0), cy = +(center?.y ?? 0), cz = +(center?.z ?? 0);
        const hx = +(halfExtents?.x ?? 1), hy = +(halfExtents?.y ?? 1), hz = +(halfExtents?.z ?? 1);
        const filterTag: string | string[] | undefined = opts?.tag ?? _rotation?.tag;
        const results: any[] = [];
        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (filterTag) {
            const tags = Array.isArray(filterTag) ? filterTag : [filterTag];
            if (!tags.every(t => runner.tagMap.get(t)?.has(obj.name))) continue;
          }
          const ohx = (obj.scaleX ?? 1) / 2, ohy = (obj.scaleY ?? 1) / 2, ohz = (obj.scaleZ ?? 1) / 2;
          const ox = Math.min(cx+hx, obj.positionX+ohx) - Math.max(cx-hx, obj.positionX-ohx);
          const oy = Math.min(cy+hy, obj.positionY+ohy) - Math.max(cy-hy, obj.positionY-ohy);
          const oz = Math.min(cz+hz, obj.positionZ+ohz) - Math.max(cz-hz, obj.positionZ-ohz);
          if (ox > 0 && oy > 0 && oz > 0) results.push(makeEntityProxy(obj));
        }
        return results;
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
      query(tagOrTags: string | string[]) {
        const tags = Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags];
        let results = Array.from(runner.objects.values()).filter(o => !o._destroyed);
        for (const tag of tags) {
          const names = runner.tagMap.get(tag) ?? new Set();
          results = results.filter(o => names.has(o.name));
        }
        return results.map(o => makeEntityProxy(o));
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

    // ── Rebur.Camera — writable settings + per-player ray helpers ─────────
    const reburCamera = {
      // ── Writable global camera settings ────────────────────────────────
      get mode()     { return runner.cameraSettings.mode ?? "thirdPerson"; },
      set mode(v: any)     { runner.cameraSettings.mode = v; },
      get fov()      { return runner.cameraSettings.fov ?? 60; },
      set fov(v: any)      { runner.cameraSettings.fov = +v; },
      get distance() { return runner.cameraSettings.distance ?? 6; },
      set distance(v: any) { runner.cameraSettings.distance = +v; },
      get position() { return runner.cameraSettings.position; },
      set position(v: any) { runner.cameraSettings.position = v; },
      get lookAt()   { return runner.cameraSettings.lookAt; },
      set lookAt(v: any)   { runner.cameraSettings.lookAt = v; },

      // ── Per-player camera state (sent by client each tick) ─────────────
      // getPosition / getForward — world-space camera position & direction
      getPosition(player: any): {x:number;y:number;z:number} {
        const id = typeof player === "string" ? player : player?.id;
        return runner.playerCameraStates.get(id)?.pos ?? { x: 0, y: 10, z: 10 };
      },
      getForward(player: any): {x:number;y:number;z:number} {
        const id = typeof player === "string" ? player : player?.id;
        return runner.playerCameraStates.get(id)?.forward ?? { x: 0, y: 0, z: -1 };
      },

      // ── Ray helpers ────────────────────────────────────────────────────
      // Camera-forward ray — for aim-based shooting (first-person aim, auto-aim)
      getForwardRay(player: any): { origin:{x:number;y:number;z:number}; direction:{x:number;y:number;z:number} } | null {
        const id = typeof player === "string" ? player : player?.id;
        const state = runner.playerCameraStates.get(id);
        if (!state) return null;
        return { origin: { ...state.pos }, direction: { ...state.forward } };
      },

      // Screen-point ray — nx/ny are normalized device coords [-1,1]
      // To convert mouse: nx = mouseX/width*2-1, ny = 1-mouseY/height*2
      // Perfect for mouse-click picking in 3D space
      screenPointToRay(player: any, nx: number, ny: number, aspectRatio = 16/9): { origin:{x:number;y:number;z:number}; direction:{x:number;y:number;z:number} } | null {
        const id = typeof player === "string" ? player : player?.id;
        const state = runner.playerCameraStates.get(id);
        if (!state) return null;

        const fov = runner.cameraSettings.fov ?? 60;
        const tanHalfFov = Math.tan((fov * Math.PI / 180) / 2);
        const fw = state.forward;

        // Derive right as forward × worldUp (fallback to worldRight if near vertical)
        const wy = Math.abs(fw.y) < 0.98 ? { x:0, y:1, z:0 } : { x:1, y:0, z:0 };
        const rcx = fw.y*wy.z - fw.z*wy.y;
        const rcy = fw.z*wy.x - fw.x*wy.z;
        const rcz = fw.x*wy.y - fw.y*wy.x;
        const rlen = Math.sqrt(rcx*rcx+rcy*rcy+rcz*rcz)||1;
        const rx=rcx/rlen, ry=rcy/rlen, rz=rcz/rlen;

        // Up = right × forward
        const ux = ry*fw.z - rz*fw.y;
        const uy = rz*fw.x - rx*fw.z;
        const uz = rx*fw.y - ry*fw.x;

        const dirX = fw.x + nx*tanHalfFov*aspectRatio*rx + ny*tanHalfFov*ux;
        const dirY = fw.y + nx*tanHalfFov*aspectRatio*ry + ny*tanHalfFov*uy;
        const dirZ = fw.z + nx*tanHalfFov*aspectRatio*rz + ny*tanHalfFov*uz;
        const dlen = Math.sqrt(dirX*dirX+dirY*dirY+dirZ*dirZ)||1;

        return { origin: { ...state.pos }, direction: { x:dirX/dlen, y:dirY/dlen, z:dirZ/dlen } };
      },

      // Viewport-point ray — vx/vy are 0-1 (top-left origin)
      viewportPointToRay(player: any, vx: number, vy: number, aspectRatio = 16/9) {
        return reburCamera.screenPointToRay(player, vx*2-1, 1-vy*2, aspectRatio);
      },

      // Safe convenience: cast a ray from the camera forward direction.
      // Returns null if the player has no camera state (no crash).
      // opts are the same as Rebur.Workspace.raycast opts.
      raycast(player: any, opts?: any) {
        const ray = reburCamera.getForwardRay(player);
        if (!ray) return null;
        return reburWorkspace.raycast(ray.origin, ray.direction, opts);
      },

      // Per-player camera override — only affects the named player's client view.
      setForPlayer(player: any, opts: any) {
        const id = typeof player === "string" ? player : player?.id;
        if (!id || !opts) return;
        runner.perPlayerCameraSettings.set(id, { ...opts });
      },

      // Broadcast the same camera override to every connected player.
      setForAll(opts: any) {
        if (!opts) return;
        for (const id of runner.players.keys()) {
          runner.perPlayerCameraSettings.set(id, { ...opts });
        }
      },

      // Clear a per-player override (reverts to global camera).
      clearForPlayer(player: any) {
        const id = typeof player === "string" ? player : player?.id;
        if (id) runner.perPlayerCameraSettings.delete(id);
      },
    };

    // ── Rebur.Debug — runtime visualization (like Unity Debug.DrawRay) ────
    const reburDebug = {
      drawRay(origin: any, direction: any, opts?: any) {
        const ox=+(origin?.x??0), oy=+(origin?.y??0), oz=+(origin?.z??0);
        const dx=+(direction?.x??0), dy=+(direction?.y??0), dz=+(direction?.z??0);
        const dl=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
        runner.debugDraws.push({
          id: `dd_${++runner.timerIdCounter}`,
          kind: "ray",
          origin: {x:ox,y:oy,z:oz},
          direction: {x:dx/dl,y:dy/dl,z:dz/dl},
          length: +(opts?.length??opts?.maxDistance??10),
          color: opts?.color ?? "#00ff00",
          duration: +(opts?.duration??0),
        });
      },
      drawPoint(position: any, opts?: any) {
        runner.debugDraws.push({
          id: `dd_${++runner.timerIdCounter}`,
          kind: "point",
          origin: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          radius: +(opts?.radius??opts?.size??0.15),
          color: opts?.color ?? "#ff0000",
          duration: +(opts?.duration??0),
        });
      },
      drawBox(center: any, size: any, opts?: any) {
        runner.debugDraws.push({
          id: `dd_${++runner.timerIdCounter}`,
          kind: "box",
          origin: {x:+(center?.x??0),y:+(center?.y??0),z:+(center?.z??0)},
          size: {x:+(size?.x??1),y:+(size?.y??1),z:+(size?.z??1)},
          color: opts?.color ?? "#0088ff",
          duration: +(opts?.duration??0),
        });
      },
      drawSphere(center: any, radius: number, opts?: any) {
        runner.debugDraws.push({
          id: `dd_${++runner.timerIdCounter}`,
          kind: "sphere",
          origin: {x:+(center?.x??0),y:+(center?.y??0),z:+(center?.z??0)},
          radius: +(radius??0.5),
          color: opts?.color ?? "#ffaa00",
          duration: +(opts?.duration??0),
        });
      },
      clear() { runner.debugDraws = []; },
    };

    // ── Rebur.Particles — visual effects emitter ───────────────────────────
    const reburParticles = {
      emit(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: opts?.effectType??opts?.type??"sparkle",
          color: opts?.color,
          count: opts?.count,
          speed: opts?.speed,
          size: opts?.size,
          lifetime: opts?.lifetime,
          direction: opts?.direction,
          spread: opts?.spread,
        });
      },
      explosion(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "explosion",
          color: opts?.color??"#ff6600",
          count: opts?.count??40,
          speed: opts?.speed??8,
          size: opts?.size??0.3,
          lifetime: opts?.lifetime??1.2,
        });
      },
      muzzleFlash(position: any, direction?: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "muzzleFlash",
          direction: direction?{x:+(direction.x??0),y:+(direction.y??0),z:+(direction.z??0)}:undefined,
          color: opts?.color??"#ffff88",
          count: opts?.count??8,
          speed: opts?.speed??6,
          size: opts?.size??0.12,
          lifetime: opts?.lifetime??0.1,
        });
      },
      hit(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "hit",
          color: opts?.color??"#ffffff",
          count: opts?.count??10,
          speed: opts?.speed??4,
          size: opts?.size??0.08,
          lifetime: opts?.lifetime??0.4,
        });
      },
      smoke(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "smoke",
          color: opts?.color??"#888888",
          count: opts?.count??15,
          speed: opts?.speed??1.5,
          size: opts?.size??0.5,
          lifetime: opts?.lifetime??2.0,
        });
      },
      sparkle(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "sparkle",
          color: opts?.color??"#ffdd00",
          count: opts?.count??20,
          speed: opts?.speed??5,
          size: opts?.size??0.1,
          lifetime: opts?.lifetime??0.8,
        });
      },
      fire(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "fire",
          color: opts?.color??"#ff4400",
          count: opts?.count??25,
          speed: opts?.speed??2,
          size: opts?.size??0.2,
          lifetime: opts?.lifetime??1.5,
        });
      },
      pickup(position: any, opts?: any) {
        runner.particleEvents.push({
          id: `pe_${++runner.timerIdCounter}`,
          position: {x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)},
          effectType: "pickup",
          color: opts?.color??"#00ffff",
          count: opts?.count??15,
          speed: opts?.speed??3,
          size: opts?.size??0.1,
          lifetime: opts?.lifetime??0.6,
        });
      },
    };

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
    };

    // ── Rebur.Physics ──────────────────────────────────────────────────────
    const reburPhysics = {
      get gravity()  { return runner.physicsSettings.gravity; },
      set gravity(v: any) {
        // Accept scalar (downward magnitude) or vector {x,y,z}
        if (typeof v === "number") runner.physicsSettings.gravity = v;
        else if (v && typeof v === "object") runner.physicsSettings.gravity = v as any;
      },
      get airDrag()  { return runner.physicsSettings.airDrag; },
      set airDrag(v: any) { runner.physicsSettings.airDrag = Math.max(0, +v); },
      setGravityField(opts: any) {
        const id = ++runner.timerIdCounter;
        const dir = opts?.direction
          ? { x: +(opts.direction.x ?? 0), y: +(opts.direction.y ?? -1), z: +(opts.direction.z ?? 0) }
          : null; // null means pull toward center
        const field = {
          id,
          position: { x: +(opts?.position?.x ?? 0), y: +(opts?.position?.y ?? 0), z: +(opts?.position?.z ?? 0) },
          radius:   +(opts?.radius   ?? 20),
          strength: +(opts?.strength ?? 10),
          direction: dir,
          enabled:  true,
        };
        runner.gravityFields.push(field);
        return {
          get enabled() { return field.enabled; },
          set enabled(v: any) { field.enabled = Boolean(v); },
          remove() {
            const idx = runner.gravityFields.indexOf(field);
            if (idx >= 0) runner.gravityFields.splice(idx, 1);
          },
        };
      },
    };

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
      // Server → all clients (primary broadcast)
      broadcast(event: string, payload?: any) {
        runner.networkMessages.push({ event, payload: payload ?? null });
      },
      // Server → specific player (primary spec name)
      sendTo(playerOrId: any, event: string, payload?: any) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
      },
      // Server → subset of players
      sendToMany(playersOrIds: any[], event: string, payload?: any) {
        for (const p of (playersOrIds ?? [])) {
          const id = typeof p === "string" ? p : p?.id;
          if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
        }
      },
      // Alias kept for backward compat — same as sendTo
      send(playerOrId: any, event: string, payload?: any) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
      },
      // Server listens for client → server messages
      on(event: string, fn: EventHandler) {
        const arr = runner.networkHandlers.get(event) ?? [];
        arr.push(fn);
        runner.networkHandlers.set(event, arr);
        return () => runner.networkHandlers.set(event, (runner.networkHandlers.get(event)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        runner.networkHandlers.set(event, (runner.networkHandlers.get(event)??[]).filter(h=>h!==fn));
      },
    };

    // ── Rebur.Lighting — query API scoped to the Lighting container ────────
    const reburLighting = {
      find(name: string) {
        const obj = runner.objects.get(name);
        return (obj && !obj._destroyed && obj.container === "Lighting") ? makeEntityProxy(obj) : null;
      },
      get(id: string) {
        for (const obj of runner.objects.values()) {
          if (obj.id === id && !obj._destroyed && obj.container === "Lighting") return makeEntityProxy(obj);
        }
        return null;
      },
      all() {
        return Array.from(runner.objects.values())
          .filter(o => !o._destroyed && o.container === "Lighting")
          .map(o => makeEntityProxy(o));
      },
    };

    // ── Rebur.Assets.Shared — shared templates visible to all scripts ─────
    // WARNING: Do NOT store secret/server-only data here — it replicates to
    // all clients. Use Assets.Server for server-only data.
    const reburAssetsShared = {
      find(name: string) {
        const obj = runner.objects.get(name);
        return (obj && !obj._destroyed && isAssetsSharedObj(obj.container)) ? makeEntityProxy(obj) : null;
      },
      get(id: string) {
        for (const obj of runner.objects.values()) {
          if (obj.id === id && !obj._destroyed && isAssetsSharedObj(obj.container)) return makeEntityProxy(obj);
        }
        return null;
      },
      all() {
        return Array.from(runner.objects.values())
          .filter(o => !o._destroyed && isAssetsSharedObj(o.container))
          .map(o => makeEntityProxy(o));
      },
    };

    // ── Rebur.Assets.Server — server-only templates/data ──────────────────
    // Safe for server-only data. Never replicated to clients.
    // Only accessible from server scripts.
    const reburAssetsServer = {
      find(name: string) {
        const obj = runner.objects.get(name);
        return (obj && !obj._destroyed && isAssetsServerObj(obj.container)) ? makeEntityProxy(obj) : null;
      },
      get(id: string) {
        for (const obj of runner.objects.values()) {
          if (obj.id === id && !obj._destroyed && isAssetsServerObj(obj.container)) return makeEntityProxy(obj);
        }
        return null;
      },
      all() {
        return Array.from(runner.objects.values())
          .filter(o => !o._destroyed && isAssetsServerObj(o.container))
          .map(o => makeEntityProxy(o));
      },
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

      Workspace:  reburWorkspace,
      Lighting:   reburLighting,
      Assets: {
        Shared: reburAssetsShared,
        Server: reburAssetsServer,
      },
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
      Debug:      reburDebug,
      Particles:  reburParticles,
    };

    // ── AsyncFunction sandbox ──────────────────────────────────────────────
    // Every documented global is an explicit parameter so closures and async
    // continuations always have them in scope — no VM context lookup needed.
    // Dangerous Node.js globals are shadowed by passing `undefined`.

    // Convenience `player` proxy — resolves lazily to the first connected player.
    // Useful for single-player scripts without requiring Rebur.Players.all()[0].
    const player = new Proxy({} as any, {
      get(_t, key: string) {
        const all = Array.from(runner.players.values());
        if (!all.length) return undefined;
        return makePlayerProxy(all[0])[key];
      },
      set(_t, key: string, value: any) {
        const all = Array.from(runner.players.values());
        if (!all.length) return true;
        const pp = makePlayerProxy(all[0]);
        (pp as any)[key] = value;
        return true;
      },
    });

    // Convenience `players` — shortcut for Rebur.Players
    const players = Rebur.Players;

    const PARAMS = [
      "Rebur",
      "player", "players",
      "after", "every", "wait",
      "random", "randInt", "pick",
      "log", "warn", "error",
      "Vector3", "Color3",
      "Math", "JSON", "String", "Number", "Boolean", "Array", "Object", "Date",
      "parseInt", "parseFloat", "isNaN", "isFinite", "Symbol", "Promise",
      // Blocked — shadowed to undefined
      "process", "require", "fetch", "__filename", "__dirname",
      "global", "globalThis", "Buffer",
      "setInterval", "setTimeout", "clearInterval", "clearTimeout",
    ];

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor as any;

    try {
      const fn: (...args: any[]) => Promise<void> = new AsyncFunc(...PARAMS, code);
      fn(
        Rebur,
        player, players,
        after, every, wait,
        random, randInt, pick,
        log, warn, error,
        Vector3, Color3,
        Math, JSON, String, Number, Boolean, Array, Object, Date,
        parseInt, parseFloat, isNaN, isFinite, Symbol, Promise,
        // Blocked:
        undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
      ).catch((err: any) => {
        error(`Unhandled async error: ${err?.message ?? err}`);
      });
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
    for (const h of this.perPlayerInputHandlers.get(player.id)?.get("press") ?? []) {
      try { h(key); } catch { /* isolate */ }
    }
  }
  fireInputRelease(key: string, player: ScriptPlayerState) {
    this.heldKeys.delete(key.toLowerCase());
    const pp = this._makePlayerProxy(player);
    for (const h of this.inputHandlers.get("release") ?? []) {
      try { h(pp, key); } catch { /* isolate */ }
    }
    for (const h of this.perPlayerInputHandlers.get(player.id)?.get("release") ?? []) {
      try { h(key); } catch { /* isolate */ }
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
  /** Update per-player held keys — called by GameRoom after each keyDown/keyUp. */
  updatePlayerHeldKeys(playerId: string, keys: Set<string>) {
    if (keys.size === 0) this.perPlayerHeldKeys.delete(playerId);
    else this.perPlayerHeldKeys.set(playerId, new Set(keys));
  }
  /** Remove all input state for a disconnected player.
   *  Auto-invokes every unsubscribe returned by player.input.on() so scripts
   *  don't need a manual playerLeft bookkeeping step. */
  clearPlayerHeldKeys(playerId: string) {
    for (const unsub of this.perPlayerInputUnsubs.get(playerId) ?? []) {
      try { unsub(); } catch { /* isolate */ }
    }
    this.perPlayerInputUnsubs.delete(playerId);
    this.perPlayerHeldKeys.delete(playerId);
    this.perPlayerInputHandlers.delete(playerId);
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
  drainDebugDraws(): any[]     { const d=[...this.debugDraws]; this.debugDraws=[]; return d; }
  drainParticleEvents(): any[] { const p=[...this.particleEvents]; this.particleEvents=[]; return p; }
  getCameraSettings()  { return { ...this.cameraSettings }; }
  getPlayerCameraOverride(playerId: string): Record<string, any> | undefined {
    return this.perPlayerCameraSettings.get(playerId);
  }
  getPhysicsSettings() { return { gravity: this.physicsSettings.gravity, airDrag: this.physicsSettings.airDrag }; }
  getGravityFields()   { return this.gravityFields; }

  /** Called by GameRoom each tick after receiving client input. */
  updatePlayerCameraState(playerId: string, pos: {x:number;y:number;z:number}, forward: {x:number;y:number;z:number}) {
    this.playerCameraStates.set(playerId, { pos, forward });
  }

  /** Remove camera state when player leaves. */
  removePlayerCameraState(playerId: string) {
    this.playerCameraStates.delete(playerId);
  }

  /** Returns motor slots for a player so GameRoom can include them in RenderPlayer. */
  getMotorSlots(playerId: string): Record<string, { objectId: string; objectName: string; offset: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number} } | null> {
    const motorMap = this.playerMotors.get(playerId);
    if (!motorMap || motorMap.size === 0) return {};
    const result: Record<string, any> = {};
    for (const [slot, obj] of motorMap) {
      result[slot] = {
        objectId: obj.id,
        objectName: obj.name,
        offset: { x: obj.positionX, y: obj.positionY, z: obj.positionZ },
        rotation: { x: obj.rotationX, y: obj.rotationY, z: obj.rotationZ },
      };
    }
    return result;
  }

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
      set position(v: any) { mut().teleport = { x: +(v?.x??0), y: +(v?.y??0), z: +(v?.z??0) }; },
      get rotation()  { return { x: 0, y: p.heading ?? 0, z: 0 }; },
      set rotation(v: any) { const y = +(v?.y ?? 0); p.heading = y; mut().heading = y; },
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
      get respawn()    { return false; },
      set respawn(v: any) { if (v) mut().respawn = true; },
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
      setAttribute(k: string, v: any) { if (!p._attrs) p._attrs = new Map(); p._attrs.set(k, v); },
      getAttribute(k: string) { return p._attrs?.get(k); },
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
      animator: {
        get current() { return self._getAnimator(p.id).current; },
        get playing() { return self._getAnimator(p.id).playing; },
        play(name: string, _opts?: any) {
          const anim = self._getAnimator(p.id);
          anim.current = name; anim.playing = true;
        },
        stop() { self._getAnimator(p.id).playing = false; },
        on(ev: string, fn: any) {
          if (ev === "done") {
            const anim = self._getAnimator(p.id);
            anim.doneHandlers.push(fn);
            return () => { const a = self._getAnimator(p.id); a.doneHandlers = a.doneHandlers.filter(h => h !== fn); };
          }
          return () => {};
        },
      },
      inventory: {
        get items() { return [...self._getInventory(p.id).items]; },
        get maxSlots() { return self._getInventory(p.id).maxSlots; },
        get equipped() { const eq = self._getInventory(p.id).equipped; return eq ? (self._getInventory(p.id).items.find(i => i.name === eq) ?? null) : null; },
        add(name: string, opts?: any): InventoryItem | null {
          const store = self._getInventory(p.id);
          if (store.items.length >= store.maxSlots) return null;
          const count = opts?.count ?? 1;
          const existing = store.items.find(i => i.name === name);
          if (existing) { existing.count += count; return { ...existing }; }
          const item: InventoryItem = { id: Math.random().toString(36).slice(2), name, count, data: opts?.data ?? {} };
          store.items.push(item); return { ...item };
        },
        remove(name: string, count = 1): number {
          const store = self._getInventory(p.id);
          const idx = store.items.findIndex(i => i.name === name);
          if (idx === -1) return 0;
          const item = store.items[idx];
          const removed = Math.min(count, item.count);
          item.count -= removed;
          if (item.count <= 0) { store.items.splice(idx, 1); if (store.equipped === name) store.equipped = null; }
          return removed;
        },
        has(name: string, count = 1): boolean {
          return (self._getInventory(p.id).items.find(i => i.name === name)?.count ?? 0) >= count;
        },
        get(name: string): InventoryItem | null {
          const item = self._getInventory(p.id).items.find(i => i.name === name);
          return item ? { ...item } : null;
        },
        equip(nameOrNull: string | null): boolean {
          const store = self._getInventory(p.id);
          if (nameOrNull === null) { store.equipped = null; return true; }
          if (!store.items.find(i => i.name === nameOrNull)) return false;
          store.equipped = nameOrNull; return true;
        },
        drop(_name: string, _count = 1): null { return null; }, // spawning needs loadScript context
        clear() { const store = self._getInventory(p.id); store.items = []; store.equipped = null; },
      },
      motors: {
        attach(slot: string, entity: any) {
          const obj = entity?.name ? self.objects.get(entity.name) : undefined;
          if (obj) self._getMotors(p.id).set(slot.toLowerCase(), obj);
        },
        detach(slot: string): any {
          const m = self._getMotors(p.id);
          const obj = m.get(slot.toLowerCase()); m.delete(slot.toLowerCase());
          return obj ? self._makeEntityProxyByName(obj.name) : null;
        },
        get(slot: string): any {
          const obj = self._getMotors(p.id).get(slot.toLowerCase());
          return obj ? self._makeEntityProxyByName(obj.name) : null;
        },
      },
      input: {
        key: (k: string) => self.perPlayerHeldKeys.get(p.id)?.has(k.toLowerCase()) ?? false,
        on: (event: string, fn: EventHandler) => {
          const k = event.toLowerCase();
          if (!self.perPlayerInputHandlers.has(p.id)) self.perPlayerInputHandlers.set(p.id, new Map());
          const evtMap = self.perPlayerInputHandlers.get(p.id)!;
          const arr = evtMap.get(k) ?? [];
          arr.push(fn);
          evtMap.set(k, arr);
          const unsub = () => evtMap.set(k, (evtMap.get(k) ?? []).filter(h => h !== fn));
          if (!self.perPlayerInputUnsubs.has(p.id)) self.perPlayerInputUnsubs.set(p.id, []);
          self.perPlayerInputUnsubs.get(p.id)!.push(unsub);
          return unsub;
        },
        off: (event: string, fn: EventHandler) => {
          const k = event.toLowerCase();
          const evtMap = self.perPlayerInputHandlers.get(p.id);
          if (evtMap) evtMap.set(k, (evtMap.get(k) ?? []).filter(h => h !== fn));
        },
      },
    };
  }

  // ── Sub-system helpers ────────────────────────────────────────────────────
  private _getInventory(pid: string): InventoryData {
    if (!this.playerInventory.has(pid))
      this.playerInventory.set(pid, { items: [], equipped: null, maxSlots: 36 });
    return this.playerInventory.get(pid)!;
  }
  private _getAnimator(pid: string): AnimatorData {
    if (!this.playerAnimators.has(pid))
      this.playerAnimators.set(pid, { current: null, playing: false, doneHandlers: [] });
    return this.playerAnimators.get(pid)!;
  }
  private _getMotors(pid: string): Map<string, ScriptObjState> {
    if (!this.playerMotors.has(pid)) this.playerMotors.set(pid, new Map());
    return this.playerMotors.get(pid)!;
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
