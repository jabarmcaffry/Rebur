// types.ts — self-contained, no imports from deleted runtime modules

export type RaycastResult = { object: RuntimeObject; distance: number; point: Vec3; normal: Vec3 } | null;
export type NetSnapshot = Record<string, any>;
export type NetInput = Record<string, any>;

export type EventChannel<T extends any[]> = {
  on: (...args: T) => void;
  off: (...args: T) => void;
};
export type EventsAPI = Record<string, (...args: any[]) => void>;

export type InputAPI = {
  on: (event: 'press' | 'release' | 'mouseClick', fn: (...args: any[]) => void) => () => void;
  off: (event: string, fn: any) => void;
  isDown: (key: string) => boolean;
};

export type WorldAPI = {
  onPlayerSpawned: (fn: (player: RuntimePlayer) => void) => () => void;
  onPlayerDied: (fn: (player: RuntimePlayer) => void) => () => void;
};

export type RuntimeInput = {
  moveX: number;
  moveZ: number;
  jump: boolean;
  flyUp: boolean;
  flyDown: boolean;
  keys: Set<string>;
};

export type Vec3 = { x: number; y: number; z: number };

export type ContainerName =
  | "Workspace"
  | "Lighting"
  | "Players"
  | "Players/StarterInventory"
  | "Players/StarterCharacter"
  | "UI"
  | "UI/Player"
  | "UI/Global"
  | "UI/Components"
  | "Assets"
  | "Assets/Shared"
  | "Assets/Server"
  | "Systems"
  | "Teams"
  | "Chat"
  | "Network"
  | string;

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
  /** Roblox-style animation system. Use animator.load(def) to get AnimationTrack. */
  readonly animator: import("./animation/keyframe-player").Animator;
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

export type PlayerEventName = "changed" | string;

export type RuntimePlayer = {
  readonly id: string;
  readonly username: string;
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
  /** Set to true to trigger an immediate respawn to spawnPoint. */
  respawn: boolean;
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
  on: (event: PlayerEventName, fn: (...args: any[]) => void) => () => void;
  off: (event: PlayerEventName, fn: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => boolean;
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
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  [key: string]: any;
};

export type GameAPI = {
  objects: Record<string, RuntimeObject>;
  workspace: Record<string, RuntimeObject>;
  lighting: Record<string, RuntimeObject>;
  assets: {
    shared: Record<string, RuntimeObject>;
    server: Record<string, RuntimeObject>;
  };
  players: Record<string, RuntimeObject>;
  player: RuntimePlayer;
  input: RuntimeInput;
  physics: RuntimePhysics;
  state: RuntimeState;
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

export const DEFAULT_PROPERTIES = {
  anchored: false,
  canCollide: true,
  transparency: 0,
  mass: 1,
  friction: 0.5,
} as const;
