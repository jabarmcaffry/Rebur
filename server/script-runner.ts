import { 
  RenderObject, 
  RenderPlayer, 
  RenderGuiElement, 
  DebugDraw, 
  ParticleEvent
} from "../shared/render-types";

type WorldSettings = Record<string, any>;
type PhysicsSettings = Record<string, any>;

// --- Types & Interfaces ---

export interface ScriptObjState extends RenderObject {
  _destroyed?: boolean;
  _parentName?: string;
  _tags?: Set<string>;
  _attrs?: Map<string, any>;
  health?: number;
  maxHealth?: number;
  autoDestroy?: boolean;
  interactionEnabled?: boolean;
  interactionDistance?: number;
  interactionHint?: string;
  gravity?: any;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  anchored?: boolean;
  canCollide?: boolean;
  // Physics body properties
  velX?: number;
  velY?: number;
  velZ?: number;
  avX?: number;
  avY?: number;
  avZ?: number;
  torqueX?: number;
  torqueY?: number;
  torqueZ?: number;
  forceX?: number;
  forceY?: number;
  forceZ?: number;
  impulseX?: number;
  impulseY?: number;
  impulseZ?: number;
  mass?: number;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  isKinematic?: boolean;
  constraints?: {
    lockPositionX?: boolean;
    lockPositionY?: boolean;
    lockPositionZ?: boolean;
    lockRotationX?: boolean;
    lockRotationY?: boolean;
    lockRotationZ?: boolean;
  };
}

export interface ScriptPlayerState extends RenderPlayer {
  _attrs?: Map<string, any>;
  onGround: boolean;
  heading?: number;
  speed?: number;
  jumpPower?: number;
  shirtColor?: string;
  skinColor?: string;
  pantsColor?: string;
}

type EventHandler = (...args: any[]) => void;

interface TweenEntry {
  target: any;
  to: Record<string, number>;
  from: Record<string, number>;
  elapsed: number;
  duration: number;
  easing: (t: number) => number;
  onDone?: () => void;
  cancelled: boolean;
  next: TweenEntry | null;
}

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInBack: (t) => { const s = 1.70158; return t * t * ((s + 1) * t - s); },
  easeOutBack: (t) => { const s = 1.70158; return (--t) * t * ((s + 1) * t + s) + 1; },
  spring: (t) => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6),
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  elastic: (t) => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
};

// --- ScriptRunner Class ---

export class ScriptRunner {
  objects = new Map<string, ScriptObjState>();
  players = new Map<string, ScriptPlayerState>();
  
  // Handlers
  globalHandlers = new Map<string, EventHandler[]>();
  objHandlers = new Map<string, EventHandler[]>();
  networkHandlers = new Map<string, EventHandler[]>();
  inputHandlers = new Map<string, EventHandler[]>();
  
  // Per-player state
  perPlayerHeldKeys = new Map<string, Set<string>>();
  perPlayerMousePos = new Map<string, { x: number; y: number }>();
  perPlayerInputHandlers = new Map<string, Map<string, EventHandler[]>>();
  
  // Game state & storage
  gameState = new Map<string, any>();
  dataStore = new Map<string, any>();
  playerData = new Map<string, Map<string, any>>();
  
  // Output queues for GameRoom
  guiElements = new Map<string, RenderGuiElement>();
  perPlayerGui = new Map<string, Map<string, RenderGuiElement>>();
  guiClickHandlers = new Map<string, EventHandler>();
  guiInputHandlers = new Map<string, (text: string) => void>();
  
  soundQueue: any[] = [];
  particleEvents: ParticleEvent[] = [];
  debugDraws: DebugDraw[] = [];
  networkMessages: any[] = [];
  networkToPlayer: any[] = [];
  
  worldSettings: Partial<WorldSettings> = {};
  physicsSettings: Partial<PhysicsSettings> = { gravity: 9.81, airDrag: 0.01 };
  gravityFields: any[] = [];
  
  tweens: TweenEntry[] = [];
  timerIdCounter = 0;
  destroyQueue: string[] = [];
  
  // Camera state
  globalCamera: any = { position: { x: 0, y: 20, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70 };
  perPlayerCamera = new Map<string, any>();
  cameraShakes: any[] = [];

  constructor() {}

  // ── Internal Helpers ──────────────────────────────────────────────────────

  _fireGlobal(event: string, ...args: any[]) {
    const handlers = this.globalHandlers.get(event.toLowerCase());
    if (handlers) {
      for (const h of handlers) {
        try { h(...args); } catch (e) { console.error(`Script error in global event ${event}:`, e); }
      }
    }
  }

  _fireObj(objName: string, event: string, ...args: any[]) {
    const key = `${objName}::${event.toLowerCase()}`;
    const handlers = this.objHandlers.get(key);
    if (handlers) {
      for (const h of handlers) {
        try { h(...args); } catch (e) { console.error(`Script error in object event ${objName}:${event}:`, e); }
      }
    }
  }

  _getPlayerData(playerId: string) {
    if (!this.playerData.has(playerId)) this.playerData.set(playerId, new Map());
    return this.playerData.get(playerId)!;
  }

  // ── API Setup ─────────────────────────────────────────────────────────────

  init(code: string, initialObjects: ScriptObjState[]) {
    const runner = this;
    for (const obj of initialObjects) {
      this.objects.set(obj.name, { ...obj });
    }

    // Utility globals
    const log = (...args: any[]) => console.log("[Script Log]", ...args);
    const warn = (...args: any[]) => console.warn("[Script Warn]", ...args);
    const error = (...args: any[]) => console.error("[Script Error]", ...args);
    
    const after = (s: number, fn: () => void) => {
      const id = setTimeout(fn, s * 1000);
      return () => clearTimeout(id);
    };
    const every = (s: number, fn: () => void) => {
      const id = setInterval(fn, s * 1000);
      return () => clearInterval(id);
    };
    const wait = (s: number) => new Promise(resolve => setTimeout(resolve, s * 1000));

    const random = (min: number, max?: number) => max === undefined ? Math.random() * min : min + Math.random() * (max - min);
    const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    const Vector3 = (x=0, y=0, z=0) => ({
      x, y, z,
      get magnitude() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); },
      add(v: any) { return Vector3(this.x + (v.x??0), this.y + (v.y??0), this.z + (v.z??0)); },
      sub(v: any) { return Vector3(this.x - (v.x??0), this.y - (v.y??0), this.z - (v.z??0)); },
      scale(s: number) { return Vector3(this.x * s, this.y * s, this.z * s); },
      normalize() { const m = this.magnitude; return m > 0 ? this.scale(1/m) : Vector3(0,0,0); },
      dot(v: any) { return this.x*(v.x??0) + this.y*(v.y??0) + this.z*(v.z??0); },
      distanceTo(v: any) { return Math.sqrt((this.x-(v.x??0))**2 + (this.y-(v.y??0))**2 + (this.z-(v.z??0))**2); },
      clone() { return Vector3(this.x, this.y, this.z); }
    });
    Object.assign(Vector3, {
      zero: () => Vector3(0,0,0), one: () => Vector3(1,1,1), up: () => Vector3(0,1,0), forward: () => Vector3(0,0,1), right: () => Vector3(1,0,0),
      distance: (a: any, b: any) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2),
      lerp: (a: any, b: any, t: number) => Vector3(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t, a.z + (b.z-a.z)*t)
    });

    const Color3 = (r=1, g=1, b=1) => `rgb(${Math.floor(r*255)},${Math.floor(g*255)},${Math.floor(b*255)})`;
    Color3.fromHex = (hex: string) => hex;
    Color3.lerp = (a: string, b: string, t: number) => a; // Stub

    // ── Proxies ──────────────────────────────────────────────────────────────

    const makeEntityProxy = (obj: ScriptObjState): any => {
      const body = {
        get anchored()      { return obj.anchored; },
        set anchored(v)     { obj.anchored = Boolean(v); },
        get canCollide()    { return obj.canCollide !== false; },
        set canCollide(v)   { obj.canCollide = Boolean(v); },
        get isKinematic()   { return obj.isKinematic ?? false; },
        set isKinematic(v)  { obj.isKinematic = Boolean(v); },
        get mass()          { return obj.mass ?? 1; },
        set mass(v)         { obj.mass = Math.max(0.01, +v); },
        get friction()      { return obj.friction ?? 0.5; },
        set friction(v)     { obj.friction = Math.max(0, +v); },
        get restitution()   { return obj.restitution ?? 0; },
        set restitution(v)  { obj.restitution = Math.max(0, Math.min(1, +v)); },
        get velocity()       { return { x: obj.velX??0, y: obj.velY??0, z: obj.velZ??0 }; },
        set velocity(v: any) { obj.velX = +(v?.x??0); obj.velY = +(v?.y??0); obj.velZ = +(v?.z??0); },
        get angularVelocity() { return { x: obj.avX??0, y: obj.avY??0, z: obj.avZ??0 }; },
        set angularVelocity(v: any) { obj.avX = +(v?.x??0); obj.avY = +(v?.y??0); obj.avZ = +(v?.z??0); },
        get linearDamping()   { return obj.linearDamping ?? 0; },
        set linearDamping(v)  { obj.linearDamping = +v; },
        get angularDamping()  { return obj.angularDamping ?? 0.05; },
        set angularDamping(v) { obj.angularDamping = +v; },
        get constraints()     { return obj.constraints ?? {}; },
        set constraints(v)    { obj.constraints = v; },
        
        applyForce(f: any) { obj.forceX = (obj.forceX ?? 0) + (+(f?.x ?? 0)); obj.forceY = (obj.forceY ?? 0) + (+(f?.y ?? 0)); obj.forceZ = (obj.forceZ ?? 0) + (+(f?.z ?? 0)); },
        applyImpulse(f: any) { obj.impulseX = (obj.impulseX ?? 0) + (+(f?.x ?? 0)); obj.impulseY = (obj.impulseY ?? 0) + (+(f?.y ?? 0)); obj.impulseZ = (obj.impulseZ ?? 0) + (+(f?.z ?? 0)); },
        applyTorque(t: any) { obj.torqueX = (obj.torqueX ?? 0) + (+(t?.x ?? 0)); obj.torqueY = (obj.torqueY ?? 0) + (+(t?.y ?? 0)); obj.torqueZ = (obj.torqueZ ?? 0) + (+(t?.z ?? 0)); },
        applyAngularImpulse(t: any) { obj.avX = (obj.avX ?? 0) + (+(t?.x ?? 0)); obj.avY = (obj.avY ?? 0) + (+(t?.y ?? 0)); obj.avZ = (obj.avZ ?? 0) + (+(t?.z ?? 0)); },
        clearForces() { obj.forceX = obj.forceY = obj.forceZ = obj.torqueX = obj.torqueY = obj.torqueZ = 0; }
      };

      const ep: any = {
        get id()        { return obj.id; },
        get name()      { return obj.name; },
        set name(v)     { obj.name = String(v); },
        get type()      { return obj.type ?? "primitive"; },
        get isPlayer()  { return false; },
        get destroyed() { return obj._destroyed === true; },

        get position() { return { x: obj.positionX, y: obj.positionY, z: obj.positionZ }; },
        set position(v: any) { obj.positionX = +(v?.x ?? obj.positionX); obj.positionY = +(v?.y ?? obj.positionY); obj.positionZ = +(v?.z ?? obj.positionZ); },
        get rotation() { return { x: obj.rotationX, y: obj.rotationY, z: obj.rotationZ }; },
        set rotation(v: any) { obj.rotationX = +(v?.x ?? obj.rotationX); obj.rotationY = +(v?.y ?? obj.rotationY); obj.rotationZ = +(v?.z ?? obj.rotationZ); },
        get scale() { return { x: obj.scaleX, y: obj.scaleY, z: obj.scaleZ }; },
        set scale(v: any) { obj.scaleX = +(v?.x ?? obj.scaleX); obj.scaleY = +(v?.y ?? obj.scaleY); obj.scaleZ = +(v?.z ?? obj.scaleZ); },

        get color()        { return obj.color; },
        set color(v)       { obj.color = String(v); },
        get visible()      { return obj.visible; },
        set visible(v)     { obj.visible = Boolean(v); },
        get transparency() { return obj.transparency ?? 0; },
        set transparency(v){ obj.transparency = Math.max(0, Math.min(1, +v)); },

        get health() { return obj.health ?? (obj.maxHealth ?? 100); },
        set health(v: any) { obj.health = Math.max(0, Math.min(obj.maxHealth ?? 100, +v)); },
        get maxHealth() { return obj.maxHealth ?? 100; },
        set maxHealth(v: any) { obj.maxHealth = Math.max(1, +v); },

        get body() { return body; },
        get gravity() { return obj.gravity ?? false; },
        set gravity(v: any) { obj.gravity = v; },

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
        setParent(parentEntity: any, opts?: { keepWorldPosition?: boolean }) {
          if (!parentEntity) { obj._parentName = undefined; return; }
          obj._parentName = parentEntity.name;
        },
        find(childName: string) {
          return Array.from(runner.objects.values()).find(o => !o._destroyed && o._parentName === obj.name && o.name === childName);
        },
        descendants() {
          const results: any[] = [];
          const walk = (name: string) => {
            for (const o of runner.objects.values()) {
              if (!o._destroyed && o._parentName === name) {
                results.push(makeEntityProxy(o));
                walk(o.name);
              }
            }
          };
          walk(obj.name);
          return results;
        },

        setLabel(text: string | null, opts?: any) {
          const labelId = `__label_${obj.name}`;
          if (text === null) { runner.perPlayerGui.forEach(m => m.delete(labelId)); return; }
          // Simplified: using GUI system for labels
        },

        destroy() {
          if (obj._destroyed) return;
          obj._destroyed = true;
          obj.visible = false;
          runner.destroyQueue.push(obj.name);
          runner._fireObj(obj.name, "destroy");
          runner._fireGlobal("entityremoved", ep);
        },

        on(event: string, fn: EventHandler) {
          const key = `${obj.name}::${event.toLowerCase()}`;
          const arr = runner.objHandlers.get(key) ?? [];
          arr.push(fn);
          runner.objHandlers.set(key, arr);
          return () => runner.objHandlers.set(key, (runner.objHandlers.get(key)??[]).filter(h=>h!==fn));
        }
      };
      return ep;
    };

    const makePlayerProxy = (p: ScriptPlayerState): any => {
      const data = {
        get: (k: string) => runner._getPlayerData(p.id).get(k),
        set: (k: string, v: any) => runner._getPlayerData(p.id).set(k, v),
        increment: (k: string, n=1) => { const v = (runner._getPlayerData(p.id).get(k)??0)+n; runner._getPlayerData(p.id).set(k,v); return v; },
        decrement: (k: string, n=1) => { const v = (runner._getPlayerData(p.id).get(k)??0)-n; runner._getPlayerData(p.id).set(k,v); return v; },
        has: (k: string) => runner._getPlayerData(p.id).has(k),
        delete: (k: string) => runner._getPlayerData(p.id).delete(k),
        getAll: () => Object.fromEntries(runner._getPlayerData(p.id))
      };

      const gui = {
        text: (id: string, text: string, opts?: any) => {
          if (!runner.perPlayerGui.has(p.id)) runner.perPlayerGui.set(p.id, new Map());
          runner.perPlayerGui.get(p.id)!.set(id, { id, kind:"text", text, ...opts, visible:true });
        },
        button: (id: string, text: string, opts?: any, onClick?: EventHandler) => {
          if (!runner.perPlayerGui.has(p.id)) runner.perPlayerGui.set(p.id, new Map());
          runner.perPlayerGui.get(p.id)!.set(id, { id, kind:"button", text, ...opts, visible:true, clickable:true });
          if (onClick) runner.guiClickHandlers.set(`${p.id}::${id}`, onClick);
        },
        bar: (id: string, value: number, maxValue: number, opts?: any) => {
          if (!runner.perPlayerGui.has(p.id)) runner.perPlayerGui.set(p.id, new Map());
          runner.perPlayerGui.get(p.id)!.set(id, { id, kind:"bar", value, maxValue, ...opts, visible:true });
        },
        image: (id: string, url: string, opts?: any) => {
          if (!runner.perPlayerGui.has(p.id)) runner.perPlayerGui.set(p.id, new Map());
          runner.perPlayerGui.get(p.id)!.set(id, { id, kind:"image", imageUrl:url, ...opts, visible:true });
        },
        input: (id: string, opts?: any, onInput?: (text: string) => void) => {
          if (!runner.perPlayerGui.has(p.id)) runner.perPlayerGui.set(p.id, new Map());
          runner.perPlayerGui.get(p.id)!.set(id, { id, kind:"text", text: opts?.placeholder??"", ...opts, visible:true, clickable:true });
          if (onInput) runner.guiInputHandlers.set(`${p.id}::${id}`, onInput);
        },
        clear: (id?: string) => {
          const m = runner.perPlayerGui.get(p.id);
          if (!m) return;
          if (id) { m.delete(id); runner.guiClickHandlers.delete(`${p.id}::${id}`); runner.guiInputHandlers.delete(`${p.id}::${id}`); }
          else { m.clear(); }
        }
      };

      const input = {
        key: (k: string) => runner.perPlayerHeldKeys.get(p.id)?.has(k.toLowerCase()) ?? false,
        get mouse() { return runner.perPlayerMousePos.get(p.id) ?? { x: 0, y: 0 }; },
        gamepad: {
          axis: (a: string) => ({ x: 0, y: 0 }),
          button: (b: string) => false,
          on: (e: string, fn: EventHandler) => {}
        },
        on: (event: string, fn: EventHandler) => {
          const k = event.toLowerCase();
          if (!runner.perPlayerInputHandlers.has(p.id)) runner.perPlayerInputHandlers.set(p.id, new Map());
          const m = runner.perPlayerInputHandlers.get(p.id)!;
          if (!m.has(k)) m.set(k, []);
          m.get(k)!.push(fn);
        }
      };

      return {
        id: p.id,
        username: p.name,
        isPlayer: true,
        get position() { return { x: p.position.x, y: p.position.y, z: p.position.z }; },
        set position(v: any) { (p as any).teleport = { x: +(v?.x??0), y: +(v?.y??0), z: +(v?.z??0) }; },
        get rotation() { return { x: 0, y: p.heading ?? 0, z: 0 }; },
        set rotation(v: any) { p.heading = +(v?.y ?? 0); },
        get health() { return p.health; },
        set health(v: any) { p.health = Math.max(0, +v); },
        get maxHealth() { return p.maxHealth; },
        set maxHealth(v: any) { p.maxHealth = Math.max(1, +v); },
        get speed() { return p.speed; },
        set speed(v: any) { p.speed = +v; },
        get jump() { return p.jumpPower; },
        set jump(v: any) { p.jumpPower = +v; },
        get color() { return p.shirtColor; },
        set color(v: any) { p.shirtColor = String(v); },
        get gui() { return gui; },
        get data() { return data; },
        get input() { return input; },
        get body() {
          return {
            get velocity() { return { x: 0, y: 0, z: 0 }; },
            set velocity(v: any) { (p as any).velX = +(v?.x??0); (p as any).velY = +(v?.y??0); (p as any).velZ = +(v?.z??0); },
            get isKinematic() { return false; },
            set isKinematic(v: any) {}
          };
        }
      };
    };

    const reburTween = {
      to: (target: any, to: Record<string, number>, duration = 1, opts?: any) => {
        const from: Record<string, number> = {};
        for (const key of Object.keys(to)) from[key] = Number(target[key] ?? 0);
        const entry: TweenEntry = {
          target,
          to,
          from,
          elapsed: 0,
          duration: Math.max(0.001, Number(duration) || 0.001),
          easing: EASINGS[opts?.easing] ?? EASINGS.linear,
          onDone: opts?.onDone,
          cancelled: false,
          next: null,
        };
        runner.tweens.push(entry);
        return {
          cancel: () => { entry.cancelled = true; },
          then: (nextTo: Record<string, number>, nextDuration = duration, nextOpts?: any) => {
            const nextFrom: Record<string, number> = {};
            for (const key of Object.keys(nextTo)) nextFrom[key] = Number(to[key] ?? target[key] ?? 0);
            entry.next = {
              target,
              to: nextTo,
              from: nextFrom,
              elapsed: 0,
              duration: Math.max(0.001, Number(nextDuration) || 0.001),
              easing: EASINGS[nextOpts?.easing] ?? EASINGS.linear,
              onDone: nextOpts?.onDone,
              cancelled: false,
              next: null,
            };
            return entry;
          }
        };
      },
      cancel: (target: any) => { for (const t of runner.tweens) if (t.target === target) t.cancelled = true; }
    };

    // ── Rebur Global ──────────────────────────────────────────────────────────

    const Rebur = {
      on: (e: string, fn: EventHandler) => runner.on(e, fn),
      Workspace: {
        find: (n: string) => { const o = runner.objects.get(n); return o && !o._destroyed ? makeEntityProxy(o) : null; },
        get: (id: string) => { for(const o of runner.objects.values()) if(o.id===id && !o._destroyed) return makeEntityProxy(o); return null; },
        all: () => Array.from(runner.objects.values()).filter(o => !o._destroyed).map(o => makeEntityProxy(o)),
        query: (f: any) => Array.from(runner.objects.values()).filter(o => !o._destroyed).map(o => makeEntityProxy(o)),
        create: (type: string, props?: any) => {
          const name = props?.name ?? `Entity_${++runner.timerIdCounter}`;
          const obj: ScriptObjState = { id: `id_${name}`, name, type: type as any, positionX: 0, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1, color: "#ffffff", visible: true, ...props };
          runner.objects.set(name, obj);
          return makeEntityProxy(obj);
        },
        clone: (n: string, o?: any) => {
          const src = runner.objects.get(n);
          if (!src) return null;
          return Rebur.Workspace.create(src.type as any, { ...src, ...o, id: `id_${Date.now()}` });
        },
        raycast: (o: any, d: any, opts?: any) => null
      },
      Players: {
        all: () => Array.from(runner.players.values()).map(p => makePlayerProxy(p)),
        find: (n: string) => { for(const p of runner.players.values()) if(p.name === n) return makePlayerProxy(p); return null; },
        get: (id: string) => { const p = runner.players.get(id); return p ? makePlayerProxy(p) : null; },
        get count() { return runner.players.size; },
        closest: (pos: any, exc?: any) => null
      },
      Lighting: {
        skyColor: "#87CEEB", fogColor: "#ffffff", fogDensity: 0.02, fogNear: 10, fogFar: 100, ambientColor: "#404040", ambientIntensity: 0.5, sunColor: "#ffffff", sunIntensity: 1.0, sunDirection: { x: 0.5, y: -1, z: 0.5 }, shadowsEnabled: true, timeOfDay: 14,
        find: (n: string) => null
      },
      Assets: {
        Shared: { find: (n: string) => null },
        Server: { find: (n: string) => null }
      },
      State: {
        set: (k: string, v: any) => runner.gameState.set(k, v),
        get: (k: string) => runner.gameState.get(k),
        increment: (k: string, n=1) => { const v = (runner.gameState.get(k)??0)+n; runner.gameState.set(k, v); return v; },
        decrement: (k: string, n=1) => { const v = (runner.gameState.get(k)??0)-n; runner.gameState.set(k, v); return v; },
        setTemporary: (k: string, v: any, s: number) => { runner.gameState.set(k, v); setTimeout(() => runner.gameState.delete(k), s*1000); },
        on: (k: string, fn: any) => {},
        delete: (k: string) => runner.gameState.delete(k),
        keys: () => Array.from(runner.gameState.keys()),
        getAll: () => Object.fromEntries(runner.gameState)
      },
      DataStore: {
        get: (k: string) => runner.dataStore.get(k),
        set: (k: string, v: any) => runner.dataStore.set(k, v),
        increment: (k: string, n=1) => { const v = (runner.dataStore.get(k)??0)+n; runner.dataStore.set(k, v); return v; },
        decrement: (k: string, n=1) => { const v = (runner.dataStore.get(k)??0)-n; runner.dataStore.set(k, v); return v; },
        has: (k: string) => runner.dataStore.has(k),
        delete: (k: string) => runner.dataStore.delete(k),
        keys: () => Array.from(runner.dataStore.keys())
      },
      Gui: {
        text: (id: string, text: string, opts?: any) => runner.guiElements.set(id, { id, kind:"text", text, ...opts, visible:true }),
        button: (id: string, text: string, opts?: any, onClick?: EventHandler) => { runner.guiElements.set(id, { id, kind:"button", text, ...opts, visible:true, clickable:true }); if (onClick) runner.guiClickHandlers.set(id, onClick); },
        bar: (id: string, value: number, maxValue: number, opts?: any) => runner.guiElements.set(id, { id, kind:"bar", value, maxValue, ...opts, visible:true }),
        image: (id: string, url: string, opts?: any) => runner.guiElements.set(id, { id, kind:"image", imageUrl:url, ...opts, visible:true }),
        clear: (id?: string) => { if (id) { runner.guiElements.delete(id); runner.guiClickHandlers.delete(id); } else { runner.guiElements.clear(); runner.guiClickHandlers.clear(); } }
      },
      Sound: {
        play: (id: string, opts?: any) => runner.soundQueue.push({ soundId: id, options: opts }),
        playAt: (id: string, pos: any, opts?: any) => runner.soundQueue.push({ soundId: id, position: pos, options: opts }),
        playForPlayer: (p: any, id: string, opts?: any) => runner.soundQueue.push({ soundId: id, targetPlayerId: p.id, options: opts }),
        stop: (id: string) => {},
        fade: (id: string, v: number, s: number) => {}
      },
      Tween: reburTween,
      Camera: {
        position: { x: 0, y: 20, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70,
        setForPlayer: (p: any, opts: any) => runner.perPlayerCamera.set(p.id, opts),
        clearForPlayer: (p: any) => runner.perPlayerCamera.delete(p.id),
        setForAll: (opts: any) => { runner.globalCamera = { ...runner.globalCamera, ...opts }; },
        shake: (opts: any) => runner.cameraShakes.push(opts),
        getForwardRay: (p: any) => null,
        raycast: (p: any, opts?: any) => null
      },
      Input: {
        on: (e: string, fn: EventHandler) => {
          const k = e.toLowerCase();
          if (!runner.inputHandlers.has(k)) runner.inputHandlers.set(k, []);
          runner.inputHandlers.get(k)!.push(fn);
          return () => runner.inputHandlers.set(k, (runner.inputHandlers.get(k) ?? []).filter(h => h !== fn));
        },
        key: (k: string) => Array.from(runner.perPlayerHeldKeys.values()).some(keys => keys.has(String(k).toLowerCase()))
      },
      Physics: {
        gravity: 9.81, airDrag: 0.01, timeScale: 1.0,
        setGravityField: (opts: any) => ({ enabled: true, remove: () => {} }),
        createJoint: (type: string, a: any, b: any, opts?: any) => ({ enabled: true, destroy: () => {} })
      },
      Network: {
        broadcast: (e: string, p?: any) => runner.networkMessages.push({ event: e, payload: p }),
        send: (p: any, e: string, pay?: any) => runner.networkToPlayer.push({ playerId: p.id, event: e, payload: pay }),
        sendToMany: (ps: any[], e: string, pay?: any) => ps.forEach(p => Rebur.Network.send(p, e, pay)),
        on: (e: string, fn: EventHandler) => {
          const k = e.toLowerCase();
          if (!runner.networkHandlers.has(k)) runner.networkHandlers.set(k, []);
          runner.networkHandlers.get(k)!.push(fn);
          return () => runner.networkHandlers.set(k, (runner.networkHandlers.get(k) ?? []).filter(h => h !== fn));
        }
      },
      Tags: {
        add: (e: any, t: string) => {},
        has: (e: any, t: string) => false,
        all: (e: any) => [],
        get: (t: string) => [],
        remove: (e: any, t: string) => {}
      },
      Math: reburMath,
      Timer: reburTimer,
      Labels: {
        create: (id: string, text: string, pos: any, opts?: any) => ({ text, position: pos, visible: true, destroy: () => {} }),
        get: (id: string) => null,
        delete: (id: string) => {},
        clear: () => {}
      },
      Scene: {
        transition: (opts: any) => {},
        restart: (opts?: any) => {}
      },
      Debug: {
        drawRay: (o: any, d: any, opts?: any) => {},
        drawPoint: (p: any, opts?: any) => {},
        drawBox: (p: any, s: any, opts?: any) => {},
        drawSphere: (p: any, r: number, opts?: any) => {},
        drawLine: (a: any, b: any, opts?: any) => {},
        drawCapsule: (s: any, e: any, r: number, opts?: any) => {},
        log: (m: string) => console.log("[Debug]", m),
        clear: () => {}
      }
    };

    // --- Execution ---

    const PARAMS = [
      "Rebur", "after", "every", "wait", "random", "randInt", "pick", "log", "warn", "error", "Vector3", "Color3"
    ];
    
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor as any;
    try {
      const fn = new AsyncFunc(...PARAMS, code);
      fn(Rebur, after, every, wait, random, randInt, pick, log, warn, error, Vector3, Color3);
    } catch (e) {
      error("Script execution failed:", e);
    }
  }

  on(event: string, fn: EventHandler) {
    const key = event.toLowerCase();
    if (!this.globalHandlers.has(key)) this.globalHandlers.set(key, []);
    this.globalHandlers.get(key)!.push(fn);
    return () => this.globalHandlers.set(key, (this.globalHandlers.get(key)??[]).filter(h => h !== fn));
  }

  tick(dt: number) {
    // Process tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      if (t.cancelled) { this.tweens.splice(i, 1); continue; }
      t.elapsed += dt;
      const progress = Math.min(1, t.elapsed / t.duration);
      const eased = t.easing(progress);
      for (const key of Object.keys(t.to)) {
        t.target[key] = t.from[key] + (t.to[key] - t.from[key]) * eased;
      }
      if (progress >= 1) {
        if (t.onDone) t.onDone();
        if (t.next) this.tweens[i] = t.next;
        else this.tweens.splice(i, 1);
      }
    }
    
    // Fire global tick
    this._fireGlobal("tick", dt);
  }
}

const reburMath = {
  clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  invLerp: (a: number, b: number, v: number) => a === b ? 0 : (v - a) / (b - a),
  remap: (v: number, inMin: number, inMax: number, outMin: number, outMax: number) => outMin + (outMax - outMin) * ((v - inMin) / (inMax - inMin)),
  smoothstep: (edge0: number, edge1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); },
  angleDiff: (a: number, b: number) => { let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return d; },
  lerpAngle: (a: number, b: number, t: number) => { const d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + d * t; },
  deg2rad: (d: number) => d * Math.PI / 180,
  rad2deg: (r: number) => r * 180 / Math.PI,
  dist2d: (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax-bx)**2 + (ay-by)**2),
  dist3d: (a: any, b: any) => Math.sqrt(((a.x??0)-(b.x??0))**2 + ((a.y??0)-(b.y??0))**2 + ((a.z??0)-(b.z??0))**2),
  wrap: (v: number, min: number, max: number) => { const range = max - min; return min + ((v - min) % range + range) % range; },
  sign: (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0,
  moveTowards: (current: number, target: number, delta: number) => { const diff = target - current; return Math.abs(diff) <= delta ? target : current + Math.sign(diff) * delta; },
  bearing: (a: any, b: any) => Math.atan2((b.x??0)-(a.x??0), (b.z??0)-(a.z??0)),
  spring: (current: number, target: number, vel: { v: number }, stiffness: number, damping: number, dt: number) => {
    const f = -stiffness * (current - target) - damping * vel.v;
    vel.v += f * dt;
    return current + vel.v * dt;
  },
  ease: (name: string, t: number) => (EASINGS[name] ?? EASINGS.linear)(t),
  easings: EASINGS,
  normalize: (v: any) => { const m = Math.sqrt((v.x??0)**2 + (v.y??0)**2 + (v.z??0)**2); return m > 0 ? { x:(v.x??0)/m, y:(v.y??0)/m, z:(v.z??0)/m } : {x:0,y:0,z:0}; },
  dot: (a: any, b: any) => (a.x??0)*(b.x??0) + (a.y??0)*(b.y??0) + (a.z??0)*(b.z??0),
  cross: (a: any, b: any) => ({ x: (a.y??0)*(b.z??0) - (a.z??0)*(b.y??0), y: (a.z??0)*(b.x??0) - (a.x??0)*(b.z??0), z: (a.x??0)*(b.y??0) - (a.y??0)*(b.x??0) }),
  magnitude: (v: any) => Math.sqrt((v.x??0)**2 + (v.y??0)**2 + (v.z??0)**2),
  projectOnPlane: (v: any, n: any) => { const d = reburMath.dot(v, n); return { x: (v.x??0) - (n.x??0)*d, y: (v.y??0) - (n.y??0)*d, z: (v.z??0) - (n.z??0)*d }; },
  reflect: (v: any, n: any) => { const d = reburMath.dot(v, n); return { x: (v.x??0) - 2*(n.x??0)*d, y: (v.y??0) - 2*(n.y??0)*d, z: (v.z??0) - 2*(n.z??0)*d }; },
  lookRotation: (f: any, u?: any) => ({ x: 0, y: Math.atan2(f.x??0, f.z??0), z: 0 }),
  randomInSphere: (r: number) => ({ x: (Math.random()*2-1)*r, y: (Math.random()*2-1)*r, z: (Math.random()*2-1)*r }),
  randomOnCircle: (r: number) => { const a = Math.random()*Math.PI*2; return { x: Math.cos(a)*r, y: 0, z: Math.sin(a)*r }; }
};

const reburTimer = {
  countdown: (name: string, s: number, onDone?: () => void) => {
    let rem = s;
    const id = setInterval(() => {
      rem -= 0.05;
      if (rem <= 0) { clearInterval(id); if (onDone) onDone(); }
    }, 50);
    return { get remaining() { return Math.max(0, rem); }, stop: () => clearInterval(id), pause: () => {}, resume: () => {}, reset: (ns: number) => { rem = ns; } };
  },
  get: (n: string) => 0,
  stop: (n: string) => {}
};
