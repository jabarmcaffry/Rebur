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
  // Entity health
  health?: number;
  maxHealth?: number;
  autoDestroy?: boolean;    // if true (default), entity is destroyed when health hits 0
  // Interaction (E-key)
  interactionEnabled?: boolean;
  interactionDistance?: number;  // max distance for E-key interaction (default 4)
  interactionHint?: string;      // hint text shown near entity (default "Press E to interact")
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
  _autoRespawn?: boolean;
  vx?: number; vy?: number; vz?: number;  // velocity readback for player.body.velocity
  isKinematic?: boolean;     // when true physics step is skipped; scripts fully drive movement
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
  isKinematic?: boolean;
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
  targetPlayerId?: string;   // undefined = broadcast to all
  position?: { x: number; y: number; z: number }; // 3D positional audio
  options?: { volume?: number; loop?: boolean; pitch?: number; maxDistance?: number };
}

export interface GuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar" | "frame" | "input";
  text?: string;
  x?: number; y?: number;
  width?: number; height?: number;
  anchor?: string;
  color?: string;
  fontSize?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  cornerRadius?: number;
  imageUrl?: string;
  value?: number; maxValue?: number;
  barColor?: string;
  visible?: boolean;
  clickable?: boolean;
  zIndex?: number;
  opacity?: number;
  // For "input" kind
  placeholder?: string;
  inputType?: "text" | "number" | "password";
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

// NEW: world-space labels / billboards
export interface WorldLabel {
  id: string;
  text: string;
  position: { x: number; y: number; z: number };
  color?: string;
  fontSize?: number;
  backgroundColor?: string;
  faceCamera?: boolean;
  visible?: boolean;
  attachedTo?: string; // entity name — follows the entity
}

// NEW: scene transition
export interface SceneTransition {
  type: "fade" | "instant" | "slide";
  color?: string;
  duration?: number;
  targetScene?: string;
}

type EventHandler = (...args: any[]) => void;

interface TimerEntry {
  remaining: number;
  fn: (...a: any[]) => void;
  repeat: number | null;
  paused?: boolean;
  /** accumulated pause time so remaining stays consistent on resume */
  pausedAt?: number;
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
  /** chain: next tween to start when this one finishes */
  next?: TweenEntry | null;
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
  easeInSine:      (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine:     (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine:   (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo:      (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo:     (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInBack:      (t) => { const c1=1.70158; return (c1+1)*t*t*t - c1*t*t; },
  easeOutBack:     (t) => { const c1=1.70158; return 1+(c1+1)*Math.pow(t-1,3)+c1*Math.pow(t-1,2); },
  spring:          (t) => 1 - Math.cos(t * Math.PI * (0.2 + 2.5 * t * t * t)) * Math.pow(1 - t, 2.2) + t * 0.22,
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
    anchor:          ANCHOR_MAP[opts.anchor] ?? opts.anchor ?? "topLeft",
    x:               opts.x ?? 0,
    y:               opts.y ?? 0,
    fontSize:        opts.size ?? opts.fontSize ?? 14,
    color:           opts.color ?? "#ffffff",
    backgroundColor: opts.bg ?? opts.backgroundColor,
    borderColor:     opts.borderColor,
    borderWidth:     opts.borderWidth,
    cornerRadius:    opts.cornerRadius ?? opts.radius,
    width:           opts.width,
    height:          opts.height,
    zIndex:          opts.zIndex ?? opts.z,
    opacity:         opts.opacity,
  };
}

// ── Helper: AABB slab test — returns tMin or -1 if no hit ────────────────────
function aabbSlabTest(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  px: number, py: number, pz: number,
  hx: number, hy: number, hz: number
): number {
  let tMin = 0, tMax = maxDist;
  let nX = 0, nY = 1, nZ = 0;

  if (Math.abs(dx) > 1e-10) {
    let t1 = (px - hx - ox) / dx, t2 = (px + hx - ox) / dx;
    if (t1 > t2) { const s=t1; t1=t2; t2=s; }
    if (t1 > tMin) { tMin=t1; nX=dx<0?1:-1; nY=0; nZ=0; }
    if (t2 < tMax) tMax=t2;
    if (tMax < tMin) return -1;
  } else if (ox < px - hx || ox > px + hx) return -1;

  if (Math.abs(dy) > 1e-10) {
    let t1 = (py - hy - oy) / dy, t2 = (py + hy - oy) / dy;
    if (t1 > t2) { const s=t1; t1=t2; t2=s; }
    if (t1 > tMin) { tMin=t1; nX=0; nY=dy<0?1:-1; nZ=0; }
    if (t2 < tMax) tMax=t2;
    if (tMax < tMin) return -1;
  } else if (oy < py - hy || oy > py + hy) return -1;

  if (Math.abs(dz) > 1e-10) {
    let t1 = (pz - hz - oz) / dz, t2 = (pz + hz - oz) / dz;
    if (t1 > t2) { const s=t1; t1=t2; t2=s; }
    if (t1 > tMin) { tMin=t1; nX=0; nY=0; nZ=dz<0?1:-1; }
    if (t2 < tMax) tMax=t2;
    if (tMax < tMin) return -1;
  } else if (oz < pz - hz || oz > pz + hz) return -1;

  return tMin >= 0 ? tMin : -1;
}

// ── ScriptRunner ──────────────────────────────────────────────────────────────

export class ScriptRunner {
  private globalHandlers   = new Map<string, EventHandler[]>();
  private objHandlers      = new Map<string, EventHandler[]>();
  private guiClickHandlers = new Map<string, EventHandler>();
  private guiInputHandlers = new Map<string, EventHandler>();
  private logs: string[]   = [];
  private guiElements                  = new Map<string, GuiElement>();
  private playerGuiElements            = new Map<string, Map<string, GuiElement>>();
  private playerGuiClickHandlers       = new Map<string, Map<string, EventHandler>>();
  private playerGuiInputHandlers       = new Map<string, Map<string, EventHandler>>();

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

  // NEW: world-space labels
  private worldLabels = new Map<string, WorldLabel>();
  // NEW: pending scene transitions
  private pendingSceneTransition: SceneTransition | null = null;
  // NEW: world / environment settings
  private worldSettings: Record<string, any> = {};

  // Input — unified event map keyed by "press" | "release" | "mouseclick" | "mousemove"
  private inputHandlers = new Map<string, EventHandler[]>();
  // Keys currently held by any player in this room
  private heldKeys                = new Set<string>();
  private perPlayerHeldKeys       = new Map<string, Set<string>>();
  private perPlayerInputHandlers  = new Map<string, Map<string, EventHandler[]>>();
  // NEW: per-player mouse position (NDC -1..1)
  private perPlayerMousePos       = new Map<string, { x: number; y: number }>();
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
      v.cross     = (o: any) => mkVec3(y*(o.z??0)-z*(o.y??0), z*(o.x??0)-x*(o.z??0), x*(o.y??0)-y*(o.x??0));
      v.distanceTo = (o: any) => { const dx=x-(o.x??0),dy=y-(o.y??0),dz=z-(o.z??0); return Math.sqrt(dx*dx+dy*dy+dz*dz); };
      v.lerp      = (o: any, t: number) => mkVec3(x+(((o.x??0)-x)*t), y+(((o.y??0)-y)*t), z+(((o.z??0)-z)*t));
      v.equals    = (o: any, eps = 1e-6) => Math.abs(x-(o.x??0))<eps && Math.abs(y-(o.y??0))<eps && Math.abs(z-(o.z??0))<eps;
      v.clone     = () => mkVec3(x, y, z);
      v.toArray   = () => [x, y, z];
      return v;
    }
    const Vector3 = Object.assign(
      (x=0,y=0,z=0) => mkVec3(x,y,z),
      {
        zero:    () => mkVec3(0,0,0),
        one:     () => mkVec3(1,1,1),
        up:      () => mkVec3(0,1,0),
        down:    () => mkVec3(0,-1,0),
        right:   () => mkVec3(1,0,0),
        left:    () => mkVec3(-1,0,0),
        forward: () => mkVec3(0,0,-1),
        back:    () => mkVec3(0,0,1),
        fromArray: (a: number[]) => mkVec3(a[0]??0, a[1]??0, a[2]??0),
        distance:  (a: any, b: any) => { const dx=(a.x??0)-(b.x??0),dy=(a.y??0)-(b.y??0),dz=(a.z??0)-(b.z??0); return Math.sqrt(dx*dx+dy*dy+dz*dz); },
        lerp:      (a: any, b: any, t: number) => mkVec3((a.x??0)+((b.x??0)-(a.x??0))*t, (a.y??0)+((b.y??0)-(a.y??0))*t, (a.z??0)+((b.z??0)-(a.z??0))*t),
        /** Reflect v around normal n */
        reflect:   (v: any, n: any) => { const d=2*((v.x??0)*(n.x??0)+(v.y??0)*(n.y??0)+(v.z??0)*(n.z??0)); return mkVec3((v.x??0)-d*(n.x??0),(v.y??0)-d*(n.y??0),(v.z??0)-d*(n.z??0)); },
        /** Angle in radians between two direction vectors */
        angle:     (a: any, b: any) => { const dot=(a.x??0)*(b.x??0)+(a.y??0)*(b.y??0)+(a.z??0)*(b.z??0); const ma=Math.sqrt((a.x??0)**2+(a.y??0)**2+(a.z??0)**2)||1; const mb=Math.sqrt((b.x??0)**2+(b.y??0)**2+(b.z??0)**2)||1; return Math.acos(Math.max(-1,Math.min(1,dot/(ma*mb)))); },
      }
    );

    // ── Color3 ────────────────────────────────────────────────────────────
    const Color3 = Object.assign(
      (r=0,g=0,b=0) => `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`,
      {
        fromRGB: (r=0,g=0,b=0) => `rgb(${r},${g},${b})`,
        fromHex: (h: string) => h,
        lerp: (a: string, b: string, t: number) => {
          // Simple hex lerp — accepts #rrggbb only
          const pa = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a);
          const pb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(b);
          if (!pa || !pb) return a;
          const ri = parseInt(pa[1],16), gi = parseInt(pa[2],16), bi = parseInt(pa[3],16);
          const ro = parseInt(pb[1],16), go = parseInt(pb[2],16), bo = parseInt(pb[3],16);
          const r = Math.round(ri+(ro-ri)*t), g = Math.round(gi+(go-gi)*t), bv = Math.round(bi+(bo-bi)*t);
          return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${bv.toString(16).padStart(2,"0")}`;
        },
        white: "#ffffff", black: "#000000", red: "#ff0000", green: "#00ff00",
        blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", magenta: "#ff00ff",
        transparent: "transparent",
      }
    );

    // ── Internal engine events (scripts cannot emit these) ────────────────
    const INTERNAL_ENTITY_EVENTS = new Set([
      "touched", "untouched", "touchstarted", "touchended",
      "clicked", "destroyed", "predestroy", "removing", "woke", "slept",
      "collisionstarted", "collisionended",
      "propertychanged", "changed",
      "died", "interact",
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

        // ── Entity health ───────────────────────────────────────────────────
        get health() { return obj.health ?? (obj.maxHealth ?? 100); },
        set health(v: any) {
          const mh = obj.maxHealth ?? 100;
          const newHP = Math.max(0, Math.min(mh, +v));
          obj.health = newHP;
          if (newHP <= 0 && !obj._destroyed) {
            runner._fireObj(obj.name, "died", ep); // always fires at 0 HP
            if (obj.autoDestroy !== false) {       // then conditionally destroy
              obj._destroyed = true; obj.visible = false;
              runner.destroyQueue.push(obj.name);
              runner.worldLabels.delete(`__label_${obj.name}`);
            }
          }
        },
        get maxHealth()         { return obj.maxHealth ?? 100; },
        set maxHealth(v: any)   { obj.maxHealth = Math.max(1, +v); if (obj.health === undefined) obj.health = obj.maxHealth; },
        get autoDestroy()       { return obj.autoDestroy !== false; },
        set autoDestroy(v: any) { obj.autoDestroy = Boolean(v); },
        takeDamage(amount: number) {
          const mh = obj.maxHealth ?? 100;
          const current = obj.health ?? mh;
          const newHP = Math.max(0, current - Math.max(0, +amount));
          obj.health = newHP;
          if (newHP <= 0 && !obj._destroyed) {
            runner._fireObj(obj.name, "died", ep); // always fires at 0 HP
            if (obj.autoDestroy !== false) {       // then conditionally destroy
              obj._destroyed = true; obj.visible = false;
              runner.destroyQueue.push(obj.name);
              runner.worldLabels.delete(`__label_${obj.name}`);
            }
          }
        },
        heal(amount: number) {
          const mh = obj.maxHealth ?? 100;
          const current = obj.health ?? mh;
          obj.health = Math.min(mh, current + Math.max(0, +amount));
        },

        // ── Interaction (E-key) ─────────────────────────────────────────────
        get interactionEnabled()         { return obj.interactionEnabled ?? false; },
        set interactionEnabled(v: any)   { obj.interactionEnabled = Boolean(v); },
        get interactionDistance()        { return obj.interactionDistance ?? 4; },
        set interactionDistance(v: any)  { obj.interactionDistance = Math.max(0.1, +v); },
        get interactionHint()            { return obj.interactionHint ?? "Press E to interact"; },
        set interactionHint(v: any)      { obj.interactionHint = String(v); },

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

        /** Attach a world-space label that follows this entity */
        setLabel(text: string | null, opts?: any) {
          const labelId = `__label_${obj.name}`;
          if (text === null) { runner.worldLabels.delete(labelId); return; }
          runner.worldLabels.set(labelId, {
            id: labelId,
            text: String(text),
            position: { x: obj.positionX, y: obj.positionY + (obj.scaleY ?? 1) * 0.5 + 0.4, z: obj.positionZ },
            color: opts?.color ?? "#ffffff",
            fontSize: opts?.fontSize ?? opts?.size ?? 12,
            backgroundColor: opts?.bg ?? opts?.backgroundColor,
            faceCamera: opts?.faceCamera !== false,
            visible: true,
            attachedTo: obj.name,
          });
        },

        destroy() {
          if (obj._destroyed) return;
          runner._fireObj(obj.name, "predestroy", ep);
          runner._fireObj(obj.name, "removing", ep);  // backward-compat alias
          obj._destroyed = true;
          obj.visible = false;
          runner.destroyQueue.push(obj.name);
          // Clean up any attached label
          runner.worldLabels.delete(`__label_${obj.name}`);
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
        hasAttribute(key: string) {
          return obj._attrs?.has(key) ?? false;
        },
        deleteAttribute(key: string) {
          obj._attrs?.delete(key);
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
      const getPlayerInputHandlers = () => {
        if (!runner.playerGuiInputHandlers.has(p.id)) runner.playerGuiInputHandlers.set(p.id, new Map());
        return runner.playerGuiInputHandlers.get(p.id)!;
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
        frame(id: string, opts?: any) {
          getPlayerMap().set(id, { id, kind:"frame", width:200, height:100, ...mapGuiOpts(opts), visible:true });
        },
        /** Text input field — fires onSubmit(text, player) when Enter pressed */
        input(id: string, opts?: any, onSubmit?: EventHandler) {
          getPlayerMap().set(id, { id, kind:"input", width:220, height:32, placeholder: opts?.placeholder ?? "", ...mapGuiOpts(opts), visible:true, clickable:true, inputType: opts?.inputType ?? "text" });
          if (onSubmit) getPlayerInputHandlers().set(id, onSubmit);
        },
        update(id: string, props: Partial<GuiElement>) {
          const existing = getPlayerMap().get(id);
          if (existing) getPlayerMap().set(id, { ...existing, ...props });
        },
        hide(id: string) {
          const el = getPlayerMap().get(id);
          if (el) getPlayerMap().set(id, { ...el, visible: false });
        },
        show(id: string) {
          const el = getPlayerMap().get(id);
          if (el) getPlayerMap().set(id, { ...el, visible: true });
        },
        clear(id?: string) {
          if (id !== undefined) { getPlayerMap().delete(id); getPlayerHandlers().delete(id); getPlayerInputHandlers().delete(id); }
          else { getPlayerMap().clear(); getPlayerHandlers().clear(); getPlayerInputHandlers().clear(); }
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
        decrement(key: string, amount = 1) {
          const d = getPlayerData();
          const n = (d.get(key) ?? 0) - amount;
          d.set(key, n);
          return n;
        },
        getAll() { return Object.fromEntries(getPlayerData()); },
        has(key: string) { return getPlayerData().has(key); },
      };

      const animator = {
        get current() { return runner._getAnimator(p.id).current; },
        get playing() { return runner._getAnimator(p.id).playing; },
        play(name: string, _opts?: any) {
          const anim = runner._getAnimator(p.id);
          anim.current = name;
          anim.playing = true;
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
        set maxSlots(v: number) { runner._getInventory(p.id).maxSlots = Math.max(1, +v); },
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
        /** Move all items from another player's inventory into this one */
        transferFrom(otherPlayer: any, itemName?: string) {
          const src = runner._getInventory(otherPlayer?.id ?? "");
          const dst = runner._getInventory(p.id);
          const toTransfer = itemName ? src.items.filter(i => i.name === itemName) : [...src.items];
          for (const item of toTransfer) {
            const existing = dst.items.find(i => i.name === item.name);
            if (existing) existing.count += item.count;
            else if (dst.items.length < dst.maxSlots) dst.items.push({ ...item });
            src.items = src.items.filter(i => i !== item);
          }
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
        /** Is this key currently held for this player? */
        key: (k: string) => runner.perPlayerHeldKeys.get(p.id)?.has(k.toLowerCase()) ?? false,
        /** Current mouse NDC position {x,y} in -1..1 range */
        get mouse() { return runner.perPlayerMousePos.get(p.id) ?? { x: 0, y: 0 }; },
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
        get onGround()   { return p.onGround ?? false; },

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
        get shirtColor()    { return p.shirtColor; },
        set shirtColor(v: any) { p.shirtColor=String(v); mut().shirtColor=String(v); },
        get skinColor()     { return p.skinColor; },
        set skinColor(v: any)  { p.skinColor=String(v); mut().skinColor=String(v); },
        get pantsColor()    { return p.pantsColor; },
        set pantsColor(v: any) { p.pantsColor=String(v); mut().pantsColor=String(v); },
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

        /** Distance to an entity or position */
        distanceTo(other: any): number {
          const tx = other?.position?.x ?? other?.x ?? 0;
          const ty = other?.position?.y ?? other?.y ?? 0;
          const tz = other?.position?.z ?? other?.z ?? 0;
          const dx = p.position.x - tx, dy = p.position.y - ty, dz = p.position.z - tz;
          return Math.sqrt(dx*dx + dy*dy + dz*dz);
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
        hasAttribute(k: string) { return p._attrs?.has(k) ?? false; },
        deleteAttribute(k: string) { p._attrs?.delete(k); },

        /** Kick a player from the server with an optional reason message */
        kick(reason?: string) {
          runner._fireGlobal("playerkick", makePlayerProxy(p), reason ?? "");
        },
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
      frame(id: string, opts?: any) {
        runner.guiElements.set(id, { id, kind:"frame", width:200, height:100, ...mapGuiOpts(opts), visible:true });
      },
      update(id: string, props: Partial<GuiElement>) {
        const existing = runner.guiElements.get(id);
        if (existing) runner.guiElements.set(id, { ...existing, ...props });
      },
      hide(id: string) {
        const el = runner.guiElements.get(id);
        if (el) runner.guiElements.set(id, { ...el, visible: false });
      },
      show(id: string) {
        const el = runner.guiElements.get(id);
        if (el) runner.guiElements.set(id, { ...el, visible: true });
      },
      clear(id?: string) {
        if (id !== undefined) { runner.guiElements.delete(id); runner.guiClickHandlers.delete(id); runner.guiInputHandlers.delete(id); }
        else { runner.guiElements.clear(); runner.guiClickHandlers.clear(); runner.guiInputHandlers.clear(); }
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
      keys()    { return Array.from(runner.gameState.keys()); },
      getAll()  { return Object.fromEntries(runner.gameState); },
      /** Increment numeric state value, returns new value */
      increment(key: string, amount = 1): number {
        const n = (runner.gameState.get(key) ?? 0) + amount;
        reburState.set(key, n);
        return n;
      },
      /** Set a key that auto-deletes after `seconds` */
      setTemporary(key: string, value: any, seconds: number) {
        reburState.set(key, value);
        _setTimeout(() => reburState.delete(key), seconds * 1000);
      },
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
      decrement(key: string, amount = 1) {
        const n = (runner.dataStore.get(key) ?? 0) - amount;
        runner.dataStore.set(key, n);
        return n;
      },
      has(key: string) { return runner.dataStore.has(key); },
      keys() { return Array.from(runner.dataStore.keys()); },
    };

    // ── Rebur.Workspace ───────────────────────────────────────────────────
    const isWorkspaceObj = (o: ScriptObjState) => {
      const c = o.container ?? "Workspace";
      return c === "Workspace" || c === "Scene" || c === "";
    };

    const isAssetsSharedObj = (c: string | null | undefined) => {
      if (!c) return false;
      return c === "Assets/Shared" || c.startsWith("Assets/Shared/");
    };

    const isAssetsServerObj = (c: string | null | undefined) => {
      if (!c) return false;
      return c === "Assets/Server" || c.startsWith("Assets/Server/");
    };

    // Shared raycast core — tests both static objects AND player capsules
    const _raycastAll = (
      ox: number, oy: number, oz: number,
      dx: number, dy: number, dz: number,
      maxDist: number,
      opts: any
    ): any[] => {
      const ignoreNames = new Set<string>(((opts?.ignore ?? []) as any[]).map((e: any) => e?.name).filter(Boolean));
      const filterTag: string | undefined = opts?.tag;
      const includePlayers: boolean = opts?.players !== false; // true by default
      const results: any[] = [];

      // Test static objects
      for (const obj of runner.objects.values()) {
        if (obj._destroyed) continue;
        if (ignoreNames.has(obj.name)) continue;
        if (filterTag && !(runner.tagMap.get(filterTag)?.has(obj.name))) continue;
        const hx=(obj.scaleX??1)/2, hy=(obj.scaleY??1)/2, hz=(obj.scaleZ??1)/2;
        const t = aabbSlabTest(ox,oy,oz,dx,dy,dz,maxDist, obj.positionX,obj.positionY,obj.positionZ, hx,hy,hz);
        if (t >= 0) {
          // Re-derive normal from the winning axis (simplified: use closest face)
          const nx = Math.abs(dx) > 1e-10 ? (dx < 0 ? 1 : -1) : 0;
          const ny = Math.abs(dy) > 1e-10 && nx === 0 ? (dy < 0 ? 1 : -1) : 0;
          const nz = nx === 0 && ny === 0 ? (dz < 0 ? 1 : -1) : 0;
          results.push({ entity: makeEntityProxy(obj), distance: t, point: {x:ox+dx*t,y:oy+dy*t,z:oz+dz*t}, normal:{x:nx,y:ny,z:nz}, isPlayer: false });
        }
      }

      // Test player capsules (approximated as AABB 0.5×1.8×0.5)
      if (includePlayers) {
        for (const p of runner.players.values()) {
          if (ignoreNames.has(p.name) || ignoreNames.has(p.id)) continue;
          const t = aabbSlabTest(ox,oy,oz,dx,dy,dz,maxDist, p.position.x, p.position.y+0.9, p.position.z, 0.5,0.9,0.5);
          if (t >= 0) {
            results.push({ entity: makePlayerProxy(p), distance: t, point: {x:ox+dx*t,y:oy+dy*t,z:oz+dz*t}, normal:{x:0,y:1,z:0}, isPlayer: true });
          }
        }
      }

      results.sort((a, b) => a.distance - b.distance);
      return results;
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

      /** Count entities matching an optional filter — cheaper than query().length */
      count(filter?: any): number {
        if (!filter) return Array.from(runner.objects.values()).filter(o => !o._destroyed && isWorkspaceObj(o)).length;
        return reburWorkspace.query(filter).length;
      },

      // ── Raycast — first hit (objects + player capsules) ────────────────
      raycast(origin: any, direction: any, opts?: any) {
        const ox=+(origin?.x??0), oy=+(origin?.y??0), oz=+(origin?.z??0);
        const maxDist=+(opts?.maxDistance??500);
        const rx=+(direction?.x??0), ry=+(direction?.y??0), rz=+(direction?.z??0);
        const rlen=Math.sqrt(rx*rx+ry*ry+rz*rz)||1;
        const hits = _raycastAll(ox,oy,oz, rx/rlen,ry/rlen,rz/rlen, maxDist, opts);
        return hits.length ? hits[0] : null;
      },

      // ── Raycast — ALL hits ─────────────────────────────────────────────
      raycastAll(origin: any, direction: any, opts?: any) {
        const ox=+(origin?.x??0), oy=+(origin?.y??0), oz=+(origin?.z??0);
        const maxDist=+(opts?.maxDistance??500);
        const rx=+(direction?.x??0), ry=+(direction?.y??0), rz=+(direction?.z??0);
        const rlen=Math.sqrt(rx*rx+ry*ry+rz*rz)||1;
        const hits = _raycastAll(ox,oy,oz, rx/rlen,ry/rlen,rz/rlen, maxDist, opts);
        return opts?.limit ? hits.slice(0, +(opts.limit)) : hits;
      },

      // ── Multiple simultaneous raycasts (spread / shotgun) ─────────────
      multiRaycast(rays: any[], opts?: any) {
        if (!Array.isArray(rays)) return [];
        return rays.map(r => reburWorkspace.raycast(
          r?.origin ?? r?.from ?? {x:0,y:0,z:0},
          r?.direction ?? r?.dir ?? {x:0,y:0,z:1},
          opts
        ));
      },

      // ── Sphere sweep ───────────────────────────────────────────────────
      sphereCast(origin: any, radius: number, direction: any, opts?: any) {
        const ox=+(origin?.x??0), oy=+(origin?.y??0), oz=+(origin?.z??0);
        const r=Math.max(0, +(radius??0.5));
        const maxDist=+(opts?.maxDistance??500);
        const rx=+(direction?.x??0), ry=+(direction?.y??0), rz=+(direction?.z??0);
        const rlen=Math.sqrt(rx*rx+ry*ry+rz*rz)||1;
        const dx=rx/rlen, dy=ry/rlen, dz=rz/rlen;
        const ignoreNames = new Set<string>(((opts?.ignore??[]) as any[]).map((e:any)=>e?.name).filter(Boolean));
        let best: any = null;

        for (const obj of runner.objects.values()) {
          if (obj._destroyed || ignoreNames.has(obj.name)) continue;
          const hx=(obj.scaleX??1)/2+r, hy=(obj.scaleY??1)/2+r, hz=(obj.scaleZ??1)/2+r;
          const t = aabbSlabTest(ox,oy,oz,dx,dy,dz,maxDist, obj.positionX,obj.positionY,obj.positionZ, hx,hy,hz);
          if (t >= 0 && (!best || t < best.distance)) {
            best = { entity: makeEntityProxy(obj), distance: t, point:{x:ox+dx*t,y:oy+dy*t,z:oz+dz*t}, normal:{x:0,y:1,z:0}, radius: r };
          }
        }
        // Also test players
        if (opts?.players !== false) {
          for (const p of runner.players.values()) {
            if (ignoreNames.has(p.name) || ignoreNames.has(p.id)) continue;
            const t = aabbSlabTest(ox,oy,oz,dx,dy,dz,maxDist, p.position.x,p.position.y+0.9,p.position.z, 0.5+r,0.9+r,0.5+r);
            if (t >= 0 && (!best || t < best.distance)) {
              best = { entity: makePlayerProxy(p), distance: t, point:{x:ox+dx*t,y:oy+dy*t,z:oz+dz*t}, normal:{x:0,y:1,z:0}, isPlayer: true };
            }
          }
        }
        return best;
      },

      // ── Sphere overlap ─────────────────────────────────────────────────
      overlapSphere(center: any, radius: number, opts?: any) {
        const cx=+(center?.x??0), cy=+(center?.y??0), cz=+(center?.z??0);
        const r=Math.max(0, +(radius??1));
        const filterTag: string | string[] | undefined = opts?.tag;
        const results: any[] = [];
        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (filterTag) {
            const tags = Array.isArray(filterTag) ? filterTag : [filterTag];
            if (!tags.every(t => runner.tagMap.get(t)?.has(obj.name))) continue;
          }
          const hx=(obj.scaleX??1)/2, hy=(obj.scaleY??1)/2, hz=(obj.scaleZ??1)/2;
          const cpx=Math.max(obj.positionX-hx,Math.min(cx,obj.positionX+hx));
          const cpy=Math.max(obj.positionY-hy,Math.min(cy,obj.positionY+hy));
          const cpz=Math.max(obj.positionZ-hz,Math.min(cz,obj.positionZ+hz));
          const ddx=cx-cpx, ddy=cy-cpy, ddz=cz-cpz;
          if (ddx*ddx+ddy*ddy+ddz*ddz <= r*r) results.push(makeEntityProxy(obj));
        }
        // Also include players in overlap if requested
        if (opts?.players !== false) {
          for (const p of runner.players.values()) {
            const dx=cx-p.position.x, dy=cy-(p.position.y+0.9), dz=cz-p.position.z;
            if (dx*dx+dy*dy+dz*dz <= r*r) results.push(makePlayerProxy(p));
          }
        }
        return results;
      },

      // ── Box overlap ────────────────────────────────────────────────────
      overlapBox(center: any, halfExtents: any, _rotation?: any, opts?: any) {
        const cx=+(center?.x??0), cy=+(center?.y??0), cz=+(center?.z??0);
        const hx=+(halfExtents?.x??1), hy=+(halfExtents?.y??1), hz=+(halfExtents?.z??1);
        const filterTag: string | string[] | undefined = opts?.tag ?? _rotation?.tag;
        const results: any[] = [];
        for (const obj of runner.objects.values()) {
          if (obj._destroyed) continue;
          if (filterTag) {
            const tags = Array.isArray(filterTag) ? filterTag : [filterTag];
            if (!tags.every(t => runner.tagMap.get(t)?.has(obj.name))) continue;
          }
          const ohx=(obj.scaleX??1)/2, ohy=(obj.scaleY??1)/2, ohz=(obj.scaleZ??1)/2;
          const ox=Math.min(cx+hx,obj.positionX+ohx)-Math.max(cx-hx,obj.positionX-ohx);
          const oy=Math.min(cy+hy,obj.positionY+ohy)-Math.max(cy-hy,obj.positionY-ohy);
          const oz=Math.min(cz+hz,obj.positionZ+ohz)-Math.max(cz-hz,obj.positionZ-ohz);
          if (ox>0&&oy>0&&oz>0) results.push(makeEntityProxy(obj));
        }
        if (opts?.players !== false) {
          for (const p of runner.players.values()) {
            const ox=Math.min(cx+hx,p.position.x+0.5)-Math.max(cx-hx,p.position.x-0.5);
            const oy=Math.min(cy+hy,(p.position.y+0.9)+0.9)-Math.max(cy-hy,(p.position.y+0.9)-0.9);
            const oz=Math.min(cz+hz,p.position.z+0.5)-Math.max(cz-hz,p.position.z-0.5);
            if (ox>0&&oy>0&&oz>0) results.push(makePlayerProxy(p));
          }
        }
        return results;
      },

      create(opts: any) {
        const name = opts.name ?? `Part_${++runner.timerIdCounter}`;
        const px=+(opts.position?.x??0), py=+(opts.position?.y??5), pz=+(opts.position?.z??0);
        const sx=+(opts.scale?.x??1), sy=+(opts.scale?.y??1), sz=+(opts.scale?.z??1);

        const placeholder: ScriptObjState = {
          id: `pending_${name}`, name,
          positionX: px, positionY: py, positionZ: pz,
          rotationX: +(opts.rotation?.x??0), rotationY: +(opts.rotation?.y??0), rotationZ: +(opts.rotation?.z??0),
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          visible: opts.visible !== false,
          anchored: opts.anchored ?? false,
          canCollide: opts.canCollide !== false,
          transparency: +(opts.transparency ?? 0),
          isTrigger: !!opts.isTrigger,
          velX: 0, velY: 0, velZ: 0,
          mass: +(opts.mass ?? 1),
          friction: +(opts.friction ?? 0.5),
          restitution: +(opts.restitution ?? 0),
        };
        runner.objects.set(name, placeholder);
        runner.createdObjects.push({
          name, primitiveType: opts.primitiveType ?? "cube",
          positionX: px, positionY: py, positionZ: pz,
          rotationX: +(opts.rotation?.x??0), rotationY: +(opts.rotation?.y??0), rotationZ: +(opts.rotation?.z??0),
          scaleX: sx, scaleY: sy, scaleZ: sz,
          color: opts.color ?? "#888888",
          anchored: opts.anchored ?? false,
          canCollide: opts.canCollide !== false,
          transparency: +(opts.transparency ?? 0),
          isTrigger: !!opts.isTrigger,
          container: opts.container,
        });

        const proxy = makeEntityProxy(placeholder);
        runner._fireGlobal("entityadded", proxy);
        return proxy;
      },

      /** Clone an existing entity by name */
      clone(sourceName: string, overrides?: any): any {
        const src = runner.objects.get(sourceName);
        if (!src || src._destroyed) return null;
        const name = overrides?.name ?? `${sourceName}_clone_${++runner.timerIdCounter}`;
        const cloned: ScriptObjState = { ...src, id: `pending_${name}`, name, _destroyed: false, _tags: undefined, _attrs: undefined };
        if (overrides?.position) { cloned.positionX=+(overrides.position.x??cloned.positionX); cloned.positionY=+(overrides.position.y??cloned.positionY); cloned.positionZ=+(overrides.position.z??cloned.positionZ); }
        if (overrides?.color) cloned.color = overrides.color;
        runner.objects.set(name, cloned);
        runner.createdObjects.push({
          name, primitiveType: cloned.primitiveType ?? "cube",
          positionX: cloned.positionX, positionY: cloned.positionY, positionZ: cloned.positionZ,
          rotationX: cloned.rotationX, rotationY: cloned.rotationY, rotationZ: cloned.rotationZ,
          scaleX: cloned.scaleX, scaleY: cloned.scaleY, scaleZ: cloned.scaleZ,
          color: cloned.color, anchored: cloned.anchored,
          canCollide: cloned.canCollide, transparency: cloned.transparency, isTrigger: !!cloned.isTrigger,
        });
        const proxy = makeEntityProxy(cloned);
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
      /** Player count */
      get count() { return runner.players.size; },
      /** Closest player to a world position (optionally excluding one player) */
      closest(position: any, exclude?: any): any {
        let best: any = null, bestDist = Infinity;
        const excludeId = typeof exclude === "string" ? exclude : exclude?.id;
        for (const p of runner.players.values()) {
          if (p.id === excludeId) continue;
          const dx=p.position.x-(position?.x??0), dy=p.position.y-(position?.y??0), dz=p.position.z-(position?.z??0);
          const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (d < bestDist) { bestDist=d; best=p; }
        }
        return best ? makePlayerProxy(best) : null;
      },
      /** Sort players by a numeric key (e.g. score), descending by default */
      ranked(key: string, ascending = false): any[] {
        return Array.from(runner.players.values())
          .map(p => makePlayerProxy(p))
          .sort((a, b) => {
            const va = a.data.get(key) ?? 0;
            const vb = b.data.get(key) ?? 0;
            return ascending ? va - vb : vb - va;
          });
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
      /** Play a sound for all players */
      play(id: string, opts?: { volume?: number; loop?: boolean; pitch?: number }) {
        runner.soundQueue.push({ soundId: id, options: opts });
      },
      /** Play a sound for a specific player only */
      playForPlayer(player: any, id: string, opts?: { volume?: number; loop?: boolean; pitch?: number }) {
        const pid = typeof player === "string" ? player : player?.id;
        if (pid) runner.soundQueue.push({ soundId: id, targetPlayerId: pid, options: opts });
      },
      /** Play a 3D positional sound at a world position */
      playAt(id: string, position: any, opts?: { volume?: number; loop?: boolean; maxDistance?: number }) {
        runner.soundQueue.push({ soundId: id, position: { x: +(position?.x??0), y: +(position?.y??0), z: +(position?.z??0) }, options: opts });
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
      const easeFn = typeof easing === "function" ? easing : (EASINGS[easing as string] ?? EASINGS.linear);
      const from: Record<string, number> = {};
      for (const key of Object.keys(to)) {
        try { from[key] = +(target[key] ?? 0); } catch { from[key] = 0; }
      }
      const entry: TweenEntry = {
        target, to, from, elapsed: 0,
        duration: Math.max(duration, 0.001),
        easing: easeFn, onDone, cancelled: false, next: null,
      };
      runner.tweens.push(entry);

      // Fluent builder returned to scripts
      const handle = {
        /** Cancel this tween */
        cancel() { entry.cancelled = true; },
        /** Chain: run another tween after this one completes */
        then(nextTarget: any, nextTo: Record<string, number>, nextDuration: number, nextEasing?: string | ((t: number) => number), nextDone?: () => void) {
          const nextEaseFn = typeof nextEasing === "function" ? nextEasing : (EASINGS[nextEasing as string] ?? EASINGS.linear);
          const nextFrom: Record<string, number> = {};
          for (const key of Object.keys(nextTo)) {
            try { nextFrom[key] = +(nextTarget[key] ?? 0); } catch { nextFrom[key] = 0; }
          }
          entry.next = { target: nextTarget, to: nextTo, from: nextFrom, elapsed: 0, duration: Math.max(nextDuration, 0.001), easing: nextEaseFn, onDone: nextDone, cancelled: false, next: null };
          return handle;
        },
        /** Convenience: chain same target with different properties */
        thenSelf(nextTo: Record<string, number>, nextDuration: number, nextEasing?: string | ((t: number) => number)) {
          return handle.then(target, nextTo, nextDuration, nextEasing);
        },
      };
      return handle;
    };

    // ── Rebur.Timer — named countdown / stopwatch ─────────────────────────
    const reburTimer = {
      /** Start a named countdown from `seconds`. Fires onDone when it hits 0. */
      countdown(name: string, seconds: number, onDone?: () => void): any {
        runner.gameState.set(`__timer_${name}`, seconds);
        const id = _setInterval(() => {
          const remaining = (runner.gameState.get(`__timer_${name}`) ?? 0) - 0.05;
          if (remaining <= 0) {
            runner.gameState.set(`__timer_${name}`, 0);
            runner.timerQueue.delete(id);
            if (onDone) try { onDone(); } catch { /* isolate */ }
          } else {
            runner.gameState.set(`__timer_${name}`, remaining);
          }
        }, 50);
        return {
          get remaining() { return Math.max(0, runner.gameState.get(`__timer_${name}`) ?? 0); },
          stop() { runner.timerQueue.delete(id); },
          pause() { const t = runner.timerQueue.get(id); if (t) t.paused = true; },
          resume() { const t = runner.timerQueue.get(id); if (t) t.paused = false; },
        };
      },
      /** Read any named timer's remaining value set via countdown() */
      get(name: string): number {
        return Math.max(0, runner.gameState.get(`__timer_${name}`) ?? 0);
      },
    };

    // ── Rebur.Math — game math utilities ─────────────────────────────────
    const reburMath = {
      /** Clamp value between min and max */
      clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      /** Linear interpolate */
      lerp: (a: number, b: number, t: number) => a + (b - a) * t,
      /** Inverse lerp — returns t such that lerp(a,b,t)===v */
      invLerp: (a: number, b: number, v: number) => a === b ? 0 : (v - a) / (b - a),
      /** Remap value from one range to another */
      remap: (v: number, inMin: number, inMax: number, outMin: number, outMax: number) => outMin + (outMax - outMin) * ((v - inMin) / (inMax - inMin)),
      /** Smoothstep [0,1] — ease in/out between edges */
      smoothstep: (edge0: number, edge1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); },
      /** Shorter of two angle difference in radians */
      angleDiff: (a: number, b: number) => { let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return d; },
      /** Lerp angle (radians) — takes shortest path */
      lerpAngle: (a: number, b: number, t: number) => { const d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + d * t; },
      /** Degrees → radians */
      deg2rad: (d: number) => d * Math.PI / 180,
      /** Radians → degrees */
      rad2deg: (r: number) => r * 180 / Math.PI,
      /** 2D distance */
      dist2d: (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax-bx)**2 + (ay-by)**2),
      /** 3D distance between two {x,y,z} objects */
      dist3d: (a: any, b: any) => { const dx=(a.x??0)-(b.x??0), dy=(a.y??0)-(b.y??0), dz=(a.z??0)-(b.z??0); return Math.sqrt(dx*dx+dy*dy+dz*dz); },
      /** Wrap value within [min, max] */
      wrap: (v: number, min: number, max: number) => { const range = max - min; return min + ((v - min) % range + range) % range; },
      /** Sign of a number: -1, 0, 1 */
      sign: (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0,
      /** Move value towards target by at most delta */
      moveTowards: (current: number, target: number, delta: number) => {
        const diff = target - current;
        if (Math.abs(diff) <= delta) return target;
        return current + Math.sign(diff) * delta;
      },
      /** Bearing angle in radians from position a to position b (XZ plane) */
      bearing: (a: any, b: any) => Math.atan2((b.x??0)-(a.x??0), (b.z??0)-(a.z??0)),
      /** Spring-damper smooth (like SmoothDamp) — call each tick */
      spring: (current: number, target: number, velocity: { v: number }, stiffness = 10, damping = 1, dt = 0.016) => {
        const force = (target - current) * stiffness - velocity.v * damping;
        velocity.v += force * dt;
        return current + velocity.v * dt;
      },
      /** All EASINGS exposed for direct use */
      easings: EASINGS,
      ease: (name: string, t: number) => (EASINGS[name] ?? EASINGS.linear)(Math.max(0, Math.min(1, t))),
    };

    // ── Rebur.Camera — writable settings + per-player ray helpers ─────────
    const reburCamera = {
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

      getPosition(player: any): {x:number;y:number;z:number} {
        const id = typeof player === "string" ? player : player?.id;
        return runner.playerCameraStates.get(id)?.pos ?? { x: 0, y: 10, z: 10 };
      },
      getForward(player: any): {x:number;y:number;z:number} {
        const id = typeof player === "string" ? player : player?.id;
        return runner.playerCameraStates.get(id)?.forward ?? { x: 0, y: 0, z: -1 };
      },
      getForwardRay(player: any): { origin:{x:number;y:number;z:number}; direction:{x:number;y:number;z:number} } | null {
        const id = typeof player === "string" ? player : player?.id;
        const state = runner.playerCameraStates.get(id);
        if (!state) {
          runner.logs.push(`[Rebur.Camera.getForwardRay] No camera state for player "${id}" — camera data not yet received from client. Returning null.`);
          return null;
        }
        return { origin: { ...state.pos }, direction: { ...state.forward } };
      },
      screenPointToRay(player: any, nx: number, ny: number, aspectRatio = 16/9): { origin:{x:number;y:number;z:number}; direction:{x:number;y:number;z:number} } | null {
        const id = typeof player === "string" ? player : player?.id;
        const state = runner.playerCameraStates.get(id);
        if (!state) return null;
        const fov = runner.cameraSettings.fov ?? 60;
        const tanHalfFov = Math.tan((fov * Math.PI / 180) / 2);
        const fw = state.forward;
        const wy = Math.abs(fw.y) < 0.98 ? { x:0, y:1, z:0 } : { x:1, y:0, z:0 };
        const rcx=fw.y*wy.z-fw.z*wy.y, rcy=fw.z*wy.x-fw.x*wy.z, rcz=fw.x*wy.y-fw.y*wy.x;
        const rlen=Math.sqrt(rcx*rcx+rcy*rcy+rcz*rcz)||1;
        const rx=rcx/rlen, ry=rcy/rlen, rz=rcz/rlen;
        const ux=ry*fw.z-rz*fw.y, uy=rz*fw.x-rx*fw.z, uz=rx*fw.y-ry*fw.x;
        const dirX=fw.x+nx*tanHalfFov*aspectRatio*rx+ny*tanHalfFov*ux;
        const dirY=fw.y+nx*tanHalfFov*aspectRatio*ry+ny*tanHalfFov*uy;
        const dirZ=fw.z+nx*tanHalfFov*aspectRatio*rz+ny*tanHalfFov*uz;
        const dlen=Math.sqrt(dirX*dirX+dirY*dirY+dirZ*dirZ)||1;
        return { origin: { ...state.pos }, direction: { x:dirX/dlen, y:dirY/dlen, z:dirZ/dlen } };
      },
      viewportPointToRay(player: any, vx: number, vy: number, aspectRatio = 16/9) {
        return reburCamera.screenPointToRay(player, vx*2-1, 1-vy*2, aspectRatio);
      },
      raycast(player: any, opts?: any) {
        const ray = reburCamera.getForwardRay(player);
        if (!ray) return null;
        return reburWorkspace.raycast(ray.origin, ray.direction, opts);
      },
      setForPlayer(player: any, opts: any) {
        const id = typeof player === "string" ? player : player?.id;
        if (!id || !opts) return;
        runner.perPlayerCameraSettings.set(id, { ...opts });
      },
      setForAll(opts: any) {
        if (!opts) return;
        for (const id of runner.players.keys()) runner.perPlayerCameraSettings.set(id, { ...opts });
      },
      clearForPlayer(player: any) {
        const id = typeof player === "string" ? player : player?.id;
        if (id) runner.perPlayerCameraSettings.delete(id);
      },
      /** Shake the camera for all players (or a single player) */
      shake(opts?: { intensity?: number; duration?: number; player?: any }) {
        const shakePayload = { intensity: +(opts?.intensity ?? 0.5), duration: +(opts?.duration ?? 0.3) };
        if (opts?.player) {
          const id = typeof opts.player === "string" ? opts.player : opts.player?.id;
          if (id) runner.perPlayerCameraSettings.set(id, { ...runner.perPlayerCameraSettings.get(id) ?? {}, _shake: shakePayload });
        } else {
          for (const id of runner.players.keys()) {
            runner.perPlayerCameraSettings.set(id, { ...runner.perPlayerCameraSettings.get(id) ?? {}, _shake: shakePayload });
          }
        }
      },
    };

    // ── Rebur.World — environment settings ───────────────────────────────
    const reburWorld = {
      get skyColor()     { return runner.worldSettings.skyColor ?? "#87ceeb"; },
      set skyColor(v: any)     { runner.worldSettings.skyColor = String(v); },
      get fogColor()     { return runner.worldSettings.fogColor ?? null; },
      set fogColor(v: any)     { runner.worldSettings.fogColor = v ? String(v) : null; },
      get fogDensity()   { return runner.worldSettings.fogDensity ?? 0; },
      set fogDensity(v: any)   { runner.worldSettings.fogDensity = Math.max(0, +v); },
      get fogNear()      { return runner.worldSettings.fogNear ?? 10; },
      set fogNear(v: any)      { runner.worldSettings.fogNear = +v; },
      get fogFar()       { return runner.worldSettings.fogFar ?? 100; },
      set fogFar(v: any)       { runner.worldSettings.fogFar = +v; },
      get ambientColor() { return runner.worldSettings.ambientColor ?? "#404040"; },
      set ambientColor(v: any) { runner.worldSettings.ambientColor = String(v); },
      get ambientIntensity() { return runner.worldSettings.ambientIntensity ?? 0.5; },
      set ambientIntensity(v: any) { runner.worldSettings.ambientIntensity = Math.max(0, +v); },
      get sunColor()     { return runner.worldSettings.sunColor ?? "#ffffff"; },
      set sunColor(v: any)     { runner.worldSettings.sunColor = String(v); },
      get sunIntensity() { return runner.worldSettings.sunIntensity ?? 1; },
      set sunIntensity(v: any) { runner.worldSettings.sunIntensity = Math.max(0, +v); },
      get sunDirection() { return runner.worldSettings.sunDirection ?? { x: 0.5, y: -1, z: 0.5 }; },
      set sunDirection(v: any) { runner.worldSettings.sunDirection = v; },
      get shadowsEnabled() { return runner.worldSettings.shadowsEnabled !== false; },
      set shadowsEnabled(v: any) { runner.worldSettings.shadowsEnabled = Boolean(v); },
      /** Time of day 0-24 */
      get timeOfDay()    { return runner.worldSettings.timeOfDay ?? 12; },
      set timeOfDay(v: any)    { runner.worldSettings.timeOfDay = Math.max(0, Math.min(24, +v)); },
    };

    // ── Rebur.Labels — world-space 3D text ──────────────────────────────
    const reburLabels = {
      create(id: string, text: string, position: any, opts?: any): any {
        const label: WorldLabel = {
          id, text,
          position: { x: +(position?.x??0), y: +(position?.y??0), z: +(position?.z??0) },
          color: opts?.color ?? "#ffffff",
          fontSize: opts?.fontSize ?? opts?.size ?? 14,
          backgroundColor: opts?.bg ?? opts?.backgroundColor,
          faceCamera: opts?.faceCamera !== false,
          visible: true,
        };
        runner.worldLabels.set(id, label);
        return {
          get text()     { return runner.worldLabels.get(id)?.text ?? ""; },
          set text(v: any) { const l = runner.worldLabels.get(id); if (l) l.text = String(v); },
          get visible()  { return runner.worldLabels.get(id)?.visible ?? false; },
          set visible(v: any) { const l = runner.worldLabels.get(id); if (l) l.visible = Boolean(v); },
          get position() { return runner.worldLabels.get(id)?.position ?? {x:0,y:0,z:0}; },
          set position(v: any) { const l = runner.worldLabels.get(id); if (l) l.position = {x:+(v?.x??0),y:+(v?.y??0),z:+(v?.z??0)}; },
          attach(entity: any) { const l = runner.worldLabels.get(id); if (l) l.attachedTo = entity?.name ?? undefined; },
          detach()       { const l = runner.worldLabels.get(id); if (l) l.attachedTo = undefined; },
          destroy()      { runner.worldLabels.delete(id); },
        };
      },
      get(id: string) { return runner.worldLabels.get(id) ?? null; },
      delete(id: string) { runner.worldLabels.delete(id); },
      clear() { runner.worldLabels.clear(); },
    };

    // ── Rebur.Scene — transitions / restarts ─────────────────────────────
    const reburScene = {
      /** Trigger a scene transition (fade out, reload, fade in) */
      transition(opts?: { type?: "fade"|"instant"|"slide"; color?: string; duration?: number; targetScene?: string }) {
        runner.pendingSceneTransition = {
          type: opts?.type ?? "fade",
          color: opts?.color ?? "#000000",
          duration: opts?.duration ?? 1.0,
          targetScene: opts?.targetScene,
        };
      },
      /** Restart the current scene/map */
      restart(opts?: { delay?: number; fadeColor?: string }) {
        const delay = +(opts?.delay ?? 0);
        const doRestart = () => {
          runner.pendingSceneTransition = { type: "fade", color: opts?.fadeColor ?? "#000000", duration: 1.0 };
          runner._fireGlobal("scenerestart");
        };
        if (delay > 0) _setTimeout(doRestart, delay * 1000);
        else doRestart();
      },
    };

    // ── Rebur.Debug — runtime visualization ────────────────────────────────
    const reburDebug = {
      drawRay(origin: any, direction: any, opts?: any) {
        const ox=+(origin?.x??0), oy=+(origin?.y??0), oz=+(origin?.z??0);
        const dx=+(direction?.x??0), dy=+(direction?.y??0), dz=+(direction?.z??0);
        const dl=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
        runner.debugDraws.push({ id:`dd_${++runner.timerIdCounter}`, kind:"ray", origin:{x:ox,y:oy,z:oz}, direction:{x:dx/dl,y:dy/dl,z:dz/dl}, length:+(opts?.length??opts?.maxDistance??10), color:opts?.color??"#00ff00", duration:+(opts?.duration??0) });
      },
      drawPoint(position: any, opts?: any) {
        runner.debugDraws.push({ id:`dd_${++runner.timerIdCounter}`, kind:"point", origin:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, radius:+(opts?.radius??opts?.size??0.15), color:opts?.color??"#ff0000", duration:+(opts?.duration??0) });
      },
      drawBox(center: any, size: any, opts?: any) {
        runner.debugDraws.push({ id:`dd_${++runner.timerIdCounter}`, kind:"box", origin:{x:+(center?.x??0),y:+(center?.y??0),z:+(center?.z??0)}, size:{x:+(size?.x??1),y:+(size?.y??1),z:+(size?.z??1)}, color:opts?.color??"#0088ff", duration:+(opts?.duration??0) });
      },
      drawSphere(center: any, radius: number, opts?: any) {
        runner.debugDraws.push({ id:`dd_${++runner.timerIdCounter}`, kind:"sphere", origin:{x:+(center?.x??0),y:+(center?.y??0),z:+(center?.z??0)}, radius:+(radius??0.5), color:opts?.color??"#ffaa00", duration:+(opts?.duration??0) });
      },
      drawLine(from: any, to: any, opts?: any) {
        runner.debugDraws.push({ id:`dd_${++runner.timerIdCounter}`, kind:"line", from:{x:+(from?.x??0),y:+(from?.y??0),z:+(from?.z??0)}, to:{x:+(to?.x??0),y:+(to?.y??0),z:+(to?.z??0)}, color:opts?.color??"#ffff00", duration:+(opts?.duration??0) });
      },
      /** Print to server log — same as top-level log() but prefixed */
      log: log,
      clear() { runner.debugDraws = []; },
    };

    // ── Rebur.Particles ───────────────────────────────────────────────────
    const reburParticles = {
      emit(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:opts?.effectType??opts?.type??"sparkle", color:opts?.color, count:opts?.count, speed:opts?.speed, size:opts?.size, lifetime:opts?.lifetime, direction:opts?.direction, spread:opts?.spread });
      },
      explosion(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"explosion", color:opts?.color??"#ff6600", count:opts?.count??40, speed:opts?.speed??8, size:opts?.size??0.3, lifetime:opts?.lifetime??1.2 });
      },
      muzzleFlash(position: any, direction?: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"muzzleFlash", direction:direction?{x:+(direction.x??0),y:+(direction.y??0),z:+(direction.z??0)}:undefined, color:opts?.color??"#ffff88", count:opts?.count??8, speed:opts?.speed??6, size:opts?.size??0.12, lifetime:opts?.lifetime??0.1 });
      },
      hit(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"hit", color:opts?.color??"#ffffff", count:opts?.count??10, speed:opts?.speed??4, size:opts?.size??0.08, lifetime:opts?.lifetime??0.4 });
      },
      smoke(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"smoke", color:opts?.color??"#888888", count:opts?.count??15, speed:opts?.speed??1.5, size:opts?.size??0.5, lifetime:opts?.lifetime??2.0 });
      },
      sparkle(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"sparkle", color:opts?.color??"#ffdd00", count:opts?.count??20, speed:opts?.speed??5, size:opts?.size??0.1, lifetime:opts?.lifetime??0.8 });
      },
      fire(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"fire", color:opts?.color??"#ff4400", count:opts?.count??25, speed:opts?.speed??2, size:opts?.size??0.2, lifetime:opts?.lifetime??1.5 });
      },
      pickup(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"pickup", color:opts?.color??"#00ffff", count:opts?.count??15, speed:opts?.speed??3, size:opts?.size??0.1, lifetime:opts?.lifetime??0.6 });
      },
      blood(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"blood", color:opts?.color??"#cc0000", count:opts?.count??12, speed:opts?.speed??3, size:opts?.size??0.1, lifetime:opts?.lifetime??0.6 });
      },
      water(position: any, opts?: any) {
        runner.particleEvents.push({ id:`pe_${++runner.timerIdCounter}`, position:{x:+(position?.x??0),y:+(position?.y??0),z:+(position?.z??0)}, effectType:"water", color:opts?.color??"#5599ff", count:opts?.count??20, speed:opts?.speed??2, size:opts?.size??0.15, lifetime:opts?.lifetime??1.0 });
      },
    };

    // ── Rebur.Input ────────────────────────────────────────────────────────
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
      /** Is a key currently held by any player? */
      key(k: string): boolean {
        return runner.heldKeys.has(k.toLowerCase());
      },
    };

    // ── Rebur.Physics ──────────────────────────────────────────────────────
    const reburPhysics = {
      get gravity()  { return runner.physicsSettings.gravity; },
      set gravity(v: any) {
        if (typeof v === "number") runner.physicsSettings.gravity = v;
        else if (v && typeof v === "object") runner.physicsSettings.gravity = v as any;
      },
      get airDrag()  { return runner.physicsSettings.airDrag; },
      set airDrag(v: any) { runner.physicsSettings.airDrag = Math.max(0, +v); },
      setGravityField(opts: any) {
        const id = ++runner.timerIdCounter;
        const dir = opts?.direction ? { x:+(opts.direction.x??0), y:+(opts.direction.y??-1), z:+(opts.direction.z??0) } : null;
        const field = { id, position:{x:+(opts?.position?.x??0),y:+(opts?.position?.y??0),z:+(opts?.position?.z??0)}, radius:+(opts?.radius??20), strength:+(opts?.strength??10), direction:dir, enabled:true };
        runner.gravityFields.push(field);
        return {
          get enabled() { return field.enabled; },
          set enabled(v: any) { field.enabled = Boolean(v); },
          remove() { const idx=runner.gravityFields.indexOf(field); if(idx>=0)runner.gravityFields.splice(idx,1); },
        };
      },
    };

    // ── Rebur.RunService ───────────────────────────────────────────────────
    const reburRunService = {
      on(phase: string, fn: EventHandler) {
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
      broadcast(event: string, payload?: any) {
        runner.networkMessages.push({ event, payload: payload ?? null });
      },
      sendTo(playerOrId: any, event: string, payload?: any) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
      },
      sendToMany(playersOrIds: any[], event: string, payload?: any) {
        for (const p of (playersOrIds ?? [])) {
          const id = typeof p === "string" ? p : p?.id;
          if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
        }
      },
      send(playerOrId: any, event: string, payload?: any) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        if (id) runner.networkToPlayer.push({ playerId: id, event, payload: payload ?? null });
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
    };

    // ── Rebur.Lighting ─────────────────────────────────────────────────────
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
      // World / environment settings — same backing store as Rebur.World (both namespaces work)
      get skyColor()           { return runner.worldSettings.skyColor ?? "#87ceeb"; },
      set skyColor(v: any)           { runner.worldSettings.skyColor = String(v); },
      get fogColor()           { return runner.worldSettings.fogColor ?? null; },
      set fogColor(v: any)           { runner.worldSettings.fogColor = v ? String(v) : null; },
      get fogDensity()         { return runner.worldSettings.fogDensity ?? 0; },
      set fogDensity(v: any)         { runner.worldSettings.fogDensity = Math.max(0, +v); },
      get fogNear()            { return runner.worldSettings.fogNear ?? 10; },
      set fogNear(v: any)            { runner.worldSettings.fogNear = +v; },
      get fogFar()             { return runner.worldSettings.fogFar ?? 100; },
      set fogFar(v: any)             { runner.worldSettings.fogFar = +v; },
      get ambientColor()       { return runner.worldSettings.ambientColor ?? "#404040"; },
      set ambientColor(v: any)       { runner.worldSettings.ambientColor = String(v); },
      get ambientIntensity()   { return runner.worldSettings.ambientIntensity ?? 0.5; },
      set ambientIntensity(v: any)   { runner.worldSettings.ambientIntensity = Math.max(0, +v); },
      get sunColor()           { return runner.worldSettings.sunColor ?? "#ffffff"; },
      set sunColor(v: any)           { runner.worldSettings.sunColor = String(v); },
      get sunIntensity()       { return runner.worldSettings.sunIntensity ?? 1; },
      set sunIntensity(v: any)       { runner.worldSettings.sunIntensity = Math.max(0, +v); },
      get sunDirection()       { return runner.worldSettings.sunDirection ?? { x: 0.5, y: -1, z: 0.5 }; },
      set sunDirection(v: any)       { runner.worldSettings.sunDirection = v; },
      get shadowsEnabled()     { return runner.worldSettings.shadowsEnabled !== false; },
      set shadowsEnabled(v: any)     { runner.worldSettings.shadowsEnabled = Boolean(v); },
      get timeOfDay()          { return runner.worldSettings.timeOfDay ?? 12; },
      set timeOfDay(v: any)          { runner.worldSettings.timeOfDay = Math.max(0, Math.min(24, +v)); },
    };

    // ── Rebur.Assets ───────────────────────────────────────────────────────
    const reburAssetsShared = {
      find(name: string) { const obj=runner.objects.get(name); return(obj&&!obj._destroyed&&isAssetsSharedObj(obj.container))?makeEntityProxy(obj):null; },
      get(id: string) { for(const obj of runner.objects.values())if(obj.id===id&&!obj._destroyed&&isAssetsSharedObj(obj.container))return makeEntityProxy(obj); return null; },
      all() { return Array.from(runner.objects.values()).filter(o=>!o._destroyed&&isAssetsSharedObj(o.container)).map(o=>makeEntityProxy(o)); },
    };
    const reburAssetsServer = {
      find(name: string) { const obj=runner.objects.get(name); return(obj&&!obj._destroyed&&isAssetsServerObj(obj.container))?makeEntityProxy(obj):null; },
      get(id: string) { for(const obj of runner.objects.values())if(obj.id===id&&!obj._destroyed&&isAssetsServerObj(obj.container))return makeEntityProxy(obj); return null; },
      all() { return Array.from(runner.objects.values()).filter(o=>!o._destroyed&&isAssetsServerObj(o.container)).map(o=>makeEntityProxy(o)); },
    };

    // ── Rebur global ───────────────────────────────────────────────────────
    const Rebur = {
      on(event: string, fn: EventHandler) {
        const key = event.toLowerCase();
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
      // NEW namespaces
      Math:       reburMath,
      Timer:      reburTimer,
      World:      reburWorld,
      Labels:     reburLabels,
      Scene:      reburScene,
    };

    // ── Convenience proxies ────────────────────────────────────────────────
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
      if (timer.paused) continue;
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
      const t = Math.min(tw.elapsed / tw.duration, 1);
      const et = tw.easing(t);
      for (const [key, toVal] of Object.entries(tw.to)) {
        try { tw.target[key] = tw.from[key] + (toVal - tw.from[key]) * et; } catch { /* stale proxy */ }
      }
      if (t >= 1) {
        try { tw.onDone?.(); } catch { /* isolate */ }
        // Chain support
        if (tw.next && !tw.next.cancelled) {
          // Snapshot "from" values at chain start time
          for (const key of Object.keys(tw.next.to)) {
            try { tw.next.from[key] = +(tw.next.target[key] ?? 0); } catch { tw.next.from[key] = 0; }
          }
          this.tweens.push(tw.next);
        }
        done.push(i);
      }
    }
    for (let i = done.length - 1; i >= 0; i--) this.tweens.splice(done[i], 1);

    // Update world-label positions for entities they're attached to
    for (const label of this.worldLabels.values()) {
      if (!label.attachedTo) continue;
      const obj = this.objects.get(label.attachedTo);
      if (obj && !obj._destroyed) {
        label.position = { x: obj.positionX, y: obj.positionY + (obj.scaleY ?? 1) * 0.5 + 0.4, z: obj.positionZ };
      }
    }

    this._fireGlobal("tick", dt);
  }

  // ── Public event firing (called by GameRoom) ────────────────────────────────

  firePlayerAdded(player: ScriptPlayerState) {
    this._fireGlobal("playerjoined", this._makePlayerProxy(player));
  }
  firePlayerRemoving(player: ScriptPlayerState) {
    this._fireGlobal("playerleft", this._makePlayerProxy(player));
    this.clearPlayerGui(player.id);
    this.removePlayerCameraState(player.id);
    this.clearPlayerHeldKeys(player.id);
    this.perPlayerMousePos.delete(player.id);
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
  /** Called by GameRoom when client reports mouse move — nx/ny in [-1,1] NDC */
  fireMouseMove(player: ScriptPlayerState, nx: number, ny: number) {
    this.perPlayerMousePos.set(player.id, { x: nx, y: ny });
    const pp = this._makePlayerProxy(player);
    for (const h of this.inputHandlers.get("mousemove") ?? []) {
      try { h(pp, nx, ny); } catch { /* isolate */ }
    }
    for (const h of this.perPlayerInputHandlers.get(player.id)?.get("mousemove") ?? []) {
      try { h(nx, ny); } catch { /* isolate */ }
    }
  }
  fireInputPress(key: string, player: ScriptPlayerState) {
    this.heldKeys.add(key.toLowerCase());
    if (!this.perPlayerHeldKeys.has(player.id)) this.perPlayerHeldKeys.set(player.id, new Set());
    this.perPlayerHeldKeys.get(player.id)!.add(key.toLowerCase());
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
    this.perPlayerHeldKeys.get(player.id)?.delete(key.toLowerCase());
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
  /** Called when a GUI input field submits (player presses Enter) */
  fireGuiInput(elementId: string, value: string, player: ScriptPlayerState) {
    const perPlayer = this.playerGuiInputHandlers.get(player.id);
    const ph = perPlayer?.get(elementId);
    if (ph) { try { ph(value, this._makePlayerProxy(player)); } catch { /* isolate */ } return; }
    const h = this.guiInputHandlers.get(elementId);
    if (h) try { h(value, this._makePlayerProxy(player)); } catch { /* isolate */ }
  }
  updateHeldKeys(keys: Set<string>) {
    this.heldKeys = keys;
  }
  updatePlayerHeldKeys(playerId: string, keys: Set<string>) {
    if (keys.size === 0) this.perPlayerHeldKeys.delete(playerId);
    else this.perPlayerHeldKeys.set(playerId, new Set(keys));
  }
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
    this.playerGuiInputHandlers.delete(playerId);
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
  /** Drain and return any pending scene transition (consumed once) */
  drainSceneTransition(): SceneTransition | null {
    const t = this.pendingSceneTransition;
    this.pendingSceneTransition = null;
    return t;
  }
  /** Snapshot of all active world labels (not drained — GameRoom reads each tick) */
  getWorldLabels(): WorldLabel[] { return Array.from(this.worldLabels.values()); }
  getCameraSettings()  { return { ...this.cameraSettings }; }
  getPlayerCameraOverride(playerId: string): Record<string, any> | undefined {
    return this.perPlayerCameraSettings.get(playerId);
  }
  getPhysicsSettings() { return { gravity: this.physicsSettings.gravity, airDrag: this.physicsSettings.airDrag }; }
  getGravityFields()   { return this.gravityFields; }
  /** Snapshot world settings (sky, fog, sun etc.) for the client renderer */
  getWorldSettings(): Record<string, any> { return { ...this.worldSettings }; }

  updatePlayerCameraState(playerId: string, pos: {x:number;y:number;z:number}, forward: {x:number;y:number;z:number}) {
    this.playerCameraStates.set(playerId, { pos, forward });
  }
  removePlayerCameraState(playerId: string) {
    this.playerCameraStates.delete(playerId);
  }

  getMotorSlots(playerId: string): Record<string, { objectId: string; objectName: string; offset: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number} } | null> {
    const motorMap = this.playerMotors.get(playerId);
    if (!motorMap || motorMap.size === 0) return {};
    const result: Record<string, any> = {};
    for (const [slot, obj] of motorMap) {
      result[slot] = {
        objectId: obj.id, objectName: obj.name,
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
    const getPlayerInputHandlers = () => {
      if (!this.playerGuiInputHandlers.has(p.id)) this.playerGuiInputHandlers.set(p.id, new Map());
      return this.playerGuiInputHandlers.get(p.id)!;
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
      get onGround()  { return p.onGround ?? false; },
      get position()  { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
      set position(v: any) { mut().teleport = { x:+(v?.x??0), y:+(v?.y??0), z:+(v?.z??0) }; },
      get rotation()  { return { x: 0, y: p.heading ?? 0, z: 0 }; },
      set rotation(v: any) { const y=+(v?.y??0); p.heading=y; mut().heading=y; },
      get health()           { return p.health; },
      set health(v: any)     { const n=Math.max(0,+v); p.health=n; mut().health=n; },
      get maxHealth()        { return p.maxHealth; },
      set maxHealth(v: any)  { const n=Math.max(1,+v); p.maxHealth=n; mut().maxHealth=n; },
      get walkSpeed()        { return p.speed; },
      set walkSpeed(v: any)  { const n=Math.max(0,+v); p.speed=n; mut().speed=n; },
      get runSpeed()         { return p.runSpeed ?? p.speed*1.6; },
      set runSpeed(v: any)   { const n=Math.max(0,+v); p.runSpeed=n; mut().runSpeed=n; },
      get jumpPower()        { return p.jumpPower; },
      set jumpPower(v: any)  { const n=Math.max(0,+v); p.jumpPower=n; mut().jumpPower=n; },
      get color()            { return p.shirtColor; },
      set color(v: any)      { p.shirtColor=String(v); mut().shirtColor=String(v); },
      get shirtColor()       { return p.shirtColor; },
      set shirtColor(v: any) { p.shirtColor=String(v); mut().shirtColor=String(v); },
      get skinColor()        { return p.skinColor; },
      set skinColor(v: any)  { p.skinColor=String(v); mut().skinColor=String(v); },
      get pantsColor()       { return p.pantsColor; },
      set pantsColor(v: any) { p.pantsColor=String(v); mut().pantsColor=String(v); },
      get spawnPoint()       { return { x:p.spawnX??0, y:p.spawnY??0, z:p.spawnZ??0 }; },
      set spawnPoint(v: any) { p.spawnX=+(v?.x??0); p.spawnY=+(v?.y??0); p.spawnZ=+(v?.z??0); mut().spawnPoint={x:p.spawnX,y:p.spawnY,z:p.spawnZ}; },
      get respawn()    { return false; },
      set respawn(v: any) { if(v) mut().respawn=true; },
      get autoRespawn()   { return p._autoRespawn !== false; },
      set autoRespawn(v: any) { p._autoRespawn=Boolean(v); mut().autoRespawn=Boolean(v); },
      get isKinematic()       { return p.isKinematic ?? false; },
      set isKinematic(v: any) { p.isKinematic=Boolean(v); mut().isKinematic=Boolean(v); },
      distanceTo(other: any): number {
        const tx=other?.position?.x??other?.x??0, ty=other?.position?.y??other?.y??0, tz=other?.position?.z??other?.z??0;
        const dx=p.position.x-tx, dy=p.position.y-ty, dz=p.position.z-tz;
        return Math.sqrt(dx*dx+dy*dy+dz*dz);
      },
      kick(reason?: string) { self._fireGlobal("playerkick", this, reason ?? ""); },
      on(event: string, fn: EventHandler) {
        const key=`player::${p.id}::${event.toLowerCase()}`;
        const arr=self.objHandlers.get(key)??[];
        arr.push(fn);
        self.objHandlers.set(key,arr);
        return ()=>self.objHandlers.set(key,(self.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      off(event: string, fn: EventHandler) {
        const key=`player::${p.id}::${event.toLowerCase()}`;
        self.objHandlers.set(key,(self.objHandlers.get(key)??[]).filter(h=>h!==fn));
      },
      emit(event: string, ...args: any[]) {
        const key=`player::${p.id}::${event.toLowerCase()}`;
        for(const h of self.objHandlers.get(key)??[]){try{h(...args);}catch{/*isolate*/}}
        return true;
      },
      setAttribute(k: string, v: any) { if(!p._attrs)p._attrs=new Map(); p._attrs.set(k,v); },
      getAttribute(k: string) { return p._attrs?.get(k); },
      hasAttribute(k: string) { return p._attrs?.has(k)??false; },
      deleteAttribute(k: string) { p._attrs?.delete(k); },
      gui: {
        text:   (id: string, text: string, opts?: any) => { getPlayerMap().set(id,{id,kind:"text",text,...mapGuiOpts(opts),visible:true}); },
        button: (id: string, text: string, opts?: any, onClick?: any) => { getPlayerMap().set(id,{id,kind:"button",text,width:160,height:36,...mapGuiOpts(opts),visible:true,clickable:true}); if(onClick)getPlayerHandlers().set(id,onClick); },
        bar:    (id: string, value: number, maxValue: number, opts?: any) => { getPlayerMap().set(id,{id,kind:"bar",value,maxValue,width:200,height:14,...mapGuiOpts(opts),visible:true}); },
        image:  (id: string, url: string, opts?: any) => { getPlayerMap().set(id,{id,kind:"image",imageUrl:url,width:64,height:64,...mapGuiOpts(opts),visible:true}); },
        frame:  (id: string, opts?: any) => { getPlayerMap().set(id,{id,kind:"frame",width:200,height:100,...mapGuiOpts(opts),visible:true}); },
        input:  (id: string, opts?: any, onSubmit?: any) => { getPlayerMap().set(id,{id,kind:"input",width:220,height:32,placeholder:opts?.placeholder??"",inputType:opts?.inputType??"text",...mapGuiOpts(opts),visible:true,clickable:true}); if(onSubmit)getPlayerInputHandlers().set(id,onSubmit); },
        update: (id: string, props: Partial<GuiElement>) => { const e=getPlayerMap().get(id); if(e)getPlayerMap().set(id,{...e,...props}); },
        hide:   (id: string) => { const e=getPlayerMap().get(id); if(e)getPlayerMap().set(id,{...e,visible:false}); },
        show:   (id: string) => { const e=getPlayerMap().get(id); if(e)getPlayerMap().set(id,{...e,visible:true}); },
        clear:  (id?: string) => { if(id!==undefined){getPlayerMap().delete(id);getPlayerHandlers().delete(id);getPlayerInputHandlers().delete(id);}else{getPlayerMap().clear();getPlayerHandlers().clear();getPlayerInputHandlers().clear();} },
      },
      data: {
        get:       (key: string) => getPlayerData().get(key),
        set:       (key: string, value: any) => { getPlayerData().set(key,value); },
        delete:    (key: string) => { getPlayerData().delete(key); },
        increment: (key: string, amount=1) => { const d=getPlayerData(); const n=(d.get(key)??0)+amount; d.set(key,n); return n; },
        decrement: (key: string, amount=1) => { const d=getPlayerData(); const n=(d.get(key)??0)-amount; d.set(key,n); return n; },
        has:       (key: string) => getPlayerData().has(key),
        getAll:    () => Object.fromEntries(getPlayerData()),
      },
      animator: {
        get current() { return self._getAnimator(p.id).current; },
        get playing() { return self._getAnimator(p.id).playing; },
        play(name: string, _opts?: any) { const a=self._getAnimator(p.id); a.current=name; a.playing=true; },
        stop() { self._getAnimator(p.id).playing=false; },
        on(ev: string, fn: any) {
          if(ev==="done"){ const a=self._getAnimator(p.id); a.doneHandlers.push(fn); return ()=>{const a=self._getAnimator(p.id);a.doneHandlers=a.doneHandlers.filter(h=>h!==fn);}; }
          return ()=>{};
        },
      },
      inventory: {
        get items() { return [...self._getInventory(p.id).items]; },
        get maxSlots() { return self._getInventory(p.id).maxSlots; },
        set maxSlots(v: number) { self._getInventory(p.id).maxSlots=Math.max(1,+v); },
        get equipped() { const eq=self._getInventory(p.id).equipped; return eq?(self._getInventory(p.id).items.find(i=>i.name===eq)??null):null; },
        add(name: string, opts?: any): InventoryItem | null {
          const store=self._getInventory(p.id); if(store.items.length>=store.maxSlots)return null;
          const count=opts?.count??1; const existing=store.items.find(i=>i.name===name);
          if(existing){existing.count+=count;return{...existing};}
          const item:InventoryItem={id:Math.random().toString(36).slice(2),name,count,data:opts?.data??{}};
          store.items.push(item);return{...item};
        },
        remove(name: string, count=1): number {
          const store=self._getInventory(p.id); const idx=store.items.findIndex(i=>i.name===name);
          if(idx===-1)return 0; const item=store.items[idx]; const removed=Math.min(count,item.count);
          item.count-=removed; if(item.count<=0){store.items.splice(idx,1);if(store.equipped===name)store.equipped=null;} return removed;
        },
        has(name: string, count=1): boolean { return(self._getInventory(p.id).items.find(i=>i.name===name)?.count??0)>=count; },
        get(name: string): InventoryItem | null { const item=self._getInventory(p.id).items.find(i=>i.name===name); return item?{...item}:null; },
        equip(nameOrNull: string|null): boolean {
          const store=self._getInventory(p.id); if(nameOrNull===null){store.equipped=null;return true;}
          if(!store.items.find(i=>i.name===nameOrNull))return false; store.equipped=nameOrNull; return true;
        },
        drop(_name: string, _count=1): null { return null; },
        clear() { const store=self._getInventory(p.id); store.items=[]; store.equipped=null; },
      },
      motors: {
        attach(slot: string, entity: any) { const obj=entity?.name?self.objects.get(entity.name):undefined; if(obj)self._getMotors(p.id).set(slot.toLowerCase(),obj); },
        detach(slot: string): any { const m=self._getMotors(p.id); const obj=m.get(slot.toLowerCase()); m.delete(slot.toLowerCase()); return obj?self._makeEntityProxyByName(obj.name):null; },
        get(slot: string): any { const obj=self._getMotors(p.id).get(slot.toLowerCase()); return obj?self._makeEntityProxyByName(obj.name):null; },
      },
      input: {
        key: (k: string) => self.perPlayerHeldKeys.get(p.id)?.has(k.toLowerCase())??false,
        get mouse() { return self.perPlayerMousePos.get(p.id)??{x:0,y:0}; },
        on: (event: string, fn: EventHandler) => {
          const k=event.toLowerCase();
          if(!self.perPlayerInputHandlers.has(p.id))self.perPlayerInputHandlers.set(p.id,new Map());
          const evtMap=self.perPlayerInputHandlers.get(p.id)!;
          const arr=evtMap.get(k)??[]; arr.push(fn); evtMap.set(k,arr);
          const unsub=()=>evtMap.set(k,(evtMap.get(k)??[]).filter(h=>h!==fn));
          if(!self.perPlayerInputUnsubs.has(p.id))self.perPlayerInputUnsubs.set(p.id,[]);
          self.perPlayerInputUnsubs.get(p.id)!.push(unsub); return unsub;
        },
        off: (event: string, fn: EventHandler) => {
          const k=event.toLowerCase(); const evtMap=self.perPlayerInputHandlers.get(p.id);
          if(evtMap)evtMap.set(k,(evtMap.get(k)??[]).filter(h=>h!==fn));
        },
      },
      body: {
        get velocity() { return{x:p.vx??0,y:p.vy??0,z:p.vz??0}; },
        set velocity(v: any) { const m=mut(); m.velX=+(v?.x??0); m.velY=+(v?.y??0); m.velZ=+(v?.z??0); },
        applyForce(f: any) { const dt=0.05; const m=mut(); m.impulseX=(m.impulseX??0)+(+(f?.x??0))*dt; m.impulseY=(m.impulseY??0)+(+(f?.y??0))*dt; m.impulseZ=(m.impulseZ??0)+(+(f?.z??0))*dt; },
        applyImpulse(f: any) { const m=mut(); m.impulseX=(m.impulseX??0)+(+(f?.x??0)); m.impulseY=(m.impulseY??0)+(+(f?.y??0)); m.impulseZ=(m.impulseZ??0)+(+(f?.z??0)); },
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

  makePlayerProxyPublic(p: ScriptPlayerState): any {
    return this._makePlayerProxy(p);
  }
  makeEntityProxyPublic(name: string): any {
    return this._makeEntityProxyByName(name);
  }
}