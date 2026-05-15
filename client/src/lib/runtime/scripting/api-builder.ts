/**
 * API Builder - Constructs the GameAPI exposed to user scripts.
 * Mirrors the buildApi() method from core.ts.
 */

import type {
  GameAPI,
  RuntimeObject,
  RuntimePlayer,
  RuntimeCamera,
  RuntimeInput,
  RuntimePhysics,
  RuntimeState,
  RunServiceAPI,
  KeyboardAPI,
  MouseAPI,
  WorldAPI,
  GuiElement,
  Vec3,
  ContainerName,
  RaycastParams,
} from "../types";
import type { EventBus, EngineEvents } from "../events/event-bus";
import type { Easing, TweenManager } from "../tween";
import { Emitter, Callable, Class, weakRef, WeakTable, type TagManager, type TaskScheduler } from "../api";

/**
 * Context passed to buildApi - contains all runtime dependencies
 */
export interface ApiBuilderContext {
  // Containers
  objects: Record<string, RuntimeObject>;
  workspace: Record<string, RuntimeObject>;
  lighting: Record<string, RuntimeObject>;
  replicatedStorage: Record<string, RuntimeObject>;
  serverScriptService: Record<string, RuntimeObject>;
  starterPlayer: Record<string, RuntimeObject>;
  players: Record<string, RuntimeObject>;
  
  // Core
  player: RuntimePlayer;
  camera: RuntimeCamera;
  input: RuntimeInput;
  physics: RuntimePhysics;
  time: number;
  
  // State
  buildState: () => RuntimeState;
  
  // Run service
  runService: RunServiceAPI;
  
  // Events
  events: EventBus<EngineEvents>;
  keyDownHandlers: Map<string, Set<() => void>>;
  keyUpHandlers: Map<string, Set<() => void>>;
  mouseClickHandlers: Set<(obj: RuntimeObject | null) => void>;
  
  // Timers
  timers: Array<{ fn: () => void; nextAt: number; interval: number; once: boolean }>;
  
  // Tweens
  tweens: TweenManager;
  
  // Objects
  allObjects: Map<string, RuntimeObject>;
  createObject: (opts: any) => RuntimeObject;
  removeObject: (id: string) => void;
  cloneTemplate: (tpl: RuntimeObject, container: ContainerName, position?: Vec3) => RuntimeObject;
  rebuildIndexes: () => void;
  normalizeContainer: (container?: string) => ContainerName;
  
  // GUI
  gui: Map<string, GuiElement>;
  guiVersion: { value: number };
  
  // Network
  network: {
    server: { broadcast: (channel: string, payload: any) => void; on: (channel: string, fn: (payload: any) => void) => () => void };
    client: { send: (channel: string, payload: any) => void; on: (channel: string, fn: (payload: any) => void) => () => void };
  };
  
  // Tags
  tagManager: TagManager;
  
  // Tasks
  taskScheduler: TaskScheduler;
  
  // Modules
  modules: Map<string, any>;
  
  // Raycast
  raycast: (origin: Vec3, direction: Vec3, maxDistance?: number, params?: RaycastParams) => any;
  
  // Logging
  pushLog: (line: string) => void;
}

/**
 * Build the complete GameAPI for scripts.
 * Returns a cached API if already built, updating time/dt.
 */
export function buildApi(
  dt: number,
  ctx: ApiBuilderContext,
  cachedApi: { current: GameAPI | null }
): GameAPI {
  // Return cached API with updated time
  if (cachedApi.current) {
    cachedApi.current.time = ctx.time;
    cachedApi.current.dt = dt;
    return cachedApi.current;
  }

  // Logging
  const log = (...args: any[]) => {
    const text = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
    ctx.pushLog(text);
  };

  // Object lookup
  const find = (name: string): RuntimeObject | null => {
    const containers = [ctx.workspace, ctx.lighting, ctx.replicatedStorage, ctx.serverScriptService, ctx.starterPlayer, ctx.players];
    for (const c of containers) if (c[name]) return c[name];
    for (const o of ctx.allObjects.values()) if (o.name === name) return o;
    return null;
  };

  // Object creation
  const create = (opts: any): RuntimeObject => {
    const ro = ctx.createObject({
      name: opts.name,
      primitiveType: opts.primitiveType,
      container: ctx.normalizeContainer(opts.container),
      position: { x: 0, y: 0, z: 0, ...(opts.position ?? {}) } as Vec3,
      color: opts.color,
      parentId: opts.parent ? opts.parent.id : null,
      canCollide: opts.canCollide,
      anchored: opts.anchored,
      gravity: opts.gravity,
    });
    if (opts.rotation) Object.assign(ro.rotation, opts.rotation);
    if (opts.scale) Object.assign(ro.scale, opts.scale);
    if (opts.type) ro.type = opts.type;
    return ro;
  };

  // Spawn from template
  const spawn = (templateName: string, overrides?: Partial<RuntimeObject>): RuntimeObject | null => {
    const tpl = ctx.replicatedStorage[templateName];
    if (!tpl) {
      ctx.pushLog(`spawn(): no ReplicatedStorage template named "${templateName}"`);
      return null;
    }
    const ro = ctx.cloneTemplate(tpl, "Workspace", overrides?.position ? { ...tpl.position, ...overrides.position } : undefined);
    if (overrides) {
      if (overrides.name) { ro.name = overrides.name; ctx.rebuildIndexes(); }
      if (overrides.rotation) Object.assign(ro.rotation, overrides.rotation);
      if (overrides.scale) Object.assign(ro.scale, overrides.scale);
      if (overrides.color != null) ro.color = overrides.color;
      if (overrides.visible != null) ro.visible = overrides.visible;
      if (overrides.anchored != null) ro.anchored = overrides.anchored;
      if (overrides.canCollide != null) ro.canCollide = overrides.canCollide;
      if (overrides.transparency != null) ro.transparency = overrides.transparency;
      if (overrides.mass != null) ro.mass = overrides.mass;
      if (overrides.friction != null) ro.friction = overrides.friction;
      if (overrides.velocity) Object.assign(ro.velocity, overrides.velocity);
      if (overrides.gravity !== undefined) ro.gravity = overrides.gravity;
    }
    return ro;
  };

  // Object destruction
  const destroy = (target: RuntimeObject | string) => {
    if (typeof target === "string") {
      for (const ro of ctx.allObjects.values()) {
        if (ro.name === target || ro.id === target) {
          ctx.removeObject(ro.id);
          ctx.rebuildIndexes();
          return;
        }
      }
      return;
    }
    ctx.removeObject(target.id);
    ctx.rebuildIndexes();
  };

  // GUI functions
  const guiText = (id: string, text: string, opts?: any) => {
    const prev = ctx.gui.get(id);
    const el: GuiElement = {
      id,
      kind: "text",
      text,
      x: opts?.x ?? prev?.x ?? 0,
      y: opts?.y ?? prev?.y ?? 0,
      anchor: opts?.anchor ?? prev?.anchor ?? "tl",
      color: opts?.color ?? prev?.color ?? "#ffffff",
      size: opts?.size ?? prev?.size ?? 16,
      bg: opts?.bg ?? prev?.bg,
    };
    ctx.gui.set(id, el);
    ctx.guiVersion.value++;
  };

  const guiButton = (id: string, text: string, opts: any | undefined, onClick?: (game: GameAPI) => void) => {
    const prev = ctx.gui.get(id);
    const el: GuiElement = {
      id,
      kind: "button",
      text,
      x: opts?.x ?? prev?.x ?? 16,
      y: opts?.y ?? prev?.y ?? 16,
      anchor: opts?.anchor ?? prev?.anchor ?? "tl",
      color: opts?.color ?? prev?.color ?? "#ffffff",
      size: opts?.size ?? prev?.size ?? 14,
      bg: opts?.bg ?? prev?.bg ?? "rgba(30,40,60,0.85)",
      onClick: onClick ?? prev?.onClick,
    };
    ctx.gui.set(id, el);
    ctx.guiVersion.value++;
  };

  const guiClear = (id?: string) => {
    if (id == null) ctx.gui.clear();
    else ctx.gui.delete(id);
    ctx.guiVersion.value++;
  };

  // Keyboard API
  const keyboardApi: KeyboardAPI = {
    onPress: (key, fn) => {
      const k = key.toLowerCase();
      let s = ctx.keyDownHandlers.get(k);
      if (!s) { s = new Set(); ctx.keyDownHandlers.set(k, s); }
      s.add(fn);
      return () => s!.delete(fn);
    },
    onRelease: (key, fn) => {
      const k = key.toLowerCase();
      let s = ctx.keyUpHandlers.get(k);
      if (!s) { s = new Set(); ctx.keyUpHandlers.set(k, s); }
      s.add(fn);
      return () => s!.delete(fn);
    },
    isDown: (key) => !!ctx.input.keys[key.toLowerCase()],
  };

  // Mouse API
  const mouseApi: MouseAPI = {
    onClick: (fn) => {
      ctx.mouseClickHandlers.add(fn);
      return () => ctx.mouseClickHandlers.delete(fn);
    },
  };

  // World API
  const worldApi: WorldAPI = {
    onObjectAdded: (fn) => ctx.events.on("objectAdded", fn),
    onObjectRemoved: (fn) => ctx.events.on("objectRemoved", fn),
    onPlayerSpawned: (fn) => ctx.events.on("playerSpawned", fn),
    onPlayerDied: (fn) => ctx.events.on("playerDied", fn),
  };

  // Timing functions
  const onKey = (key: string, fn: () => void) => keyboardApi.onPress(key, fn);
  const onUpdateFn = (fn: (dt: number, time: number) => void) => ctx.events.on("update", fn);
  
  const every = (seconds: number, fn: () => void) => {
    const t = { fn, nextAt: ctx.time + seconds, interval: seconds, once: false };
    ctx.timers.push(t);
    return () => { const i = ctx.timers.indexOf(t); if (i >= 0) ctx.timers.splice(i, 1); };
  };
  
  const after = (seconds: number, fn: () => void) => {
    const t = { fn, nextAt: ctx.time + seconds, interval: seconds, once: true };
    ctx.timers.push(t);
    return () => { const i = ctx.timers.indexOf(t); if (i >= 0) ctx.timers.splice(i, 1); };
  };
  
  const wait = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, seconds * 1000)));
  const now = () => ctx.time;

  // Tween
  const tweenFn = (target: any, to: Record<string, any>, duration: number, easing: Easing = "linear", onDone?: () => void) => 
    ctx.tweens.start(target, to, duration, easing, onDone);

  // Math utilities
  const random = (min: number, max: number) => min + Math.random() * (max - min);
  const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const dist = (a: any, b: any) => {
    const pa = "position" in a ? a.position : a;
    const pb = "position" in b ? b.position : b;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
  };
  const lerpFn = (a: number, b: number, t: number) => a + (b - a) * t;
  const clampFn = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  // Tags API
  const tagsApi = {
    add: (obj: RuntimeObject, tag: string) => ctx.tagManager.addTag(obj, tag),
    remove: (obj: RuntimeObject, tag: string) => ctx.tagManager.removeTag(obj, tag),
    has: (obj: RuntimeObject, tag: string) => ctx.tagManager.hasTag(obj, tag),
    get: (tag: string) => ctx.tagManager.getTagged(tag),
    all: (obj: RuntimeObject) => ctx.tagManager.getTags(obj),
  };

  // Require
  const requireModule = (name: string): any => {
    const exports = ctx.modules.get(name);
    if (exports !== undefined) return exports;
    ctx.pushLog(`require: module "${name}" not found`);
    return null;
  };

  // Task API
  const taskApi = {
    wait: (seconds: number) => ctx.taskScheduler.wait(seconds),
    delay: (seconds: number, callback: () => void) => ctx.taskScheduler.delay(seconds, callback),
    spawn: (fn: (...args: any[]) => any, ...args: any[]) => ctx.taskScheduler.spawn(fn, ...args),
  };

  // Debug API
  const debugApi = {
    getChildren: (obj: RuntimeObject) => obj.children,
    getDescendants: (obj: RuntimeObject): RuntimeObject[] => {
      const result: RuntimeObject[] = [];
      const stack = [...obj.children];
      while (stack.length) {
        const child = stack.pop()!;
        result.push(child);
        stack.push(...child.children);
      }
      return result;
    },
    getFullName: (obj: RuntimeObject): string => {
      const parts: string[] = [];
      let current: RuntimeObject | null = obj;
      while (current) {
        parts.unshift(current.name);
        current = current.parentId ? ctx.allObjects.get(current.parentId) ?? null : null;
      }
      return parts.join(".");
    },
    getPropertyNames: (obj: RuntimeObject): string[] => 
      Object.keys(obj).filter(k => !k.startsWith("_") && typeof (obj as any)[k] !== "function"),
    getObjectsWithTag: (tag: string) => ctx.tagManager.getTagged(tag),
    getEventConnections: (obj: RuntimeObject): number => obj.__cleanup?.size ?? 0,
  };

  // Build final API
  const api: GameAPI = {
    objects: ctx.objects,
    workspace: ctx.workspace,
    lighting: ctx.lighting,
    replicatedStorage: ctx.replicatedStorage,
    serverScriptService: ctx.serverScriptService,
    starterPlayer: ctx.starterPlayer,
    players: ctx.players,
    player: ctx.player,
    input: ctx.input,
    physics: ctx.physics,
    state: ctx.buildState(),
    keyboard: keyboardApi,
    mouse: mouseApi,
    world: worldApi,
    runService: ctx.runService,
    camera: ctx.camera,
    time: ctx.time,
    dt,
    now,
    log,
    find,
    spawn,
    create,
    destroy,
    gui: { text: guiText, button: guiButton, clear: guiClear },
    onKey,
    onUpdate: onUpdateFn,
    every,
    after,
    wait,
    tween: tweenFn,
    random,
    randInt,
    pick,
    dist,
    lerp: lerpFn,
    clamp: clampFn,
    raycast: ctx.raycast,
    network: ctx.network,
    Emitter,
    Callable,
    tags: tagsApi,
    require: requireModule,
    task: taskApi,
    debug: debugApi,
    weakRef,
    WeakTable,
    Class,
  };

  cachedApi.current = api;
  return api;
}
