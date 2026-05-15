// types.ts
import type { RaycastParams, RaycastResult } from "./raycast";
import type { NetSnapshot, NetInput } from "./network";
import type { Easing } from "./tween";

// Import types from event/input modules for use in this file
import type { EventChannel as _EventChannel, EventsAPI as _EventsAPI } from "./events/event-bus";
import type { KeyboardAPI as _KeyboardAPI } from "./events/keyboard";
import type { MouseAPI as _MouseAPI } from "./events/mouse";
import type { WorldAPI as _WorldAPI } from "./events/world-events";
import type { RuntimeInput as _RuntimeInput } from "./input/input-manager";

// Alias imports for use in this file (avoid circular reference issues)
type EventChannel<T extends any[]> = _EventChannel<T>;
type EventsAPI = _EventsAPI;
type KeyboardAPI = _KeyboardAPI;
type MouseAPI = _MouseAPI;
type WorldAPI = _WorldAPI;
type RuntimeInput = _RuntimeInput;

export type { RaycastResult, RaycastParams } from "./raycast";
export type { NetSnapshot, NetInput } from "./network";

// Re-export from events module (canonical source)
export { EventBus, type EventChannel, type EngineEvents, type EventsAPI } from "./events/event-bus";
export { type KeyboardAPI, createKeyboardAPI, processKeyboardInput } from "./events/keyboard";
export { type MouseAPI, createMouseAPI, processMouseClick } from "./events/mouse";
export { type WorldAPI, createWorldAPI } from "./events/world-events";

// Re-export from input module (canonical source)
export { type RuntimeInput, createInputManager, snapshotPreviousKeys, resetJumpFlag } from "./input/input-manager";

export type Vec3 = { x: number; y: number; z: number };

export type ContainerName =
  | "Workspace"
  | "Lighting"
  | "Players"
  | "ServerScriptService"
  | "StarterPlayer"
  | "ReplicatedStorage";

export type ObjectProperties = {
  anchored: boolean;
  canCollide: boolean;
  transparency: number;
  mass: number;
  friction: number;
  gravity?: false | { strength: number; radius: number };
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number; startY?: number };
  autoFollow?: { target: any; speed: number; offset?: Vec3 }; // RuntimeObject | RuntimePlayer
  autoSpin?: { x?: number; y?: number; z?: number };
  autoMove?: { direction: Vec3; speed: number };
};

export type ObjectEventName = 
  | "touched" 
  | "untouched" 
  | "clicked" 
  | "destroyed" 
  | "changed"
  // New physics events
  | "touchStarted"
  | "touchEnded"
  | "woke"
  | "slept";

export type RuntimeObject = {
  id: string;
  name: string;
  type: string;
  primitiveType: string | null;
  container: ContainerName;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  anchored: boolean;
  canCollide: boolean;
  transparency: number;
  mass: number;
  friction: number;
  velocity: Vec3;
  isPickup?: boolean;
  pickupName?: string;
  pickupData?: Record<string, any>;
  gravity?: false | { strength: number; radius: number };
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number; startY?: number; _time?: number };
  autoFollow?: { target: any; speed: number; offset?: Vec3 };
  autoSpin?: { x?: number; y?: number; z?: number };
  autoMove?: { direction: Vec3; speed: number };
  // 3D Model support
  modelId?: string | null;
  modelUrl?: string | null;
  modelInstanceId?: string | null;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
  // Collision categories
  collisionCategory?: number;
  collisionMask?: number;
  parentId: string | null;
  readonly children: RuntimeObject[];
  findFirstChild: (name: string) => RuntimeObject | null;
  setParent: (parent: RuntimeObject | null) => void;
  on: (event: ObjectEventName, fn: (...args: any[]) => void) => () => void;
  off: (event: ObjectEventName, fn: (...args: any[]) => void) => void;
  /** Subscribe to property changes - camelCase API (preferred) */
  onPropertyChanged: (property: string) => EventsAPI;
  /** @deprecated Use onPropertyChanged instead */
  GetPropertyChangedSignal: (property: string) => EventsAPI;
  _gravityExclusions: Set<string>;
  setAttribute: (key: string, value: any) => void;
  getAttribute: (key: string) => any;
  getAttributes: () => Record<string, any>;
  __cleanup: Set<() => void>;
};

export type InventoryItem = {
  id: string;
  name: string;
  count: number;
  template?: string;
  data: Record<string, any>;
};

export type PlayerInventory = {
  readonly items: ReadonlyArray<InventoryItem>;
  maxSlots: number;
  readonly equipped: InventoryItem | null;
  add: (name: string, opts?: { count?: number; template?: string; data?: Record<string, any> }) => InventoryItem | null;
  remove: (name: string, count?: number) => number;
  has: (name: string, count?: number) => boolean;
  get: (name: string) => InventoryItem | null;
  equip: (name: string | null) => boolean;
  drop: (name: string, count?: number) => RuntimeObject | null;
  clear: () => void;
};

/**
 * Slots ("motors") on the player rig where a held object can be attached.
 * Setting a slot to a RuntimeObject pins it to the player every frame; setting
 * it to `null` releases. Position offsets are local to the avatar.
 */
export type MotorSlot = "rightHand" | "leftHand" | "back" | "head" | "torso";

export type PlayerMotors = {
  attach: (slot: MotorSlot, obj: RuntimeObject | null, offset?: Vec3, rotation?: Vec3) => void;
  detach: (slot: MotorSlot) => RuntimeObject | null;
  get: (slot: MotorSlot) => RuntimeObject | null;
  /**
   * Engine-driven animation name: "idle" | "walk" | "run" | "jump" | "fall" | "ragdoll".
   * The holding pose is automatic — attach an object to "rightHand" or
   * "leftHand" and that arm rises into a hold stance on top of any base anim.
   */
  animation: string;
};

export type RuntimePlayer = {
  username: string;
  color: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  onGround: boolean;
  health: number;
  maxHealth: number;
  speed: number;
  walkSpeed: number;
  runSpeed: number;
  jumpPower: number;
  size: number;
  spawnPoint: Vec3;
  up: Vec3;
  inventory: PlayerInventory;
  motors: PlayerMotors;
  autoFaceMovement?: boolean;
  collisionRadius?: number;      // Player collision radius (default 0.4)
  collisionHalfHeight?: number;  // Player collision half-height (default 0.9)
  /** While true the avatar renders as scattered limbs and movement is disabled. */
  ragdoll: boolean;
  /** Y world position below which the player auto-dies. Defaults to -50. */
  killY: number;
  takeDamage: (n: number) => void;
  heal: (n: number) => void;
  kill: () => void;
  teleport: (x: number, y: number, z: number) => void;
  respawn: () => void;
};

export type CameraMode = "thirdPerson" | "firstPerson" | "free" | "scripted";

export type RuntimeCamera = {
  mode: CameraMode;
  /** Distance from player in thirdPerson mode. */
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Local offset from the player position the camera looks at. */
  offset: Vec3;
  /** Mouse / touch sensitivity multiplier. */
  sensitivity: number;
  lockYaw: boolean;
  lockPitch: boolean;
  /** When mode === "scripted" the camera reads these directly each frame. */
  position: Vec3;
  lookAt: Vec3;
  fov: number;
};

// RuntimeInput is now re-exported from ./input/input-manager at the top of this file.

export type RuntimePhysics = {
  gravity: number;
  airDrag: number;
};

export type RuntimeState = {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  on: (key: string, fn: (value: string, prev: string | undefined) => void) => () => void;
  keys: () => string[];
};

export type GuiAnchor = "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";

export type GuiElement = {
  id: string;
  kind: "text" | "button";
  text: string;
  x: number;
  y: number;
  anchor: GuiAnchor;
  color: string;
  size: number;
  bg?: string;
  onClick?: (game: any) => void;
};

// NOTE: EngineEvents, EventChannel, EventBus, EventsAPI, KeyboardAPI, MouseAPI, WorldAPI
// are now re-exported from the events/ and input/ modules at the top of this file.

export type RunServiceAPI = {
  input: EventChannel<[dt: number, time: number]>;
  animation: EventChannel<[dt: number, time: number]>;
  replication: EventChannel<[dt: number, time: number]>;
  physics: EventChannel<[dt: number, time: number]>;
  render: EventChannel<[dt: number, time: number]>;
  update: EventChannel<[dt: number, time: number]>;
};

export type GameAPI = {
  objects: Record<string, RuntimeObject>;
  workspace: Record<string, RuntimeObject>;
  lighting: Record<string, RuntimeObject>;
  replicatedStorage: Record<string, RuntimeObject>;
  serverScriptService: Record<string, RuntimeObject>;
  starterPlayer: Record<string, RuntimeObject>;
  players: Record<string, RuntimeObject>;
  player: RuntimePlayer;
  input: RuntimeInput;
  physics: RuntimePhysics;
  state: RuntimeState;
  keyboard: KeyboardAPI;
  mouse: MouseAPI;
  world: WorldAPI;
  runService: RunServiceAPI;
  camera: RuntimeCamera;
  time: number;
  dt: number;
  now: () => number;
  log: (...args: any[]) => void;
  find: (name: string) => RuntimeObject | null;
  spawn: (templateName: string, overrides?: Partial<RuntimeObject>) => RuntimeObject | null;
  create: (opts: {
    name?: string;
    primitiveType?: "cube" | "sphere" | "cylinder" | "plane";
    container?: ContainerName;
    position?: Partial<Vec3>;
    rotation?: Partial<Vec3>;
    scale?: Partial<Vec3>;
    color?: string;
    type?: string;
    parent?: RuntimeObject | null;
    canCollide?: boolean;
    anchored?: boolean;
    gravity?: false | { strength: number; radius: number };
  }) => RuntimeObject;
  destroy: (objOrName: RuntimeObject | string) => void;
  raycast: (origin: Vec3, direction: Vec3, maxDistance?: number, params?: RaycastParams) => RaycastResult;
  network: {
    server: { broadcast: (channel: string, payload: any) => void; on: (channel: string, fn: (payload: any) => void) => () => void };
    client: { send: (channel: string, payload: any) => void; on: (channel: string, fn: (payload: any) => void) => () => void };
  };
  gui: {
    text: (id: string, text: string, opts?: Partial<Omit<GuiElement, "id" | "kind" | "text">>) => void;
    button: (id: string, text: string, opts: Partial<Omit<GuiElement, "id" | "kind" | "text">> | undefined, onClick?: (game: GameAPI) => void) => void;
    clear: (id?: string) => void;
  };
  onKey: (key: string, fn: () => void) => () => void;
  onUpdate: (fn: (dt: number, time: number) => void) => () => void;
  every: (seconds: number, fn: () => void) => () => void;
  after: (seconds: number, fn: () => void) => () => void;
  wait: (seconds: number) => Promise<void>;
  tween: (target: any, to: Record<string, any>, duration: number, easing?: Easing, onDone?: () => void) => () => void;
  random: (min: number, max: number) => number;
  randInt: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
  dist: (a: Vec3 | { position: Vec3 }, b: Vec3 | { position: Vec3 }) => number;
  lerp: (a: number, b: number, t: number) => number;
  clamp: (n: number, min: number, max: number) => number;
  // APIs
  Emitter: any;
  Callable: any;
  tags: {
    add: (obj: RuntimeObject, tag: string) => void;
    remove: (obj: RuntimeObject, tag: string) => void;
    has: (obj: RuntimeObject, tag: string) => boolean;
    get: (tag: string) => RuntimeObject[];
    all: (obj: RuntimeObject) => string[];
  };
  require: (name: string) => any;
  task: {
    wait: (seconds: number) => Promise<void>;
    delay: (seconds: number, callback: () => void) => () => void;
    spawn: (fn: (...args: any[]) => any, ...args: any[]) => void;
  };
  debug: {
    getChildren: (obj: RuntimeObject) => RuntimeObject[];
    getDescendants: (obj: RuntimeObject) => RuntimeObject[];
    getFullName: (obj: RuntimeObject) => string;
    getPropertyNames: (obj: RuntimeObject) => string[];
    getObjectsWithTag: (tag: string) => RuntimeObject[];
    getEventConnections: (obj: RuntimeObject) => number;
  };
  weakRef: <T extends object>(obj: T) => { get: () => T | null };
  WeakTable: any;
  Class: any;
  exports?: any;
  module?: { exports: any };
};

export type CompiledScript = {
  name: string;
  run?: (api: GameAPI) => void;
  error?: string;
};

export const DEFAULT_PROPERTIES: ObjectProperties = {
  anchored: true,
  canCollide: true,
  transparency: 0,
  mass: 1,
  friction: 0.4,
  gravity: false,
};
