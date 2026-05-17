/**
 * Monaco Editor Configuration for Rebur Engine Scripts
 * 
 * Provides:
 * - Custom autocomplete for all engine APIs
 * - Type definitions for intellisense
 * - Custom theme matching the editor
 * - Snippets for common patterns
 */

import type * as Monaco from "monaco-editor";

/** Type definitions for the scripting API */
export const ENGINE_TYPE_DEFS = `
// =============================================================================
// REBUR ENGINE TYPE DEFINITIONS
// =============================================================================

// -----------------------------------------------------------------------------
// Basic Types
// -----------------------------------------------------------------------------

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface RuntimeObject {
  // Identity
  readonly id: string;
  name: string;
  readonly type: string;
  readonly primitiveType: string | null;
  readonly container: ContainerName;
  
  // Transform
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  velocity: Vec3;
  
  // Appearance
  color: string;
  visible: boolean;
  transparency: number;
  
  // Physics
  anchored: boolean;
  canCollide: boolean;
  mass: number;
  friction: number;
  gravity: false | { strength: number; radius: number; player?: boolean };
  
  // Auto behaviors
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number };
  autoSpin?: Vec3;
  autoMove?: { from: Vec3; to: Vec3; speed: number; loop?: boolean };
  autoFollow?: { target: RuntimeObject | string; speed: number; offset?: Vec3 };
  
  // Pickup
  isPickup?: boolean;
  pickupName?: string;
  pickupData?: any;
  pickupCount?: number;
  
  // Hierarchy
  parentId: string | null;
  readonly children: RuntimeObject[];
  findFirstChild(name: string): RuntimeObject | null;
  setParent(parent: RuntimeObject | null): void;
  
  // Events
  on(event: "touched", fn: (other: RuntimeObject | RuntimePlayer) => void): () => void;
  on(event: "untouched", fn: (other: RuntimeObject | RuntimePlayer) => void): () => void;
  on(event: "touchStarted", fn: (other: RuntimeObject | RuntimePlayer, pen: number, normal: Vec3) => void): () => void;
  on(event: "touchEnded", fn: (other: RuntimeObject | RuntimePlayer) => void): () => void;
  on(event: "clicked", fn: (obj: RuntimeObject) => void): () => void;
  on(event: "destroyed", fn: () => void): () => void;
  on(event: "collisionStarted", fn: (other: RuntimeObject, contact: { point: Vec3; normal: Vec3 }) => void): () => void;
  on(event: "collisionEnded", fn: (other: RuntimeObject) => void): () => void;
  off(event: string, fn: Function): void;
  
  // Property changes
  onPropertyChanged(property: string): { on(event: "changed", fn: (prop: string, newVal: any, oldVal: any) => void): () => void };
  GetPropertyChangedSignal(property: string): { on(event: "changed", fn: (prop: string, newVal: any, oldVal: any) => void): () => void };
  
  // Attributes
  setAttribute(key: string, value: any): void;
  getAttribute(key: string): any;
  getAttributes(): Record<string, any>;
}

interface RuntimePlayer {
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
  up: Vec3;
  collisionRadius: number;
  collisionHalfHeight: number;
  autoFaceMovement: boolean;
  ragdoll: boolean;
  killY: number;
  
  // Actions
  takeDamage(amount: number): void;
  heal(amount: number): void;
  kill(): void;
  teleport(position: Vec3): void;
  respawn(): void;
  
  // Inventory
  readonly inventory: Inventory;
  
  // Motors (attach objects to player body)
  motors: {
    attach(slot: MotorSlot, obj: RuntimeObject, offset?: Vec3, rotation?: Vec3): void;
    detach(slot: MotorSlot): RuntimeObject | null;
    get(slot: MotorSlot): RuntimeObject | null;
    animation: string;
  };
}

type MotorSlot = "rightHand" | "leftHand" | "head" | "back" | "chest";

interface Inventory {
  items: InventoryItem[];
  equipped: InventoryItem | null;
  add(name: string, count?: number, data?: any): void;
  remove(name: string, count?: number): boolean;
  has(name: string): boolean;
  count(name: string): number;
  equip(name: string): boolean;
  unequip(): void;
  drop(name: string): void;
  on(event: "changed", fn: (items: InventoryItem[]) => void): () => void;
  on(event: "itemAdded", fn: (item: InventoryItem) => void): () => void;
  on(event: "itemRemoved", fn: (item: InventoryItem) => void): () => void;
  on(event: "equipped", fn: (item: InventoryItem | null) => void): () => void;
}

interface InventoryItem {
  name: string;
  count: number;
  data?: any;
}

type ContainerName = "Workspace" | "Lighting" | "ReplicatedStorage" | "ServerScriptService" | "StarterPlayer" | "Players";

// -----------------------------------------------------------------------------
// Input APIs
// -----------------------------------------------------------------------------

interface KeyboardAPI {
  /** Subscribe to key press. Returns unsubscribe function. */
  onPress(key: string, fn: () => void): () => void;
  /** Subscribe to key release. Returns unsubscribe function. */
  onRelease(key: string, fn: () => void): () => void;
  /** Check if key is currently held */
  isDown(key: string): boolean;
}

interface MouseAPI {
  /** Subscribe to 3D object clicks. Callback receives clicked object or null. */
  onClick(fn: (obj: RuntimeObject | null) => void): () => void;
}

// -----------------------------------------------------------------------------
// Camera
// -----------------------------------------------------------------------------

interface RuntimeCamera {
  mode: "thirdPerson" | "firstPerson" | "fixed" | "follow";
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
}

// -----------------------------------------------------------------------------
// Run Service (Game Loop)
// -----------------------------------------------------------------------------

interface RunServiceAPI {
  input: { on(fn: (dt: number, time: number) => void): () => void };
  animation: { on(fn: (dt: number, time: number) => void): () => void };
  physics: { on(fn: (dt: number, time: number) => void): () => void };
  replication: { on(fn: (dt: number, time: number) => void): () => void };
  render: { on(fn: (dt: number, time: number) => void): () => void };
  update: { on(fn: (dt: number, time: number) => void): () => void };
}

// -----------------------------------------------------------------------------
// World Events
// -----------------------------------------------------------------------------

interface WorldAPI {
  onObjectAdded(fn: (obj: RuntimeObject) => void): () => void;
  onObjectRemoved(fn: (obj: RuntimeObject) => void): () => void;
  onPlayerSpawned(fn: (player: RuntimePlayer) => void): () => void;
  onPlayerDied(fn: (player: RuntimePlayer) => void): () => void;
}

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

interface RuntimeState {
  get<T = any>(key: string): T | undefined;
  set(key: string, value: any): void;
  on(key: string, fn: (value: any, oldValue: any) => void): () => void;
  keys(): string[];
  getAll(): Record<string, any>;
}

// -----------------------------------------------------------------------------
// GUI
// -----------------------------------------------------------------------------

interface GuiAPI {
  text(id: string, text: string, opts?: {
    x?: number;
    y?: number;
    anchor?: "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";
    color?: string;
    size?: number;
    bg?: string;
  }): void;
  button(id: string, text: string, opts?: {
    x?: number;
    y?: number;
    anchor?: "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";
    color?: string;
    size?: number;
    bg?: string;
  }, onClick?: () => void): void;
  clear(id?: string): void;
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

interface TagsAPI {
  add(obj: RuntimeObject, tag: string): void;
  remove(obj: RuntimeObject, tag: string): void;
  has(obj: RuntimeObject, tag: string): boolean;
  get(tag: string): RuntimeObject[];
  all(obj: RuntimeObject): string[];
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

interface TaskAPI {
  wait(seconds: number): Promise<void>;
  delay(seconds: number, callback: () => void): void;
  spawn<T>(fn: (...args: any[]) => T, ...args: any[]): T;
}

// -----------------------------------------------------------------------------
// Network
// -----------------------------------------------------------------------------

interface NetworkAPI {
  server: {
    broadcast(channel: string, payload: any): void;
    on(channel: string, fn: (payload: any) => void): () => void;
  };
  client: {
    send(channel: string, payload: any): void;
    on(channel: string, fn: (payload: any) => void): () => void;
  };
}

// -----------------------------------------------------------------------------
// Raycasting
// -----------------------------------------------------------------------------

interface RaycastResult {
  object: RuntimeObject;
  distance: number;
  point: Vec3;
  normal: Vec3;
}

interface RaycastParams {
  ignore?: RuntimeObject[];
  ignoreNames?: string[];
  maxDistance?: number;
}

// -----------------------------------------------------------------------------
// Debug
// -----------------------------------------------------------------------------

interface DebugAPI {
  getChildren(obj: RuntimeObject): RuntimeObject[];
  getDescendants(obj: RuntimeObject): RuntimeObject[];
  getFullName(obj: RuntimeObject): string;
  getPropertyNames(obj: RuntimeObject): string[];
  getObjectsWithTag(tag: string): RuntimeObject[];
  getEventConnections(obj: RuntimeObject): number;
}

// -----------------------------------------------------------------------------
// Classes
// -----------------------------------------------------------------------------

declare class Emitter<T extends Record<string, any[]>> {
  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): () => void;
  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): void;
  emit<K extends keyof T>(event: K, ...args: T[K]): void;
}

declare class Callable<T extends (...args: any[]) => any> {
  constructor(fn: T);
  static create<T extends (...args: any[]) => any>(fn: T): T & { destroy(): void };
}

declare function Class<T extends new (...args: any[]) => any>(base: T): T;

// -----------------------------------------------------------------------------
// Global Functions & Variables
// -----------------------------------------------------------------------------

// Containers
declare const workspace: Record<string, RuntimeObject>;
declare const lighting: Record<string, RuntimeObject>;
declare const replicatedStorage: Record<string, RuntimeObject>;
declare const serverScriptService: Record<string, RuntimeObject>;
declare const starterPlayer: Record<string, RuntimeObject>;
declare const players: Record<string, RuntimeObject>;

// Objects
declare function create(opts: {
  name?: string;
  primitiveType?: "cube" | "sphere" | "cylinder" | "plane";
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec3>;
  color?: string;
  anchored?: boolean;
  canCollide?: boolean;
  container?: ContainerName;
  parent?: RuntimeObject;
  gravity?: boolean | { strength: number; radius: number };
}): RuntimeObject;

declare function spawn(templateName: string, overrides?: Partial<RuntimeObject>): RuntimeObject | null;
declare function find(name: string): RuntimeObject | null;
declare function destroy(target: RuntimeObject | string): void;

// Player
declare const player: RuntimePlayer;
declare const inventory: Inventory;

// Input
declare const keyboard: KeyboardAPI;
declare const mouse: MouseAPI;

// Systems
declare const camera: RuntimeCamera;
declare const world: WorldAPI;
declare const runService: RunServiceAPI;
declare const network: NetworkAPI;
declare const state: RuntimeState;
declare const tags: TagsAPI;
declare const gui: GuiAPI;
declare const task: TaskAPI;
declare const debug: DebugAPI;

// Timing
declare const time: number;
declare const dt: number;
declare function now(): number;
declare function every(seconds: number, fn: () => void): () => void;
declare function after(seconds: number, fn: () => void): () => void;
declare function wait(seconds: number): Promise<void>;

// Animation
type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce" | "elastic";
declare function tween(target: any, to: Record<string, any>, duration: number, easing?: Easing, onDone?: () => void): { cancel(): void };

// Physics
declare function raycast(origin: Vec3, direction: Vec3, maxDistance?: number, params?: RaycastParams): RaycastResult | null;

// Math
declare function random(min: number, max: number): number;
declare function randInt(min: number, max: number): number;
declare function pick<T>(arr: T[]): T;
declare function dist(a: Vec3 | RuntimeObject, b: Vec3 | RuntimeObject): number;
declare function lerp(a: number, b: number, t: number): number;
declare function clamp(n: number, min: number, max: number): number;

// Modules
declare function require(moduleName: string): any;
declare const exports: any;
declare const module: { exports: any };

// Debug
declare function log(...args: any[]): void;

// Key handling shortcut
declare function onKey(key: string, fn: () => void): () => void;
declare function onUpdate(fn: (dt: number, time: number) => void): () => void;
`;

/** Autocomplete items for the engine API */
export const AUTOCOMPLETE_ITEMS: Monaco.languages.CompletionItem[] = [
  // Objects
  { label: "create", kind: 1, insertText: "create({\n\tname: \\"\\",\n\tprimitiveType: \\"cube\\",\n\tposition: { x: 0, y: 1, z: 0 },\n\tcolor: \\"#88aaff\\",\n})", insertTextRules: 4, detail: "Create a new object", documentation: "Create a new RuntimeObject with the specified properties." },
  { label: "spawn", kind: 1, insertText: "spawn(\\"$1\\")", insertTextRules: 4, detail: "Clone from ReplicatedStorage", documentation: "Clone an object from ReplicatedStorage by name." },
  { label: "find", kind: 1, insertText: "find(\\"$1\\")", insertTextRules: 4, detail: "Find object by name", documentation: "Search all containers for an object by name." },
  { label: "destroy", kind: 1, insertText: "destroy($1)", insertTextRules: 4, detail: "Remove an object", documentation: "Destroy an object by reference or name." },
  
  // Player
  { label: "player", kind: 5, insertText: "player", detail: "The local player", documentation: "Reference to the current player's RuntimePlayer object." },
  { label: "player.position", kind: 9, insertText: "player.position", detail: "Player position", documentation: "Player's position as Vec3." },
  { label: "player.velocity", kind: 9, insertText: "player.velocity", detail: "Player velocity", documentation: "Player's velocity as Vec3." },
  { label: "player.health", kind: 9, insertText: "player.health", detail: "Player health", documentation: "Player's current health (0-100)." },
  { label: "player.takeDamage", kind: 1, insertText: "player.takeDamage($1)", insertTextRules: 4, detail: "Damage the player", documentation: "Deal damage to the player." },
  { label: "player.heal", kind: 1, insertText: "player.heal($1)", insertTextRules: 4, detail: "Heal the player", documentation: "Restore health to the player." },
  { label: "player.kill", kind: 1, insertText: "player.kill()", detail: "Kill the player", documentation: "Instantly kill the player (triggers respawn)." },
  { label: "player.respawn", kind: 1, insertText: "player.respawn()", detail: "Respawn the player", documentation: "Respawn the player at their spawn point." },
  { label: "player.teleport", kind: 1, insertText: "player.teleport({ x: $1, y: $2, z: $3 })", insertTextRules: 4, detail: "Teleport the player", documentation: "Teleport the player to a position." },
  
  // Input
  { label: "keyboard", kind: 5, insertText: "keyboard", detail: "Keyboard input API", documentation: "API for keyboard input handling." },
  { label: "keyboard.onPress", kind: 1, insertText: "keyboard.onPress(\\"$1\\", () => {\n\t$2\n})", insertTextRules: 4, detail: "On key press", documentation: "Subscribe to key press events." },
  { label: "keyboard.onRelease", kind: 1, insertText: "keyboard.onRelease(\\"$1\\", () => {\n\t$2\n})", insertTextRules: 4, detail: "On key release", documentation: "Subscribe to key release events." },
  { label: "keyboard.isDown", kind: 1, insertText: "keyboard.isDown(\\"$1\\")", insertTextRules: 4, detail: "Check if key held", documentation: "Check if a key is currently held down." },
  { label: "mouse", kind: 5, insertText: "mouse", detail: "Mouse input API", documentation: "API for mouse input handling." },
  { label: "mouse.onClick", kind: 1, insertText: "mouse.onClick((obj) => {\n\t$1\n})", insertTextRules: 4, detail: "On 3D click", documentation: "Subscribe to 3D object clicks." },
  
  // Events
  { label: ".on(\"touched\")", kind: 1, insertText: ".on(\\"touched\\", (other) => {\n\t$1\n})", insertTextRules: 4, detail: "On touch event", documentation: "Called when this object is touched by another object or player." },
  { label: ".on(\"clicked\")", kind: 1, insertText: ".on(\\"clicked\\", () => {\n\t$1\n})", insertTextRules: 4, detail: "On click event", documentation: "Called when this object is clicked." },
  { label: ".on(\"destroyed\")", kind: 1, insertText: ".on(\\"destroyed\\", () => {\n\t$1\n})", insertTextRules: 4, detail: "On destroy event", documentation: "Called when this object is destroyed." },
  
  // Timing
  { label: "every", kind: 1, insertText: "every($1, () => {\n\t$2\n})", insertTextRules: 4, detail: "Repeat every N seconds", documentation: "Call a function repeatedly at the specified interval." },
  { label: "after", kind: 1, insertText: "after($1, () => {\n\t$2\n})", insertTextRules: 4, detail: "Run after N seconds", documentation: "Call a function once after a delay." },
  { label: "wait", kind: 1, insertText: "await wait($1)", insertTextRules: 4, detail: "Wait N seconds", documentation: "Pause script execution for the specified duration." },
  
  // GUI
  { label: "gui.text", kind: 1, insertText: "gui.text(\\"$1\\", \\"$2\\", { anchor: \\"tc\\", y: 16 })", insertTextRules: 4, detail: "Display text", documentation: "Display text on the screen." },
  { label: "gui.button", kind: 1, insertText: "gui.button(\\"$1\\", \\"$2\\", { anchor: \\"br\\", x: 24, y: 24 }, () => {\n\t$3\n})", insertTextRules: 4, detail: "Create a button", documentation: "Create a clickable button on the screen." },
  { label: "gui.clear", kind: 1, insertText: "gui.clear($1)", insertTextRules: 4, detail: "Clear GUI", documentation: "Clear all or specific GUI elements." },
  
  // Run service
  { label: "runService.update.on", kind: 1, insertText: "runService.update.on((dt) => {\n\t$1\n})", insertTextRules: 4, detail: "Every frame (update)", documentation: "Called every frame during the update phase." },
  { label: "runService.render.on", kind: 1, insertText: "runService.render.on((dt) => {\n\t$1\n})", insertTextRules: 4, detail: "Every frame (render)", documentation: "Called every frame during the render phase." },
  { label: "runService.physics.on", kind: 1, insertText: "runService.physics.on((dt) => {\n\t$1\n})", insertTextRules: 4, detail: "Every frame (physics)", documentation: "Called every frame during the physics phase." },
  
  // World events
  { label: "world.onPlayerSpawned", kind: 1, insertText: "world.onPlayerSpawned((p) => {\n\t$1\n})", insertTextRules: 4, detail: "Player spawned", documentation: "Called when a player spawns." },
  { label: "world.onPlayerDied", kind: 1, insertText: "world.onPlayerDied((p) => {\n\t$1\n})", insertTextRules: 4, detail: "Player died", documentation: "Called when a player dies." },
  { label: "world.onObjectAdded", kind: 1, insertText: "world.onObjectAdded((obj) => {\n\t$1\n})", insertTextRules: 4, detail: "Object added", documentation: "Called when an object is added to the world." },
  { label: "world.onObjectRemoved", kind: 1, insertText: "world.onObjectRemoved((obj) => {\n\t$1\n})", insertTextRules: 4, detail: "Object removed", documentation: "Called when an object is removed from the world." },
  
  // State
  { label: "state.get", kind: 1, insertText: "state.get(\\"$1\\")", insertTextRules: 4, detail: "Get state value", documentation: "Get a global state value." },
  { label: "state.set", kind: 1, insertText: "state.set(\\"$1\\", $2)", insertTextRules: 4, detail: "Set state value", documentation: "Set a global state value." },
  { label: "state.on", kind: 1, insertText: "state.on(\\"$1\\", (value) => {\n\t$2\n})", insertTextRules: 4, detail: "Watch state", documentation: "Subscribe to state changes." },
  
  // Math
  { label: "random", kind: 1, insertText: "random($1, $2)", insertTextRules: 4, detail: "Random float", documentation: "Generate a random number between min and max." },
  { label: "randInt", kind: 1, insertText: "randInt($1, $2)", insertTextRules: 4, detail: "Random integer", documentation: "Generate a random integer between min and max (inclusive)." },
  { label: "pick", kind: 1, insertText: "pick($1)", insertTextRules: 4, detail: "Random array element", documentation: "Pick a random element from an array." },
  { label: "dist", kind: 1, insertText: "dist($1, $2)", insertTextRules: 4, detail: "Distance between points", documentation: "Calculate the distance between two points or objects." },
  { label: "lerp", kind: 1, insertText: "lerp($1, $2, $3)", insertTextRules: 4, detail: "Linear interpolation", documentation: "Linearly interpolate between two values." },
  { label: "clamp", kind: 1, insertText: "clamp($1, $2, $3)", insertTextRules: 4, detail: "Clamp value", documentation: "Clamp a value between min and max." },
  
  // Tween
  { label: "tween", kind: 1, insertText: "tween($1, { $2 }, $3, \\"easeInOut\\")", insertTextRules: 4, detail: "Animate properties", documentation: "Smoothly animate object properties over time." },
  
  // Raycast
  { label: "raycast", kind: 1, insertText: "raycast({ x: $1, y: $2, z: $3 }, { x: 0, y: 0, z: -1 }, 100)", insertTextRules: 4, detail: "Cast a ray", documentation: "Cast a ray and check for intersections." },
  
  // Log
  { label: "log", kind: 1, insertText: "log($1)", insertTextRules: 4, detail: "Log to console", documentation: "Log a message to the script console." },
  
  // Containers
  { label: "workspace", kind: 5, insertText: "workspace", detail: "Workspace container", documentation: "Container for live 3D world objects." },
  { label: "lighting", kind: 5, insertText: "lighting", detail: "Lighting container", documentation: "Container for lights and atmosphere." },
  { label: "replicatedStorage", kind: 5, insertText: "replicatedStorage", detail: "ReplicatedStorage container", documentation: "Container for templates and shared modules." },
].map(item => ({
  ...item,
  kind: item.kind as Monaco.languages.CompletionItemKind,
  range: undefined as any, // Will be set dynamically
}));

/**
 * Custom dark theme for the engine editor
 */
export const ENGINE_EDITOR_THEME: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955" },
    { token: "keyword", foreground: "C586C0" },
    { token: "string", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "type", foreground: "4EC9B0" },
    { token: "function", foreground: "DCDCAA" },
    { token: "variable", foreground: "9CDCFE" },
    { token: "identifier", foreground: "9CDCFE" },
  ],
  colors: {
    "editor.background": "#1a1a2e",
    "editor.foreground": "#e0e0e0",
    "editor.lineHighlightBackground": "#252540",
    "editor.selectionBackground": "#3d3d5c",
    "editorLineNumber.foreground": "#6c6c8a",
    "editorIndentGuide.background": "#2a2a4a",
    "editor.wordHighlightBackground": "#3d3d5c",
  },
};

/**
 * Configure Monaco editor for the engine scripting environment.
 */
export function configureMonacoForEngine(monaco: typeof Monaco): void {
  // Register the engine theme
  monaco.editor.defineTheme("engine-dark", ENGINE_EDITOR_THEME);
  
  // Add type definitions for autocomplete
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    lib: ["esnext"],
  });
  
  // Add type definitions
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    ENGINE_TYPE_DEFS,
    "ts:engine.d.ts"
  );
  
  // Register custom completion provider
  monaco.languages.registerCompletionItemProvider("javascript", {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      
      return {
        suggestions: AUTOCOMPLETE_ITEMS.map(item => ({
          ...item,
          range,
        })),
      };
    },
  });
  
  // Register hover provider for documentation
  monaco.languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      
      const item = AUTOCOMPLETE_ITEMS.find(
        i => i.label === word.word || i.label.startsWith(word.word + ".")
      );
      
      if (item && item.documentation) {
        return {
          contents: [{ value: \`**\${item.label}**\\n\\n\${item.documentation}\` }],
        };
      }
      
      return null;
    },
  });
}

/**
 * Editor default options optimized for the engine scripting experience.
 */
export const ENGINE_EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: "engine-dark",
  language: "javascript",
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  fontLigatures: true,
  lineNumbers: "on",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "on",
  formatOnPaste: true,
  formatOnType: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  parameterHints: { enabled: true },
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showVariables: true,
    showClasses: true,
    showMethods: true,
    showProperties: true,
  },
  bracketPairColorization: { enabled: true },
  autoClosingBrackets: "always",
  autoClosingQuotes: "always",
  autoIndent: "full",
};
