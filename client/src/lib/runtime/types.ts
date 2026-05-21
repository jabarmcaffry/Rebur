// types.ts
import type { RaycastResult } from "./raycast";
import type { Easing } from "./tween";

import type { EventChannel as _EventChannel, EventsAPI as _EventsAPI } from "./events/event-bus";
import type { KeyboardAPI as _KeyboardAPI } from "./events/keyboard";
import type { MouseAPI as _MouseAPI } from "./events/mouse";
import type { WorldAPI as _WorldAPI } from "./events/world-events";
import type { RuntimeInput as _RuntimeInput } from "./input/input-manager";

type EventChannel<T extends any[]> = _EventChannel<T>;
type EventsAPI = _EventsAPI;
type KeyboardAPI = _KeyboardAPI;
type MouseAPI = _MouseAPI;
type WorldAPI = _WorldAPI;
type RuntimeInput = _RuntimeInput;

export type { RaycastResult } from "./raycast";
export type { NetSnapshot, NetInput } from "./network";

export { EventBus, type EventChannel, type EventsAPI } from "./events/event-bus";
export { type KeyboardAPI, createKeyboardAPI, processKeyboardInput } from "./events/keyboard";
export { type MouseAPI, createMouseAPI, processMouseClick } from "./events/mouse";
export { type WorldAPI, createWorldAPI } from "./events/world-events";
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
  autoFollow?: { target: any; speed: number; offset?: Vec3 };
  autoSpin?: { x?: number; y?: number; z?: number };
  autoMove?: { direction: Vec3; speed: number };
};

export type ObjectEventName =
  | "touched"
  | "untouched"
  | "clicked"
  | "destroyed"
  | "changed"
  | "touchStarted"
  | "touchEnded"
  | "woke"
  | "slept"
  | "collisionStarted"
  | "collisionEnded"
  | "propertyChanged";

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
  modelId?: string | null;
  modelUrl?: string | null;
  modelInstanceId?: string | null;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
  modelScale?: number;
  on: (event: string, fn: (...args: any[]) => void) => () => void;
  off: (event: string, fn: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => boolean;
  setAttribute: (key: string, value: any) => void;
  getAttribute: (key: string) => any;
  getAttributes: () => Record<string, any>;
  parentId: string | null;
  readonly children: RuntimeObject[];
  findFirstChild: (name: string) => RuntimeObject | null;
  setParent: (parent: RuntimeObject | null) => void;
  _gravityExclusions: Set<string>;
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
  items: InventoryItem[];
  maxSlots: number;
  equipped: InventoryItem | null;
  add: (name: string, opts?: { count?: number; template?: string; data?: Record<string, any> }) => InventoryItem | null;
  remove: (name: string, count?: number) => number;
  has: (name: string, count?: number) => boolean;
  get: (name: string) => InventoryItem | null;
  equip: (name: string | null) => boolean;
  drop: (name: string, count?: number) => RuntimeObject | null;
  clear: () => void;
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
  collisionRadius: number;
  collisionHalfHeight: number;
  inventory: PlayerInventory;
  motors: {
    attach: (slot: string, obj: RuntimeObject, offset?: Vec3, rotation?: Vec3) => void;
    detach: (slot: string) => RuntimeObject | null;
    get: (slot: string) => RuntimeObject | null;
    animation: string;
  };
  autoFaceMovement: boolean;
  ragdoll: boolean;
  killY: number;
  takeDamage: (n: number) => void;
  heal: (n: number) => void;
  kill: () => void;
  teleport: (x: number, y: number, z: number) => void;
  respawn: () => void;
};

export type RuntimePhysics = {
  gravity: number;
  airDrag: number;
};

export type RuntimeState = {
  set: (key: string, value: any) => void;
  get: (key: string) => any;
  on: (key: string, fn: (value: any, prev: any) => void) => () => void;
  keys: () => string[];
  getAll?: () => Record<string, any>;
};

export type GuiElement = {
  id: string;
  kind: "text" | "button";
  text: string;
  x: number;
  y: number;
  anchor: string;
  color: string;
  size: number;
  bg?: string;
  onClick?: (game: GameAPI) => void;
};

export type EngineEvents = {
  input: [dt: number, time: number];
  animation: [dt: number, time: number];
  replication: [dt: number, time: number];
  physics: [dt: number, time: number];
  render: [dt: number, time: number];
  update: [dt: number, time: number];
  start: [];
  stop: [];
  keyDown: [key: string];
  keyUp: [key: string];
  objectAdded: [obj: RuntimeObject];
  objectRemoved: [obj: RuntimeObject];
  playerSpawned: [player: RuntimePlayer];
  playerDied: [player: RuntimePlayer];
};

export type RunServiceAPI = {
  input: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
  animation: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
  replication: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
  physics: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
  render: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
  update: { on: (fn: (dt: number, time: number) => void) => () => void; off: (fn: any) => void };
};

export type RaycastParams = {
  ignore?: RuntimeObject[];
  ignoreNames?: string[];
  maxDistance?: number;
  filter?: (obj: RuntimeObject) => boolean;
};

export type RuntimeCamera = {
  mode: "thirdPerson" | "firstPerson" | "fixed" | "follow" | "scripted" | "free";
  distance: number;
  minDistance: number;
  maxDistance: number;
  offset: Vec3;
  sensitivity: number;
  lockYaw: boolean;
  lockPitch: boolean;
  position: Vec3;
  lookAt: Vec3;
  fov: number;
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
  create: (opts: any) => RuntimeObject;
  destroy: (target: RuntimeObject | string) => void;
  gui: { text: (id: string, text: string, opts?: any) => void; button: (id: string, text: string, opts?: any, onClick?: (game: GameAPI) => void) => void; clear: (id?: string) => void };
  onKey: (key: string, fn: () => void) => () => void;
  onUpdate: (fn: (dt: number, time: number) => void) => () => void;
  every: (seconds: number, fn: () => void) => () => void;
  after: (seconds: number, fn: () => void) => () => void;
  wait: (seconds: number) => Promise<void>;
  tween: (target: any, to: Record<string, any>, duration: number, easing?: any, onDone?: () => void) => any;
  random: (min: number, max: number) => number;
  randInt: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
  dist: (a: any, b: any) => number;
  lerp: (a: number, b: number, t: number) => number;
  clamp: (n: number, min: number, max: number) => number;
  raycast: (origin: Vec3, direction: Vec3, maxDistance?: number, params?: RaycastParams) => any;
  network: any;
  Emitter: any;
  Callable: any;
  tags: any;
  require: (name: string) => any;
  task: any;
  debug: any;
  weakRef: any;
  WeakTable: any;
  Class: any;
  exports?: any;
  module?: { exports: any };
};

export type CompiledScript = {
  name: string;
  run: ((api: GameAPI) => void) | null;
  error?: string;
};

export { DEFAULT_PROPERTIES } from "./utils/helpers";
