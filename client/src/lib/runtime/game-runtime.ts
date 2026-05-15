/**
 * GameRuntime - Main runtime class for the Rebur Engine.
 * 
 * This module imports from extracted submodules instead of inlining all logic,
 * making the codebase more maintainable and testable.
 */

import type { GameObject, Script } from "@shared/schema";
import { TweenManager } from "./tween";
import { HierarchyIndex } from "./hierarchy";
import { raycast as raycastWorld } from "./raycast";
import { resolveObjectCollisions } from "./collision";
import { NetworkBus } from "./network";

import {
  type ContainerName,
  type ObjectProperties,
  DEFAULT_PROPERTIES,
  type RuntimeObject,
  type InventoryItem,
  type PlayerInventory,
  type RuntimePlayer,
  type RuntimeInput,
  type RuntimePhysics,
  type RuntimeState,
  type GuiElement,
  type EngineEvents,
  EventBus,
  type KeyboardAPI,
  type MouseAPI,
  type WorldAPI,
  type RunServiceAPI,
  type GameAPI,
  type CompiledScript,
  type Vec3,
} from "./types";

import { Emitter, Callable, WeakTable, Class, TagManager, TaskScheduler, weakRef } from "./api";
import { compileScript } from "./compile";

// Modular imports
import { pointVsObjectSurface } from "./utils/helpers";
import { resolvePlayerVsObject } from "./physics/player-collision";
import { computeGravityAccel } from "./physics/gravity";
import { applyAutoProperties, updatePlayerAnimation } from "./animation/auto-properties";

// New modular imports from submodules
import { 
  createPlayerMotors, 
  applyMotorPositions, 
  getMotorPinnedIds,
  isObjectHeld as checkIsObjectHeld,
  getHeldObjectSlot as getMotorSlotForObject,
  type MotorState,
  MOTOR_SLOT_OFFSETS,
} from "./player/motors";

// ECS Pipeline imports
import {
  createPipeline,
  type PipelineHandles,
  CommandBus,
  defineCommand,
  CommandGroups,
  World,
  Transform,
  Velocity,
  Visual,
  Physics,
  AutoBehavior,
  LegacyHandle,
  InputState,
  WorldPhysics,
  Player,
  PlayerPhysics,
  getLatestSnapshot,
  type EntityId,
} from "./ecs";
import { runPickupSweep, runTouchSweep, clearContact, type TouchSystemContext } from "./objects/touch-system";
import { 
  initializeModuleScripts, 
  requireModule, 
  isRunnableScript, 
  createModuleLoaderContext,
  type ModuleLoaderContext,
  type Script as ModuleScript,
} from "./scripting/module-loader";

// Helper functions (pure)
function newId() { return `rt_${Math.random().toString(36).slice(2, 10)}`; }

function formatErr(e: any): string {
  const msg = e?.message ?? String(e);
  const stack = typeof e?.stack === "string"
    ? e.stack.split("\\n").slice(1, 4).map((l: string) => "  " + l.trim()).join("\\n")
    : "";
  return stack ? `${msg}\\n${stack}` : msg;
}

function formatScriptErr(e: any, scriptName: string): string {
  const msg = e?.message ?? String(e);
  const lineMatch = typeof e?.stack === "string" ? e.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
  const line = lineMatch ? Math.max(1, Number(lineMatch[1]) - 57) : null;
  const userHint = /is not defined|Cannot read properties|not a function|Unexpected|undefined|null/i.test(msg);
  const hint = userHint
    ? "Check for a typo, missing object, wrong container, or unsupported API use."
    : "This may be an engine error. If your script looks correct, contact support.";
  return `[${scriptName}] Runtime error${line ? ` on line ${line}` : ""}: ${msg}\\n${hint}`;
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

function readProperties(o: GameObject): ObjectProperties {
  const p = (o.properties ?? {}) as Partial<ObjectProperties>;
  const isLightOrSpawn = o.type === "light" || o.type === "spawn";
  let gravityVal: false | { strength: number; radius: number } = false;
  if (p.gravity) {
    if (typeof p.gravity === "object" && "strength" in p.gravity && "radius" in p.gravity) {
      gravityVal = { strength: p.gravity.strength, radius: p.gravity.radius };
    } else if (p.gravity === true) {
      gravityVal = { strength: 9.81, radius: 30 };
    }
  } else if ((p as any).gravityEnabled === true) {
    gravityVal = {
      strength: (p as any).gravityStrength ?? 9.81,
      radius: (p as any).gravityRadius ?? 30,
    };
  }
  return {
    anchored: p.anchored ?? true,
    canCollide: p.canCollide ?? !isLightOrSpawn,
    transparency: clamp01(p.transparency ?? 0),
    mass: p.mass ?? DEFAULT_PROPERTIES.mass,
    friction: p.friction ?? DEFAULT_PROPERTIES.friction,
    gravity: gravityVal,
    autoRotateY: p.autoRotateY,
    autoBob: p.autoBob,
    autoFollow: p.autoFollow,
    autoSpin: p.autoSpin,
    autoMove: p.autoMove,
  };
}

function createStubInventory(): PlayerInventory {
  const items: InventoryItem[] = [];
  return {
    items,
    maxSlots: 32,
    equipped: null,
    add: () => null,
    remove: () => 0,
    has: () => false,
    get: () => null,
    equip: () => false,
    drop: () => null,
    clear: () => {},
  };
}

/**
 * Main runtime class - orchestrates all game systems.
 */
export class GameRuntime {
  // Object storage
  private _all = new Map<string, RuntimeObject>();
  objectList: RuntimeObject[] = [];
  objects: Record<string, RuntimeObject> = {};
  workspace: Record<string, RuntimeObject> = {};
  lighting: Record<string, RuntimeObject> = {};
  replicatedStorage: Record<string, RuntimeObject> = {};
  serverScriptService: Record<string, RuntimeObject> = {};
  starterPlayer: Record<string, RuntimeObject> = {};
  players: Record<string, RuntimeObject> = {};
  
  // State management
  private _stateValues = new Map<string, string>();
  private _stateSubs = new Map<string, Set<(value: string, prev: string | undefined) => void>>();
  private _stateApi: RuntimeState | null = null;
  
  // Player
  player: RuntimePlayer;
  
  // Input handling
  private _prevKeys: Record<string, boolean> = {};
  private _keyDownHandlers = new Map<string, Set<() => void>>();
  private _keyUpHandlers = new Map<string, Set<() => void>>();
  private _mouseClickHandlers = new Set<(obj: RuntimeObject | null) => void>();
  
  // Timing
  private _timers: { fn: () => void; nextAt: number; interval: number; once: boolean }[] = [];
  private _tweens = new TweenManager();
  
  // Events
  private _events = new EventBus<EngineEvents>();
  private _objectEvents = new Map<string, EventBus<Record<any, any>>>();
  private _playerContacts = new Set<string>();
  
  // API cache
  private _api: GameAPI | null = null;
  
  // Systems
  hierarchy = new HierarchyIndex();
  network = new NetworkBus();
  input: RuntimeInput;
  physics: RuntimePhysics = { gravity: 9.81, airDrag: 0 };
  
  // Camera
  cameraYaw = 0;
  cameraForward: Vec3 = { x: 0, y: 0, z: -1 };
  private _moveForward: Vec3 = { x: 0, y: 0, z: -1 };
  camera: import("./types").RuntimeCamera = {
    mode: "thirdPerson",
    distance: 6,
    minDistance: 2,
    maxDistance: 20,
    offset: { x: 0, y: 1.95, z: 0 },
    sensitivity: 1,
    lockYaw: false,
    lockPitch: false,
    position: { x: 0, y: 4, z: 8 },
    lookAt: { x: 0, y: 0, z: 0 },
    fov: 60,
  };
  
  // Motors (using submodule)
  motorState = new Map<string, MotorState>();
  private _motorPinnedIds = new Set<string>();
  
  // Tags & Tasks (using existing modules)
  private tagManager = new TagManager();
  private taskScheduler = new TaskScheduler();
  
  // Module system (using submodule)
  private moduleLoaderCtx: ModuleLoaderContext;
  
  // Scripts
  time = 0;
  scripts: CompiledScript[] = [];
  logs: string[] = [];
  onLog?: (line: string) => void;
  gui = new Map<string, GuiElement>();
  guiVersion = 0;
  runService!: RunServiceAPI;
  
  // Ragdoll state
  _ragdollPos: Record<string, Vec3> | null = null;
  private _ragdollVel: Record<string, Vec3> | null = null;
  private _ragdollUntil = 0;

  // ECS Pipeline - the canonical simulation path
  private _ecsPipeline: PipelineHandles | null = null;
  private _ecsEntityMap = new Map<string, EntityId>(); // legacyId -> EntityId
  private _playerEntityId: EntityId | null = null;

  constructor(snap: GameObject[], scripts: Script[], username: string, avatarColor: string) {
    // Initialize input
    const keys: Record<string, boolean> = {};
    this.input = {
      keys,
      moveX: 0,
      moveZ: 0,
      jump: false,
      held: (k: string) => !!keys[k.toLowerCase()],
      pressed: (k: string) => !!keys[k.toLowerCase()] && !this._prevKeys[k.toLowerCase()],
      released: (k: string) => !keys[k.toLowerCase()] && !!this._prevKeys[k.toLowerCase()],
    };

    // Initialize module loader context
    this.moduleLoaderCtx = createModuleLoaderContext((line) => this.pushLog(line));

    // Load objects from snapshot
    for (const o of snap) {
      const props = readProperties(o);
      const container = this.normalizeContainer(o.container);
      const rawRo: RuntimeObject = {
        id: o.id,
        name: o.name,
        type: o.type,
        primitiveType: o.primitiveType,
        container,
        position: { x: o.positionX ?? 0, y: o.positionY ?? 0, z: o.positionZ ?? 0 },
        rotation: { x: o.rotationX ?? 0, y: o.rotationY ?? 0, z: o.rotationZ ?? 0 },
        scale: { x: o.scaleX ?? 1, y: o.scaleY ?? 1, z: o.scaleZ ?? 1 },
        color: o.color ?? "#888888",
        visible: true,
        ...props,
        velocity: { x: 0, y: 0, z: 0 },
        on: () => () => {},
        off: () => {},
        parentId: null,
        children: [],
        findFirstChild: () => null,
        setParent: () => {},
        onPropertyChanged: () => ({ on: () => () => {}, off: () => {} }),
        GetPropertyChangedSignal: () => ({ on: () => () => {}, off: () => {} }),
        _gravityExclusions: new Set<string>(),
        setAttribute: () => {},
        getAttribute: () => undefined,
        getAttributes: () => ({}),
        __cleanup: new Set(),
      };
      const ro = this.mountObjectEvents(rawRo);
      this._all.set(ro.id, ro);
    }
    this.rebuildIndexes();

    // Register ModuleScripts
    for (const o of snap) {
      if (o.type === "ModuleScript" && o.container === "ReplicatedStorage") {
        const modObj = this._all.get(o.id);
        if (modObj) {
          this.moduleLoaderCtx.moduleScripts.set(o.name, modObj);
          const script = scripts.find(s => s.name === o.name);
          if (script && script.enabled !== false) {
            try {
              const compiled = compileScript(script.code, script.name);
              if (compiled.run) {
                const modExports: any = {};
                const modApi = this.buildApi(0);
                modApi.exports = modExports;
                modApi.module = { exports: modExports };
                compiled.run(modApi);
                this.moduleLoaderCtx.modules.set(o.name, modExports);
              }
            } catch (e) { this.pushLog(`ModuleScript ${o.name} error: ${formatErr(e)}`); }
          }
        }
      }
    }

    // Find spawn point
    const spawnObj = [...this._all.values()].find(o => o.name === "SpawnLocation" || o.type === "spawn");
    const spawnPoint: Vec3 = spawnObj
      ? { x: spawnObj.position.x, y: spawnObj.position.y + (spawnObj.scale.y || 0.2) * 0.5 + 0.05, z: spawnObj.position.z }
      : { x: 0, y: 1, z: 0 };

    // Initialize player
    this.player = {
      username,
      color: avatarColor,
      position: { ...spawnPoint },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
      health: 100,
      maxHealth: 100,
      speed: 6,
      walkSpeed: 6,
      runSpeed: 12,
      jumpPower: 8,
      size: 1,
      spawnPoint,
      up: { x: 0, y: 1, z: 0 },
      collisionRadius: 0.4,
      collisionHalfHeight: 1.12,
      inventory: createStubInventory(),
      motors: {
        attach: () => {},
        detach: () => null,
        get: () => null,
        animation: "idle",
      },
      autoFaceMovement: true,
      ragdoll: false,
      killY: -50,
      takeDamage: () => {},
      heal: () => {},
      kill: () => {},
      teleport: () => {},
      respawn: () => {},
    };

    this.mountPlayerInventory();
    this.mountPlayerMethods();
    this.mountPlayerMotors();
    this.initRunService();

    // Compile regular scripts (not ModuleScripts)
    const regularScripts = scripts.filter(s => {
      if (s.enabled === false) return false;
      const t = (s as any).scriptType ?? "Script";
      if (t === "ModuleScript") return false;
      if (this.moduleLoaderCtx.moduleScripts.has(s.name)) return false;
      return true;
    });
    this.scripts = regularScripts.map(s => compileScript(s.code, s.name));
  }

  /** Check if an object is currently held in any motor slot */
  isObjectHeld(objId: string): boolean {
    return checkIsObjectHeld(this.motorState, objId);
  }

  /** Get the motor slot data for an object if it's held */
  getHeldObjectSlot(objId: string): { slot: string; offset: Vec3; rotation: Vec3 } | null {
    const slot = getMotorSlotForObject(this.motorState, objId);
    if (!slot) return null;
    const motor = this.motorState.get(slot);
    if (!motor) return null;
    return { slot, offset: motor.offset, rotation: motor.rotation };
  }

  private mountPlayerMotors() {
    const slots = this.motorState;
    const p = this.player;
    p.motors = {
      attach: (slot, obj, offset, rotation) => {
        if (!obj) { slots.delete(slot); return; }
        obj.anchored = false;
        obj.canCollide = false;
        slots.set(slot, {
          obj,
          offset: offset ? { x: offset.x ?? 0, y: offset.y ?? 0, z: offset.z ?? 0 } : { x: 0, y: 0, z: 0 },
          rotation: rotation ? { x: rotation.x ?? 0, y: rotation.y ?? 0, z: rotation.z ?? 0 } : { x: 0, y: 0, z: 0 },
        });
      },
      detach: (slot) => {
        const m = slots.get(slot);
        if (!m) return null;
        slots.delete(slot);
        m.obj.canCollide = true;
        return m.obj;
      },
      get: (slot) => slots.get(slot)?.obj ?? null,
      animation: p.motors?.animation ?? "idle",
    };
  }

  private normalizeContainer(raw: string | undefined | null): ContainerName {
    const valid: ContainerName[] = ["Workspace", "Lighting", "Players", "ServerScriptService", "StarterPlayer", "ReplicatedStorage"];
    if (raw && valid.includes(raw as ContainerName)) return raw as ContainerName;
    return "Workspace";
  }

  private initRunService() {
    this.runService = {
      input: this._events.createChannel("input"),
      animation: this._events.createChannel("animation"),
      replication: this._events.createChannel("replication"),
      physics: this._events.createChannel("physics"),
      render: this._events.createChannel("render"),
      update: this._events.createChannel("update"),
    };
  }

  private mountPlayerInventory() {
    const items: InventoryItem[] = [];
    let equippedId: string | null = null;
    const inv = this.player.inventory as any;
    Object.defineProperty(inv, "items", { value: items, writable: false, configurable: true });
    Object.defineProperty(inv, "equipped", { get: () => items.find(i => i.id === equippedId) ?? null, configurable: true });

    inv.add = (name: string, opts?: { count?: number; template?: string; data?: Record<string, any> }): InventoryItem | null => {
      const count = Math.max(1, Math.floor(opts?.count ?? 1));
      const existing = items.find(i => i.name === name);
      if (existing) {
        existing.count += count;
        if (opts?.data) Object.assign(existing.data, opts.data);
        if (opts?.template && !existing.template) existing.template = opts.template;
        return existing;
      }
      if (items.length >= inv.maxSlots) {
        this.pushLog(`inventory.add("${name}"): inventory full (${inv.maxSlots} slots)`);
        return null;
      }
      const slot: InventoryItem = { id: newId(), name, count, template: opts?.template, data: { ...(opts?.data ?? {}) } };
      items.push(slot);
      return slot;
    };

    inv.remove = (name: string, count: number = 1): number => {
      const idx = items.findIndex(i => i.name === name);
      if (idx < 0) return 0;
      const slot = items[idx];
      const removed = Math.min(slot.count, Math.max(1, Math.floor(count)));
      slot.count -= removed;
      if (slot.count <= 0) {
        if (slot.id === equippedId) equippedId = null;
        items.splice(idx, 1);
      }
      return removed;
    };

    inv.has = (name: string, count: number = 1): boolean => (items.find(i => i.name === name)?.count ?? 0) >= count;
    inv.get = (name: string): InventoryItem | null => items.find(i => i.name === name) ?? null;
    inv.equip = (name: string | null): boolean => {
      if (name == null) { equippedId = null; return true; }
      const slot = items.find(i => i.name === name);
      if (!slot) return false;
      equippedId = slot.id;
      return true;
    };
    inv.drop = (name: string, count: number = 1): RuntimeObject | null => {
      const slot = items.find(i => i.name === name);
      if (!slot) return null;
      const dropped = inv.remove(name, count);
      if (dropped <= 0) return null;
      const fwd = this.cameraForward;
      const fLen = Math.hypot(fwd.x, 0, fwd.z) || 1;
      const fx = fwd.x / fLen;
      const fz = fwd.z / fLen;
      const dropPos: Vec3 = { x: this.player.position.x + fx * 1.5, y: this.player.position.y + 0.5, z: this.player.position.z + fz * 1.5 };
      const tpl = this.replicatedStorage[slot.template ?? name];
      let ro: RuntimeObject;
      if (tpl) ro = this.cloneTemplateInto(tpl, "Workspace", dropPos);
      else ro = this.createInternal({ name, primitiveType: "cube", container: "Workspace", position: dropPos, color: "#c084fc" });
      ro.isPickup = true;
      ro.pickupName = name;
      ro.pickupData = { ...slot.data };
      return ro;
    };
    inv.clear = () => { items.length = 0; equippedId = null; };
  }

  private mountPlayerMethods() {
    const p = this.player;
    p.takeDamage = (n: number) => {
      if (p.ragdoll) return;
      p.health = Math.max(0, p.health - n);
      if (p.health <= 0) p.kill();
    };
    p.heal = (n: number) => { p.health = Math.min(p.maxHealth, p.health + n); };
    p.teleport = (x: number, y: number, z: number) => {
      p.position.x = x; p.position.y = y; p.position.z = z;
      p.velocity.x = 0; p.velocity.y = 0; p.velocity.z = 0;
    };
    p.kill = () => {
      if (p.ragdoll) return;
      p.health = 0;
      p.ragdoll = true;
      const r = () => (Math.random() - 0.5) * 4;
      const ru = () => 4 + Math.random() * 3;
      this._ragdollVel = {
        torso:        { x: r(), y: 5, z: r() },
        head:         { x: r(), y: 7, z: r() },
        neck:         { x: r(), y: 6, z: r() },
        leftUpperArm: { x: -3, y: ru(), z: r() },
        leftLowerArm: { x: -4, y: ru(), z: r() },
        leftHand:     { x: -5, y: ru(), z: r() },
        rightUpperArm:{ x:  3, y: ru(), z: r() },
        rightLowerArm:{ x:  4, y: ru(), z: r() },
        rightHand:    { x:  5, y: ru(), z: r() },
        leftUpperLeg: { x: r(), y: ru(), z: -3 },
        leftLowerLeg: { x: r(), y: ru(), z: -4 },
        leftFoot:     { x: r(), y: ru(), z: -5 },
        rightUpperLeg:{ x: r(), y: ru(), z:  3 },
        rightLowerLeg:{ x: r(), y: ru(), z:  4 },
        rightFoot:    { x: r(), y: ru(), z:  5 },
      };
      this._ragdollPos = {
        torso:        { x: 0, y: 0.05, z: 0 },
        head:         { x: 0, y: 0.85, z: 0 },
        neck:         { x: 0, y: 0.65, z: 0 },
        leftUpperArm: { x: -0.42, y: 0.30, z: 0 },
        leftLowerArm: { x: -0.42, y: 0.00, z: 0 },
        leftHand:     { x: -0.42, y: -0.25, z: 0 },
        rightUpperArm:{ x:  0.42, y: 0.30, z: 0 },
        rightLowerArm:{ x:  0.42, y: 0.00, z: 0 },
        rightHand:    { x:  0.42, y: -0.25, z: 0 },
        leftUpperLeg: { x: -0.18, y: -0.30, z: 0 },
        leftLowerLeg: { x: -0.18, y: -0.65, z: 0 },
        leftFoot:     { x: -0.18, y: -0.95, z: 0.05 },
        rightUpperLeg:{ x:  0.18, y: -0.30, z: 0 },
        rightLowerLeg:{ x:  0.18, y: -0.65, z: 0 },
        rightFoot:    { x:  0.18, y: -0.95, z: 0.05 },
      };
      this._ragdollUntil = this.time + 1.6;
      this._events.emit("playerDied", [p], () => {});
      this.pushLog(`${p.username} died.`);
    };
    p.respawn = () => {
      const sp = p.spawnPoint;
      p.position.x = sp.x; p.position.y = sp.y; p.position.z = sp.z;
      p.velocity.x = 0; p.velocity.y = 0; p.velocity.z = 0;
      p.health = p.maxHealth;
      p.ragdoll = false;
      this._ragdollVel = null;
      this._ragdollPos = null;
      this._events.emit("playerSpawned", [p], () => {});
      this.pushLog(`${p.username} respawned.`);
    };
  }

  private mountObjectEvents(raw: RuntimeObject): RuntimeObject {
    const id = raw.id;
    const propertyEvents = new Map<string, EventBus<Record<"changed", [property: string, newValue: any, oldValue: any]>>>();
    const attributes = new Map<string, any>();
    const cleanupSet = new Set<() => void>();

    const proxy = new Proxy(raw, {
      set: (target, prop, value) => {
        const propName = prop as string;
        const oldValue = (target as any)[propName];
        if (oldValue !== value) {
          (target as any)[propName] = value;
          const propBus = propertyEvents.get(propName);
          if (propBus) propBus.emit("changed", [propName, value, oldValue]);
          const generalBus = this._objectEvents.get(id);
          if (generalBus) generalBus.emit("changed", [propName, value, oldValue]);
        }
        return true;
      }
    });

    proxy.on = (event, fn) => {
      let bus = this._objectEvents.get(id);
      if (!bus) { bus = new EventBus(); this._objectEvents.set(id, bus); }
      const disconnect = bus.on(event as any, fn as any);
      cleanupSet.add(disconnect);
      return () => {
        disconnect();
        cleanupSet.delete(disconnect);
      };
    };
    proxy.off = (event, fn) => {
      this._objectEvents.get(id)?.off(event as any, fn as any);
    };
    
    // Property changed signal - camelCase API (preferred)
    const propertyChangedImpl = (property: string) => {
      let bus = propertyEvents.get(property);
      if (!bus) { bus = new EventBus(); propertyEvents.set(property, bus); }
      const api = {
        on: (event: any, fn: any) => {
          const disconnect = bus!.on(event, fn);
          cleanupSet.add(disconnect);
          return () => {
            disconnect();
            cleanupSet.delete(disconnect);
          };
        },
        off: (event: any, fn: any) => bus!.off(event, fn)
      };
      return api;
    };
    proxy.onPropertyChanged = propertyChangedImpl;
    // Deprecated alias for backward compatibility
    proxy.GetPropertyChangedSignal = propertyChangedImpl;

    proxy.setAttribute = (key: string, value: any) => {
      const old = attributes.get(key);
      if (old !== value) {
        attributes.set(key, value);
        const generalBus = this._objectEvents.get(id);
        if (generalBus) generalBus.emit("changed", [`Attribute.${key}`, value, old]);
      }
    };
    proxy.getAttribute = (key: string) => attributes.get(key);
    proxy.getAttributes = () => Object.fromEntries(attributes);

    const hi = this.hierarchy;
    const all = this._all;
    Object.defineProperty(proxy, "children", {
      get: () => hi.childIds(id).map(cid => all.get(cid)).filter(Boolean) as RuntimeObject[]
    });
    proxy.findFirstChild = (name: string) => {
      for (const cid of hi.childIds(id)) {
        const child = all.get(cid);
        if (child && child.name === name) return child;
      }
      return null;
    };
    proxy.setParent = (parent: RuntimeObject | null) => {
      hi.reparent(proxy, parent ? parent.id : null);
      proxy.parentId = parent ? parent.id : null;
    };
    hi.add(proxy);

    let gravityValue: false | { strength: number; radius: number } = raw.gravity === false ? false : (raw.gravity ? { strength: raw.gravity.strength, radius: raw.gravity.radius } : false);
    const exclusions = new Set<string>();

    const gravityProxy = new Proxy({} as any, {
      get: (_, p) => {
        if (p === "strength") return gravityValue && typeof gravityValue === "object" ? gravityValue.strength : undefined;
        if (p === "radius") return gravityValue && typeof gravityValue === "object" ? gravityValue.radius : undefined;
        if (p === "player") return !exclusions.has("player");
        if (typeof p === "string") return !exclusions.has(p);
        return undefined;
      },
      set: (_, p, newValue) => {
        if (p === "strength" || p === "radius") {
          if (!gravityValue || typeof gravityValue !== "object") gravityValue = { strength: 9.81, radius: 30 };
          if (p === "strength") gravityValue.strength = newValue;
          if (p === "radius") gravityValue.radius = newValue;
          return true;
        }
        const key = String(p);
        if (newValue === false) {
          exclusions.add(key);
        } else if (newValue === true) {
          exclusions.delete(key);
        }
        return true;
      },
      deleteProperty: (_, p) => {
        exclusions.delete(String(p));
        return true;
      }
    });

    Object.defineProperty(proxy, "gravity", {
      get: () => gravityProxy,
      set: (val: any) => {
        if (!val || val === false) {
          gravityValue = false;
          exclusions.clear();
        } else if (typeof val === "object" && "strength" in val && "radius" in val) {
          gravityValue = { strength: val.strength, radius: val.radius };
        } else {
          const cfg = { strength: 9.81, radius: 30 };
          if (val && typeof val === "object") {
            if ("strength" in val) cfg.strength = val.strength;
            if ("radius" in val) cfg.radius = val.radius;
          }
          gravityValue = cfg;
        }
      }
    });

    Object.defineProperty(proxy, "_gravityExclusions", {
      get: () => exclusions,
      configurable: true,
    });

    Object.defineProperty(proxy, "__cleanup", {
      value: cleanupSet,
      writable: false,
      configurable: true,
    });

    return proxy;
  }

  private emitObjectEvent(id: string, event: any, args: any[]) {
    const bus = this._objectEvents.get(id);
    if (!bus) return;
    bus.emit(event, args, (e, fn) => this.pushLog(`obj.on("${event}") error: ${formatErr(e)}`));
  }

  private createInternal(opts: any): RuntimeObject {
    const raw: RuntimeObject = {
      id: newId(),
      name: opts.name ?? `Part_${this._all.size + 1}`,
      type: "primitive",
      primitiveType: opts.primitiveType ?? "cube",
      container: opts.container ?? "Workspace",
      position: { x: 0, y: 0, z: 0, ...(opts.position ?? {}) },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: opts.color ?? "#88aaff",
      visible: true,
      ...DEFAULT_PROPERTIES,
      anchored: opts.anchored ?? false,
      canCollide: opts.canCollide ?? DEFAULT_PROPERTIES.canCollide,
      gravity: opts.gravity ?? false,
      velocity: { x: 0, y: 0, z: 0 },
      on: () => () => {},
      off: () => {},
      parentId: opts.parentId ?? null,
      children: [],
      findFirstChild: () => null,
      setParent: () => {},
      onPropertyChanged: () => ({ on: () => () => {}, off: () => {} }),
      GetPropertyChangedSignal: () => ({ on: () => () => {}, off: () => {} }),
      _gravityExclusions: new Set<string>(),
      setAttribute: () => {},
      getAttribute: () => undefined,
      getAttributes: () => ({}),
      __cleanup: new Set(),
    };
    const ro = this.mountObjectEvents(raw);
    this._all.set(ro.id, ro);
    if (opts.parentId) {
      const parent = this._all.get(opts.parentId);
      if (parent) ro.setParent(parent);
    }
    this.rebuildIndexes();
    this._events.emit("objectAdded", [ro]);
    return ro;
  }

  private cloneTemplateInto(tpl: RuntimeObject, container: ContainerName, position?: Vec3): RuntimeObject {
    const raw: RuntimeObject = {
      id: newId(),
      name: `${tpl.name}_${this._all.size + 1}`,
      type: tpl.type,
      primitiveType: tpl.primitiveType,
      container,
      position: position ? { ...position } : { ...tpl.position },
      rotation: { ...tpl.rotation },
      scale: { ...tpl.scale },
      color: tpl.color,
      visible: true,
      anchored: tpl.anchored,
      canCollide: tpl.canCollide,
      transparency: tpl.transparency,
      mass: tpl.mass,
      friction: tpl.friction,
      gravity: tpl.gravity === false ? false : (tpl.gravity ? { strength: tpl.gravity.strength, radius: tpl.gravity.radius } : false),
      velocity: { x: 0, y: 0, z: 0 },
      on: () => () => {},
      off: () => {},
      parentId: null,
      children: [],
      findFirstChild: () => null,
      setParent: () => {},
      onPropertyChanged: () => ({ on: () => () => {}, off: () => {} }),
      GetPropertyChangedSignal: () => ({ on: () => () => {}, off: () => {} }),
      _gravityExclusions: new Set(),
      setAttribute: () => {},
      getAttribute: () => undefined,
      getAttributes: () => ({}),
      __cleanup: new Set(),
    };
    const ro = this.mountObjectEvents(raw);
    this._all.set(ro.id, ro);
    this.rebuildIndexes();
    this._events.emit("objectAdded", [ro]);
    return ro;
  }

  private removeObject(id: string) {
    const ro = this._all.get(id);
    if (!ro) return;
    if (ro.__cleanup) {
      for (const disconnect of ro.__cleanup) disconnect();
      ro.__cleanup.clear();
    }
    for (const cid of this.hierarchy.descendantIds(id)) {
      const child = this._all.get(cid);
      if (!child) continue;
      if (child.__cleanup) {
        for (const disconnect of child.__cleanup) disconnect();
        child.__cleanup.clear();
      }
      this._all.delete(cid);
      clearContact(this._playerContacts, cid);
      this.emitObjectEvent(cid, "destroyed", []);
      this._objectEvents.delete(cid);
      this.hierarchy.remove(child);
      this._events.emit("objectRemoved", [child]);
    }
    this._all.delete(id);
    clearContact(this._playerContacts, id);
    this.emitObjectEvent(id, "destroyed", []);
    this._objectEvents.delete(id);
    this.hierarchy.remove(ro);
    this._events.emit("objectRemoved", [ro]);
  }

  private rebuildIndexes() {
    const ws = this.workspace, lt = this.lighting, rs = this.replicatedStorage, sss = this.serverScriptService, sp = this.starterPlayer, pl = this.players;
    for (const k of Object.keys(ws)) delete ws[k];
    for (const k of Object.keys(lt)) delete lt[k];
    for (const k of Object.keys(rs)) delete rs[k];
    for (const k of Object.keys(sss)) delete sss[k];
    for (const k of Object.keys(sp)) delete sp[k];
    for (const k of Object.keys(pl)) delete pl[k];
    const list: RuntimeObject[] = [];
    for (const ro of this._all.values()) {
      switch (ro.container) {
        case "Workspace": ws[ro.name] = ro; list.push(ro); break;
        case "Lighting": lt[ro.name] = ro; list.push(ro); break;
        case "ReplicatedStorage": rs[ro.name] = ro; break;
        case "ServerScriptService": sss[ro.name] = ro; break;
        case "StarterPlayer": sp[ro.name] = ro; break;
        case "Players": pl[ro.name] = ro; break;
      }
    }
    this.objects = ws;
    this.objectList = list;
  }

  private pushLog(line: string) { 
    this.logs.push(line); 
    if (this.logs.length > 200) this.logs.shift(); 
    this.onLog?.(line); 
  }

  /**
   * Initialize the ECS pipeline and sync all existing objects into the ECS world.
   * This is the canonical simulation path - all game state flows through ECS.
   */
  initEcsPipeline(): void {
    if (this._ecsPipeline) return; // Already initialized
    
    this._ecsPipeline = createPipeline();
    const { server } = this._ecsPipeline;
    const world = server.world;
    
    // Initialize world physics singleton (entity 0)
    const worldEntity = 0 as unknown as EntityId;
    world.set(worldEntity, WorldPhysics, {
      gravity: this.physics.gravity,
      airDrag: this.physics.airDrag,
    });
    world.set(worldEntity, InputState, {
      moveX: 0,
      moveZ: 0,
      jump: false,
      keys: {},
      prevKeys: {},
      cameraForward: { x: 0, y: 0, z: -1 },
    });
    
    // Create player entity
    this._playerEntityId = world.create();
    const p = this.player;
    
    // Player component
    world.set(this._playerEntityId, Player, {
      username: p.username,
      color: p.color,
      health: p.health,
      maxHealth: p.maxHealth,
      speed: p.speed,
      walkSpeed: p.walkSpeed,
      runSpeed: p.runSpeed,
      jumpPower: p.jumpPower,
      size: p.size,
      onGround: p.onGround,
      ragdoll: p.ragdoll,
      killY: p.killY,
      up: { ...p.up },
      spawnPoint: { ...p.spawnPoint },
    });
    
    // Player transform
    world.set(this._playerEntityId, Transform, {
      position: { ...p.position },
      rotation: { ...p.rotation },
      scale: { x: p.size, y: p.size, z: p.size },
    });
    
    // Player velocity
    world.set(this._playerEntityId, Velocity, { ...p.velocity });
    
    // Player physics
    world.set(this._playerEntityId, PlayerPhysics, {
      onGround: p.onGround,
      up: { ...p.up },
      collisionRadius: p.collisionRadius ?? 0.4,
      collisionHalfHeight: p.collisionHalfHeight ?? 1.12,
      walkSpeed: p.walkSpeed,
      runSpeed: p.runSpeed,
      jumpPower: p.jumpPower,
      moveForward: { x: 0, y: 0, z: -1 },
      sprinting: false,
    });
    
    // Sync all existing RuntimeObjects into the ECS world
    for (const ro of this._all.values()) {
      this.syncObjectToEcs(ro);
    }
    
    this.pushLog("[ECS] Pipeline initialized with " + this._ecsEntityMap.size + " objects + 1 player");
  }

  /**
   * Sync a RuntimeObject to the ECS world.
   * Creates an entity if it doesn't exist, otherwise updates components.
   */
  private syncObjectToEcs(ro: RuntimeObject): EntityId {
    if (!this._ecsPipeline) throw new Error("ECS pipeline not initialized");
    
    const world = this._ecsPipeline.server.world;
    let eid = this._ecsEntityMap.get(ro.id);
    
    if (!eid) {
      eid = world.create();
      this._ecsEntityMap.set(ro.id, eid);
    }
    
    // Sync Transform
    world.set(eid, Transform, {
      position: { ...ro.position },
      rotation: { ...ro.rotation },
      scale: { ...ro.scale },
    });
    
    // Sync Velocity
    world.set(eid, Velocity, { ...ro.velocity });
    
    // Sync Visual
    world.set(eid, Visual, {
      color: ro.color,
      visible: ro.visible,
      transparency: ro.transparency,
      primitiveType: ro.primitiveType,
    });
    
    // Sync Physics
    world.set(eid, Physics, {
      anchored: ro.anchored,
      canCollide: ro.canCollide,
      mass: ro.mass,
      friction: ro.friction,
      gravity: ro.gravity,
    });
    
    // Sync AutoBehavior if any auto-properties exist
    if (ro.autoRotateY !== undefined || ro.autoBob || ro.autoSpin || ro.autoMove || ro.autoFollow) {
      world.set(eid, AutoBehavior, {
        autoRotateY: ro.autoRotateY,
        autoBob: ro.autoBob,
        autoSpin: ro.autoSpin,
        autoMove: ro.autoMove,
        autoFollow: ro.autoFollow,
      });
    }
    
    // Sync LegacyHandle
    world.set(eid, LegacyHandle, {
      legacyId: ro.id,
      name: ro.name,
    });
    
    return eid;
  }

  /**
   * Sync ECS state back to RuntimeObjects and Player after a tick.
   * Reads directly from the ECS world components.
   */
  private syncEcsToObjects(): void {
    if (!this._ecsPipeline) return;
    
    const world = this._ecsPipeline.server.world;
    
    // Sync player state from ECS
    if (this._playerEntityId !== null) {
      const playerTransform = world.get(this._playerEntityId, Transform);
      const playerVelocity = world.get(this._playerEntityId, Velocity);
      const playerPhys = world.get(this._playerEntityId, PlayerPhysics);
      const playerComp = world.get(this._playerEntityId, Player);
      
      if (playerTransform) {
        this.player.position.x = playerTransform.position.x;
        this.player.position.y = playerTransform.position.y;
        this.player.position.z = playerTransform.position.z;
        this.player.rotation.x = playerTransform.rotation.x;
        this.player.rotation.y = playerTransform.rotation.y;
        this.player.rotation.z = playerTransform.rotation.z;
      }
      if (playerVelocity) {
        this.player.velocity.x = playerVelocity.x;
        this.player.velocity.y = playerVelocity.y;
        this.player.velocity.z = playerVelocity.z;
      }
      if (playerPhys) {
        this.player.onGround = playerPhys.onGround;
        this.player.up.x = playerPhys.up.x;
        this.player.up.y = playerPhys.up.y;
        this.player.up.z = playerPhys.up.z;
      }
      if (playerComp) {
        this.player.health = playerComp.health;
        this.player.ragdoll = playerComp.ragdoll;
      }
    }
    
    // Sync all RuntimeObjects from ECS
    for (const [legacyId, eid] of this._ecsEntityMap) {
      const ro = this._all.get(legacyId);
      if (!ro) continue;
      
      const transform = world.get(eid, Transform);
      const velocity = world.get(eid, Velocity);
      const visual = world.get(eid, Visual);
      
      if (transform) {
        ro.position.x = transform.position.x;
        ro.position.y = transform.position.y;
        ro.position.z = transform.position.z;
        ro.rotation.x = transform.rotation.x;
        ro.rotation.y = transform.rotation.y;
        ro.rotation.z = transform.rotation.z;
      }
      if (velocity) {
        ro.velocity.x = velocity.x;
        ro.velocity.y = velocity.y;
        ro.velocity.z = velocity.z;
      }
      if (visual) {
        ro.visible = visual.visible;
        ro.transparency = visual.transparency;
        ro.color = visual.color;
      }
    }
  }

  /**
   * Step the ECS pipeline.
   * Called from the main step() method when useEcsPipeline is true.
   */
  private stepEcsPipeline(dt: number): void {
    if (!this._ecsPipeline) return;
    
    const { server } = this._ecsPipeline;
    
    // Push current input state as a command
    const inputCmd = defineCommand<"input.update", {
      moveX: number;
      moveZ: number;
      jump: boolean;
      keys: Record<string, boolean>;
      cameraForward: Vec3;
    }>("input.update", CommandGroups.Input);
    
    server.commands.enqueue(
      inputCmd.create({
        moveX: this.input.moveX,
        moveZ: this.input.moveZ,
        jump: this.input.jump,
        keys: { ...this.input.keys },
        cameraForward: { ...this.cameraForward },
      }, { origin: { script: "runtime", apiPath: "input.update" } })
    );
    
    // Step the server simulation
    server.step(dt);
    
    // Sync ECS state back to RuntimeObjects
    this.syncEcsToObjects();
  }

  private buildState(): RuntimeState {
    if (this._stateApi) return this._stateApi;
    this._stateApi = {
      get: (key) => this._stateValues.get(key),
      set: (key, value) => { 
        const v = String(value), prev = this._stateValues.get(key); 
        if (prev === v) return; 
        this._stateValues.set(key, v); 
        const subs = this._stateSubs.get(key); 
        if (!subs) return; 
        for (const fn of subs) { 
          try { fn(v, prev); } catch (e: any) { this.pushLog(`state.on("${key}") error: ${formatErr(e)}`); } 
        } 
      },
      on: (key, fn) => { 
        let subs = this._stateSubs.get(key); 
        if (!subs) { subs = new Set(); this._stateSubs.set(key, subs); } 
        subs.add(fn); 
        return () => { subs?.delete(fn); }; 
      },
      keys: () => Array.from(this._stateValues.keys()),
    };
    return this._stateApi;
  }

  invokeGuiClick(id: string) { 
    const el = this.gui.get(id); 
    if (!el?.onClick) return; 
    try { el.onClick(this.buildApi(0)); } catch (e: any) { this.pushLog(`gui[${id}] onClick error: ${formatErr(e)}`); } 
  }

  private buildApi(dt: number): GameAPI {
    if (this._api) { this._api.time = this.time; this._api.dt = dt; return this._api; }

    const log = (...args: any[]) => { const text = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "); this.pushLog(text); };
    const find = (name: string): RuntimeObject | null => { const containers = [this.workspace, this.lighting, this.replicatedStorage, this.serverScriptService, this.starterPlayer, this.players]; for (const c of containers) if (c[name]) return c[name]; for (const o of this._all.values()) if (o.name === name) return o; return null; };
    const create = (opts: any): RuntimeObject => {
      const ro = this.createInternal({
        name: opts.name,
        primitiveType: opts.primitiveType,
        container: this.normalizeContainer(opts.container),
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
    const raycastFn = (origin: Vec3, direction: Vec3, maxDistance = 100, params?: any) => raycastWorld(this._all.values(), origin, direction, maxDistance, params);
    const networkApi = { server: this.network.server, client: this.network.client };
    const spawn = (templateName: string, overrides?: Partial<RuntimeObject>): RuntimeObject | null => { const tpl = this.replicatedStorage[templateName]; if (!tpl) { this.pushLog(`spawn(): no ReplicatedStorage template named "${templateName}"`); return null; } const ro = this.cloneTemplateInto(tpl, "Workspace", overrides?.position ? { ...tpl.position, ...overrides.position } : undefined); if (overrides) { if (overrides.name) { ro.name = overrides.name; this.rebuildIndexes(); } if (overrides.rotation) Object.assign(ro.rotation, overrides.rotation); if (overrides.scale) Object.assign(ro.scale, overrides.scale); if (overrides.color != null) ro.color = overrides.color; if (overrides.visible != null) ro.visible = overrides.visible; if (overrides.anchored != null) ro.anchored = overrides.anchored; if (overrides.canCollide != null) ro.canCollide = overrides.canCollide; if (overrides.transparency != null) ro.transparency = overrides.transparency; if (overrides.mass != null) ro.mass = overrides.mass; if (overrides.friction != null) ro.friction = overrides.friction; if (overrides.velocity) Object.assign(ro.velocity, overrides.velocity); if (overrides.gravity !== undefined) ro.gravity = overrides.gravity; } return ro; };
    const destroy = (target: RuntimeObject | string) => { if (typeof target === "string") { for (const ro of this._all.values()) if (ro.name === target || ro.id === target) { this.removeObject(ro.id); this.rebuildIndexes(); return; } return; } this.removeObject(target.id); this.rebuildIndexes(); };
    const guiText = (id: string, text: string, opts?: any) => { const prev = this.gui.get(id); const el: GuiElement = { id, kind: "text", text, x: opts?.x ?? prev?.x ?? 0, y: opts?.y ?? prev?.y ?? 0, anchor: opts?.anchor ?? prev?.anchor ?? "tl", color: opts?.color ?? prev?.color ?? "#ffffff", size: opts?.size ?? prev?.size ?? 16, bg: opts?.bg ?? prev?.bg }; this.gui.set(id, el); this.guiVersion++; };
    const guiButton = (id: string, text: string, opts: any | undefined, onClick?: (game: GameAPI) => void) => { const prev = this.gui.get(id); const el: GuiElement = { id, kind: "button", text, x: opts?.x ?? prev?.x ?? 16, y: opts?.y ?? prev?.y ?? 16, anchor: opts?.anchor ?? prev?.anchor ?? "tl", color: opts?.color ?? prev?.color ?? "#ffffff", size: opts?.size ?? prev?.size ?? 14, bg: opts?.bg ?? prev?.bg ?? "rgba(30,40,60,0.85)", onClick: onClick ?? prev?.onClick }; this.gui.set(id, el); this.guiVersion++; };
    const guiClear = (id?: string) => { if (id == null) this.gui.clear(); else this.gui.delete(id); this.guiVersion++; };
    const keyboardApi: KeyboardAPI = { onPress: (key, fn) => { const k = key.toLowerCase(); let s = this._keyDownHandlers.get(k); if (!s) { s = new Set(); this._keyDownHandlers.set(k, s); } s.add(fn); return () => s!.delete(fn); }, onRelease: (key, fn) => { const k = key.toLowerCase(); let s = this._keyUpHandlers.get(k); if (!s) { s = new Set(); this._keyUpHandlers.set(k, s); } s.add(fn); return () => s!.delete(fn); }, isDown: (key) => !!this.input.keys[key.toLowerCase()] };
    const mouseApi: MouseAPI = { onClick: (fn) => { this._mouseClickHandlers.add(fn); return () => this._mouseClickHandlers.delete(fn); } };
    const worldApi: WorldAPI = { onObjectAdded: (fn) => this._events.on("objectAdded", fn), onObjectRemoved: (fn) => this._events.on("objectRemoved", fn), onPlayerSpawned: (fn) => this._events.on("playerSpawned", fn), onPlayerDied: (fn) => this._events.on("playerDied", fn) };
    const onKey = (key: string, fn: () => void) => keyboardApi.onPress(key, fn);
    const onUpdateFn = (fn: (dt: number, time: number) => void) => this._events.on("update", fn);
    const every = (seconds: number, fn: () => void) => { const t = { fn, nextAt: this.time + seconds, interval: seconds, once: false }; this._timers.push(t); return () => { const i = this._timers.indexOf(t); if (i >= 0) this._timers.splice(i, 1); }; };
    const after = (seconds: number, fn: () => void) => { const t = { fn, nextAt: this.time + seconds, interval: seconds, once: true }; this._timers.push(t); return () => { const i = this._timers.indexOf(t); if (i >= 0) this._timers.splice(i, 1); }; };
    const wait = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, seconds * 1000)));
    const now = () => this.time;
    const tweenFn = (target: any, to: Record<string, any>, duration: number, easing: any = "linear", onDone?: () => void) => this._tweens.start(target, to, duration, easing, onDone);
    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const dist = (a: any, b: any) => { const pa = "position" in a ? a.position : a; const pb = "position" in b ? b.position : b; return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z); };
    const lerpFn = (a: number, b: number, t: number) => a + (b - a) * t;
    const clampFn = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

    const tagsApi = {
      add: (obj: RuntimeObject, tag: string) => this.tagManager.addTag(obj, tag),
      remove: (obj: RuntimeObject, tag: string) => this.tagManager.removeTag(obj, tag),
      has: (obj: RuntimeObject, tag: string) => this.tagManager.hasTag(obj, tag),
      get: (tag: string) => this.tagManager.getTagged(tag),
      all: (obj: RuntimeObject) => this.tagManager.getTags(obj),
    };
    const requireModuleFn = (name: string): any => {
      return requireModule(name, this.moduleLoaderCtx);
    };
    const taskApi = {
      wait: (seconds: number) => this.taskScheduler.wait(seconds),
      delay: (seconds: number, callback: () => void) => this.taskScheduler.delay(seconds, callback),
      spawn: (fn: (...args: any[]) => any, ...args: any[]) => this.taskScheduler.spawn(fn, ...args),
    };
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
          current = current.parentId ? this._all.get(current.parentId) ?? null : null;
        }
        return parts.join(".");
      },
      getPropertyNames: (obj: RuntimeObject): string[] => Object.keys(obj).filter(k => !k.startsWith("_") && typeof (obj as any)[k] !== "function"),
      getObjectsWithTag: (tag: string) => this.tagManager.getTagged(tag),
      getEventConnections: (obj: RuntimeObject): number => obj.__cleanup?.size ?? 0,
    };

    this._api = { 
      objects: this.objects, 
      workspace: this.workspace, 
      lighting: this.lighting, 
      replicatedStorage: this.replicatedStorage, 
      serverScriptService: this.serverScriptService, 
      starterPlayer: this.starterPlayer, 
      players: this.players, 
      player: this.player, 
      input: this.input, 
      physics: this.physics, 
      state: this.buildState(), 
      keyboard: keyboardApi, 
      mouse: mouseApi, 
      world: worldApi, 
      runService: this.runService,
      camera: this.camera,
      time: this.time, 
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
      raycast: raycastFn,
      network: networkApi,
      Emitter,
      Callable,
      tags: tagsApi,
      require: requireModuleFn,
      task: taskApi,
      debug: debugApi,
      weakRef,
      WeakTable,
      Class,
    };
    return this._api!;
  }

  emitClick(objId: string | null) { 
    const obj = objId ? (this._all.get(objId) ?? null) : null; 
    if (obj) this.emitObjectEvent(obj.id, "clicked", [obj]); 
    for (const fn of this._mouseClickHandlers) { 
      try { fn(obj); } catch (e: any) { this.pushLog(`mouse.onClick error: ${formatErr(e)}`); } 
    } 
  }
  
  emitTap(objId: string) { this.emitObjectEvent(objId, "clicked", [this._all.get(objId)]); }

  private async runScripts() { 
    const api = this.buildApi(0); 
    for (const s of this.scripts) { 
      if (s.error) { this.pushLog(`[${s.name}] ${s.error}`); continue; } 
      if (!s.run) continue; 
      try { 
        const maybe = (s.run as any)(api); 
        if (maybe && typeof maybe.then === "function") maybe.catch((e: any) => this.pushLog(formatScriptErr(e, s.name))); 
      } catch (e: any) { this.pushLog(formatScriptErr(e, s.name)); } 
    } 
  }

  start() { 
    // Initialize ECS pipeline - this is now the canonical simulation path
    this.initEcsPipeline();
    
    void this.runScripts(); 
    this._events.emit("start", [], (e, fn) => this.pushLog(`internal start error: ${formatErr(e)}`)); 
    this._events.emit("playerSpawned", [this.player], (e, fn) => this.pushLog(`internal playerSpawned error: ${formatErr(e)}`)); 
  }

  stop() { 
    this._events.emit("stop", [], () => {}); 
    this._events.clear(); 
    this._objectEvents.clear(); 
    this._keyDownHandlers.clear(); 
    this._keyUpHandlers.clear(); 
    this._mouseClickHandlers.clear(); 
    this._timers.length = 0; 
    this._tweens.clear(); 
    this.network.clear(); 
    this.hierarchy.clear(); 
    this.tagManager.clear(); 
  }

  /** Delegates to the extracted animation/auto-properties module */
  private updateAutoProperties(dt: number) {
    applyAutoProperties(this.objectList, dt);
  }

  /** Delegates to the extracted physics/gravity module */
  private computeGravityForTarget(point: Vec3, targetId: string | null, targetName: string | null, isPlayer: boolean): Vec3 {
    return computeGravityAccel(point, targetId, targetName, isPlayer, this.objectList, this.physics.gravity);
  }

  /** Apply motor positions using the extracted module */
  private applyMotors() {
    this._motorPinnedIds = getMotorPinnedIds(this.motorState);
    applyMotorPositions(this.motorState, this.player.position, this.player.rotation.y);
  }

  /** Updates player animation state */
  private _updatePlayerAnimation() {
    updatePlayerAnimation(this.player);
  }

  /** Run pickup sweep using extracted module */
  private _runPickupSweep() {
    const ctx: TouchSystemContext = {
      playerContacts: this._playerContacts,
      emitObjectEvent: (id, event, args) => this.emitObjectEvent(id, event, args),
      pushLog: (line) => this.pushLog(line),
      removeObject: (id) => this.removeObject(id),
      rebuildIndexes: () => this.rebuildIndexes(),
      getObject: (id) => this._all.get(id),
    };
    runPickupSweep(this.player, this.objectList, ctx);
  }

  /** Run touch sweep using extracted module */
  private _runTouchSweep() {
    const ctx: TouchSystemContext = {
      playerContacts: this._playerContacts,
      emitObjectEvent: (id, event, args) => this.emitObjectEvent(id, event, args),
      pushLog: (line) => this.pushLog(line),
      removeObject: (id) => this.removeObject(id),
      rebuildIndexes: () => this.rebuildIndexes(),
      getObject: (id) => this._all.get(id),
    };
    runTouchSweep(this.player, this.objectList, ctx);
  }

  step(dt: number) {
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    const p = this.player;

    // INPUT PHASE - emit key events (still handled by legacy event system for scripts)
    for (const k in this.input.keys) {
      const isDown = !!this.input.keys[k];
      const wasDown = !!this._prevKeys[k];
      if (isDown && !wasDown) {
        this._events.emit("keyDown", [k], (e, fn) => this.pushLog(`internal keyDown error: ${formatErr(e)}`));
        const set = this._keyDownHandlers.get(k);
        if (set) for (const fn of set) try { fn(); } catch (e: any) { this.pushLog(`keyboard.onPress("${k}") error: ${formatErr(e)}`); }
      } else if (!isDown && wasDown) {
        this._events.emit("keyUp", [k], (e, fn) => this.pushLog(`internal keyUp error: ${formatErr(e)}`));
        const set = this._keyUpHandlers.get(k);
        if (set) for (const fn of set) try { fn(); } catch (e: any) { this.pushLog(`keyboard.onRelease("${k}") error: ${formatErr(e)}`); }
      }
    }
    this._events.emit("input", [dt, this.time], (e, fn) => this.pushLog(`runService.input error: ${formatErr(e)}`));

    // ANIMATION PHASE - tweens are still managed by legacy TweenManager for API compatibility
    this._tweens.step(dt);
    this._events.emit("animation", [dt, this.time], (e, fn) => this.pushLog(`runService.animation error: ${formatErr(e)}`));

    // ECS PIPELINE - runs all simulation (animation, physics, collision, lifecycle)
    // This is now the single source of truth for game state
    this.stepEcsPipeline(dt);

    // REPLICATION PHASE - network sync
    this.network.step(dt, this.player, this.objectList, {
      t: this.time,
      moveX: this.input.moveX,
      moveZ: this.input.moveZ,
      jump: this.input.jump,
      keys: { ...this.input.keys },
    });
    this._events.emit("replication", [dt, this.time], (e, fn) => this.pushLog(`runService.replication error: ${formatErr(e)}`));
    this._events.emit("physics", [dt, this.time], (e, fn) => this.pushLog(`runService.physics error: ${formatErr(e)}`));

    // POST-PHYSICS - touch events and motor attachment (still uses legacy systems for event emission)
    this._runPickupSweep();
    this.applyMotors();
    this._updatePlayerAnimation();
    this._runTouchSweep();

    // Kill zone check
    if (!p.ragdoll && p.position.y < p.killY) {
      p.kill();
    }

    // Ragdoll respawn timer
    if (p.ragdoll && this.time >= this._ragdollUntil) {
      p.respawn();
    }

    // Ragdoll visual physics (purely cosmetic)
    if (p.ragdoll && this._ragdollPos && this._ragdollVel) {
      const g = -this.physics.gravity;
      for (const k of Object.keys(this._ragdollPos)) {
        const pos = this._ragdollPos[k];
        const vel = this._ragdollVel[k];
        vel.y += g * dt;
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
        pos.z += vel.z * dt;
      }
    }

    // RENDER PHASE
    this._events.emit("render", [dt, this.time], (e, fn) => this.pushLog(`runService.render error: ${formatErr(e)}`));

    // UPDATE PHASE
    this._events.emit("update", [dt, this.time], (e, fn) => this.pushLog(`runService.update error: ${formatErr(e)}`));

    // Timers
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const t = this._timers[i];
      if (this.time < t.nextAt) continue;
      try { t.fn(); } catch (e: any) { this.pushLog(`timer error: ${formatErr(e)}`); }
      if (t.once) { this._timers.splice(i, 1); }
      else { t.nextAt = this.time + t.interval; }
    }

    // Snapshot keys for next frame
    for (const k in this.input.keys) this._prevKeys[k] = this.input.keys[k];
    this.input.jump = false;
  }

  /** Delegates to the extracted physics/player-collision module */
  private resolvePlayerVsObject(o: RuntimeObject) {
    const pRad = this.player.collisionRadius ?? 0.4;
    const pHalfH = this.player.collisionHalfHeight ?? 0.9;
    return resolvePlayerVsObject(this.player, o, pRad, pHalfH);
  }
}
