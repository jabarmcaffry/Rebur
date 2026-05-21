/**
 * Monaco Editor Configuration for Rebur Engine Scripts
 *
 * - Disables Monaco's built-in TypeScript/JavaScript IntelliSense and autocomplete
 * - Registers a fully custom completion provider for the engine API
 * - Registers hover documentation
 * - Keeps the custom dark theme and syntax highlighting unchanged
 */

import type * as Monaco from "monaco-editor";

/** Type definitions added as extra lib for hover docs only (not for inference) */
export const ENGINE_TYPE_DEFS = `
// =============================================================================
// REBUR ENGINE — TYPE DEFINITIONS (for hover documentation only)
// =============================================================================

interface Vec3 { x: number; y: number; z: number; }

type ContainerName = "Workspace" | "Lighting" | "Players" | "ReplicatedStorage" | "ServerScriptService" | "StarterPlayer";

interface RuntimeObject {
  readonly id: string;
  name: string;
  readonly type: string;
  readonly primitiveType: string | null;
  readonly container: ContainerName;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  velocity: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  anchored: boolean;
  canCollide: boolean;
  mass: number;
  friction: number;
  gravity: false | { strength: number; radius: number };
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number };
  autoSpin?: Vec3;
  autoMove?: { direction: Vec3; speed: number };
  autoFollow?: { target: any; speed: number; offset?: Vec3 };
  isPickup?: boolean;
  pickupName?: string;
  pickupData?: any;
  parentId: string | null;
  readonly children: RuntimeObject[];
  on(event: string, fn: (...args: any[]) => void): () => void;
  off(event: string, fn: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
  findFirstChild(name: string): RuntimeObject | null;
  setParent(parent: RuntimeObject | null): void;
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
  autoFaceMovement: boolean;
  ragdoll: boolean;
  killY: number;
  takeDamage(n: number): void;
  heal(n: number): void;
  kill(): void;
  teleport(x: number, y: number, z: number): void;
  respawn(): void;
  readonly inventory: Inventory;
  motors: { attach(slot: string, obj: RuntimeObject, offset?: Vec3, rotation?: Vec3): void; detach(slot: string): RuntimeObject | null; get(slot: string): RuntimeObject | null; animation: string; };
  on(event: string, fn: (...args: any[]) => void): () => void;
  off(event: string, fn: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
}
`;

// ---------------------------------------------------------------------------
// Completion items — exhaustive engine API catalogue
// ---------------------------------------------------------------------------

type CompletionDef = {
  label: string;
  kind: number; // Monaco.languages.CompletionItemKind
  detail: string;
  doc: string;
  insert: string;
  snippet?: boolean; // if true, insertTextRules = InsertAsSnippet
};

const K = {
  Function: 1,
  Variable: 5,
  Property: 9,
  Keyword: 13,
  Snippet: 14,
  Module: 8,
} as const;

const COMPLETIONS: CompletionDef[] = [
  // ─── Object lifecycle ───────────────────────────────────────────────────
  {
    label: "create",
    kind: K.Function,
    detail: "create(opts) → RuntimeObject",
    doc: "Create a new object in the world.\n\nProperties:\n- name?: string\n- primitiveType?: 'cube'|'sphere'|'cylinder'|'plane'\n- position?: Vec3\n- rotation?: Vec3\n- scale?: Vec3\n- color?: string\n- anchored?: boolean\n- canCollide?: boolean\n- container?: ContainerName\n- parent?: RuntimeObject",
    insert: "create({\n\tname: \"${1:Part}\",\n\tprimitiveType: \"${2:cube}\",\n\tposition: { x: ${3:0}, y: ${4:1}, z: ${5:0} },\n\tcolor: \"${6:#88aaff}\",\n})",
    snippet: true,
  },
  {
    label: "destroy",
    kind: K.Function,
    detail: "destroy(target: RuntimeObject | string) → void",
    doc: "Destroy an object by reference or by name string.",
    insert: "destroy(${1:obj})",
    snippet: true,
  },
  {
    label: "find",
    kind: K.Function,
    detail: "find(name: string) → RuntimeObject | null",
    doc: "Search all containers for an object by name. Returns null if not found.",
    insert: "find(\"${1:Name}\")",
    snippet: true,
  },
  {
    label: "spawn",
    kind: K.Function,
    detail: "spawn(templateName: string, overrides?) → RuntimeObject | null",
    doc: "Clone a template from ReplicatedStorage into Workspace. Returns null if template not found.",
    insert: "spawn(\"${1:TemplateName}\")",
    snippet: true,
  },

  // ─── Containers ─────────────────────────────────────────────────────────
  { label: "workspace", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Live 3D world objects. Rendered and simulated.", insert: "workspace" },
  { label: "lighting", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Lights and atmosphere. Rendered but not simulated.", insert: "lighting" },
  { label: "players", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Player avatars and per-player data. Contains active players at runtime.", insert: "players" },
  { label: "replicatedStorage", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Templates and ModuleScripts. Not rendered — use spawn() to clone into Workspace.", insert: "replicatedStorage" },
  { label: "serverScriptService", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Server-authoritative scripts. Not rendered.", insert: "serverScriptService" },
  { label: "starterPlayer", kind: K.Variable, detail: "Record<string, RuntimeObject>", doc: "Scripts and objects cloned to each player on join.", insert: "starterPlayer" },

  // ─── Player ─────────────────────────────────────────────────────────────
  { label: "player", kind: K.Variable, detail: "RuntimePlayer", doc: "The local player object.", insert: "player" },
  { label: "player.position", kind: K.Property, detail: "Vec3 — { x, y, z }", doc: "Player world position (feet).", insert: "player.position" },
  { label: "player.rotation", kind: K.Property, detail: "Vec3 — { x, y, z } radians", doc: "Player rotation. rotation.y is yaw.", insert: "player.rotation" },
  { label: "player.velocity", kind: K.Property, detail: "Vec3", doc: "Current player velocity.", insert: "player.velocity" },
  { label: "player.health", kind: K.Property, detail: "number", doc: "Current health (0 – maxHealth).", insert: "player.health" },
  { label: "player.maxHealth", kind: K.Property, detail: "number", doc: "Maximum health (default 100).", insert: "player.maxHealth" },
  { label: "player.walkSpeed", kind: K.Property, detail: "number", doc: "Walk speed (default 6).", insert: "player.walkSpeed" },
  { label: "player.runSpeed", kind: K.Property, detail: "number", doc: "Run speed when Shift held (default 12).", insert: "player.runSpeed" },
  { label: "player.jumpPower", kind: K.Property, detail: "number", doc: "Jump force (default 8).", insert: "player.jumpPower" },
  { label: "player.size", kind: K.Property, detail: "number", doc: "Avatar size multiplier (default 1).", insert: "player.size" },
  { label: "player.killY", kind: K.Property, detail: "number", doc: "Auto-kill below this Y level (default -50).", insert: "player.killY" },
  { label: "player.autoFaceMovement", kind: K.Property, detail: "boolean", doc: "Auto-rotate player to face movement direction.", insert: "player.autoFaceMovement" },
  { label: "player.spawnPoint", kind: K.Property, detail: "Vec3", doc: "Position used when player respawns.", insert: "player.spawnPoint" },
  { label: "player.username", kind: K.Property, detail: "string (read-only)", doc: "Player's display name.", insert: "player.username" },
  { label: "player.onGround", kind: K.Property, detail: "boolean (read-only)", doc: "True while player is standing on a surface.", insert: "player.onGround" },
  {
    label: "player.takeDamage",
    kind: K.Function,
    detail: "player.takeDamage(amount: number) → void",
    doc: "Deal damage to the player. If health reaches 0, player dies and respawns.",
    insert: "player.takeDamage(${1:10})",
    snippet: true,
  },
  {
    label: "player.heal",
    kind: K.Function,
    detail: "player.heal(amount: number) → void",
    doc: "Restore player health (clamped to maxHealth).",
    insert: "player.heal(${1:20})",
    snippet: true,
  },
  {
    label: "player.kill",
    kind: K.Function,
    detail: "player.kill() → void",
    doc: "Instantly kill the player. Triggers ragdoll then respawn.",
    insert: "player.kill()",
    snippet: false,
  },
  {
    label: "player.respawn",
    kind: K.Function,
    detail: "player.respawn() → void",
    doc: "Respawn the player at player.spawnPoint.",
    insert: "player.respawn()",
    snippet: false,
  },
  {
    label: "player.teleport",
    kind: K.Function,
    detail: "player.teleport(x, y, z) → void",
    doc: "Teleport the player to an absolute world position.",
    insert: "player.teleport(${1:0}, ${2:5}, ${3:0})",
    snippet: true,
  },
  {
    label: "player.inventory",
    kind: K.Property,
    detail: "Inventory",
    doc: "Player inventory. Use .add(), .remove(), .has(), .get(), .equip(), .drop(), .clear().",
    insert: "player.inventory",
  },
  {
    label: "player.motors",
    kind: K.Property,
    detail: "MotorAPI",
    doc: "Attach/detach objects to player body slots: rightHand, leftHand, head, back, chest.",
    insert: "player.motors",
  },

  // ─── Player events ──────────────────────────────────────────────────────
  {
    label: "player.on",
    kind: K.Function,
    detail: "player.on(event, fn) → unsubscribe",
    doc: "Subscribe to a player event. The 'changed' event fires when any player property changes: (prop, newVal, oldVal) => { }.\nCustom events: any name you choose — pair with player.emit().\nReturns an unsubscribe function.",
    insert: "player.on(\"${1:changed}\", (${2:prop, newVal, oldVal}) => {\n\t${3}\n})",
    snippet: true,
  },
  {
    label: "player.off",
    kind: K.Function,
    detail: "player.off(event, fn) → void",
    doc: "Unsubscribe a handler from a player event.",
    insert: "player.off(\"${1:event}\", ${2:handler})",
    snippet: true,
  },
  {
    label: "player.emit",
    kind: K.Function,
    detail: "player.emit(event, ...args) → boolean",
    doc: "Fire a custom event on the player. All listeners registered with player.on(event) will be called.\n\nIMPORTANT: You cannot emit engine-reserved events ('changed'). Attempting to do so logs an error and returns false.\n\nReturns true on success, false if the event name is reserved.",
    insert: "player.emit(\"${1:myEvent}\", ${2})",
    snippet: true,
  },

  // ─── Object events ──────────────────────────────────────────────────────
  {
    label: "obj.on",
    kind: K.Function,
    detail: "obj.on(event, fn) → unsubscribe",
    doc: "Subscribe to an object event. Internal events: touched, untouched, touchStarted, touchEnded, clicked, destroyed, collisionStarted, collisionEnded, woke, slept.\nCustom events: any name you choose — pair with obj.emit().\nReturns an unsubscribe function.",
    insert: ".on(\"${1:touched}\", (${2:other}) => {\n\t${3}\n})",
    snippet: true,
  },
  {
    label: "obj.off",
    kind: K.Function,
    detail: "obj.off(event, fn) → void",
    doc: "Unsubscribe a handler from an object event.",
    insert: ".off(\"${1:event}\", ${2:handler})",
    snippet: true,
  },
  {
    label: "obj.emit",
    kind: K.Function,
    detail: "obj.emit(event, ...args) → boolean",
    doc: "Fire a custom event on this object. All listeners registered with obj.on(event) will be called.\n\nIMPORTANT: You cannot emit engine-internal events (touched, clicked, destroyed, etc.). Attempting to do so logs an error and returns false.\n\nReturns true on success, false if the event name is reserved.",
    insert: ".emit(\"${1:myEvent}\", ${2})",
    snippet: true,
  },

  // ─── Keyboard / mouse ────────────────────────────────────────────────────
  { label: "keyboard", kind: K.Variable, detail: "KeyboardAPI", doc: "Keyboard input API.", insert: "keyboard" },
  {
    label: "keyboard.onPress",
    kind: K.Function,
    detail: "keyboard.onPress(key, fn) → unsubscribe",
    doc: "Fire fn once each time the key is pressed down.\nKey names: letter keys ('a'-'z'), 'space', 'shift', 'control', 'alt', 'enter', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'.",
    insert: "keyboard.onPress(\"${1:e}\", () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "keyboard.onRelease",
    kind: K.Function,
    detail: "keyboard.onRelease(key, fn) → unsubscribe",
    doc: "Fire fn once each time the key is released.",
    insert: "keyboard.onRelease(\"${1:e}\", () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "keyboard.isDown",
    kind: K.Function,
    detail: "keyboard.isDown(key) → boolean",
    doc: "Returns true while the key is currently held down. Useful inside update loops.",
    insert: "keyboard.isDown(\"${1:w}\")",
    snippet: true,
  },
  { label: "mouse", kind: K.Variable, detail: "MouseAPI", doc: "Mouse input API.", insert: "mouse" },
  {
    label: "mouse.onClick",
    kind: K.Function,
    detail: "mouse.onClick(fn) → unsubscribe",
    doc: "Called on every 3D viewport click. Callback receives the clicked RuntimeObject or null (background).",
    insert: "mouse.onClick((obj) => {\n\tif (obj) {\n\t\t${1}\n\t}\n})",
    snippet: true,
  },
  { label: "onKey", kind: K.Function, detail: "onKey(key, fn) → unsubscribe", doc: "Shorthand for keyboard.onPress(key, fn).", insert: "onKey(\"${1:e}\", () => {\n\t${2}\n})", snippet: true },

  // ─── Timing ──────────────────────────────────────────────────────────────
  { label: "time", kind: K.Variable, detail: "number — seconds elapsed", doc: "Total game time elapsed since Play started, updated each frame.", insert: "time" },
  { label: "dt", kind: K.Variable, detail: "number — seconds since last frame", doc: "Delta time (seconds) since the previous frame. Use in update loops: pos += speed * dt.", insert: "dt" },
  { label: "now", kind: K.Function, detail: "now() → number", doc: "Returns current game time (same as the `time` global).", insert: "now()" },
  {
    label: "every",
    kind: K.Function,
    detail: "every(seconds, fn) → cancel()",
    doc: "Call fn repeatedly at the given interval (seconds). Returns a cancel function.",
    insert: "every(${1:1}, () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "after",
    kind: K.Function,
    detail: "after(seconds, fn) → cancel()",
    doc: "Call fn once after a delay (seconds). Returns a cancel function.",
    insert: "after(${1:2}, () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "wait",
    kind: K.Function,
    detail: "await wait(seconds) → Promise<void>",
    doc: "Pause async script execution for the given duration. Must be used with await inside an async context.",
    insert: "await wait(${1:1})",
    snippet: true,
  },
  {
    label: "onUpdate",
    kind: K.Function,
    detail: "onUpdate(fn) → unsubscribe",
    doc: "Shorthand for runService.update.on(fn). Runs fn every frame with (dt, time).",
    insert: "onUpdate((dt) => {\n\t${1}\n})",
    snippet: true,
  },

  // ─── runService ──────────────────────────────────────────────────────────
  { label: "runService", kind: K.Variable, detail: "RunServiceAPI", doc: "Game loop event channels. Phase order: input → animation → replication → physics → render → update.", insert: "runService" },
  {
    label: "runService.update.on",
    kind: K.Function,
    detail: "runService.update.on(fn) → unsubscribe",
    doc: "Run fn every frame (post-physics, pre-render). Receives (dt, time).",
    insert: "runService.update.on((dt) => {\n\t${1}\n})",
    snippet: true,
  },
  {
    label: "runService.physics.on",
    kind: K.Function,
    detail: "runService.physics.on(fn) → unsubscribe",
    doc: "Run fn during the physics step. Receives (dt, time).",
    insert: "runService.physics.on((dt) => {\n\t${1}\n})",
    snippet: true,
  },
  {
    label: "runService.render.on",
    kind: K.Function,
    detail: "runService.render.on(fn) → unsubscribe",
    doc: "Run fn just before rendering. Receives (dt, time).",
    insert: "runService.render.on((dt) => {\n\t${1}\n})",
    snippet: true,
  },

  // ─── World events ────────────────────────────────────────────────────────
  { label: "world", kind: K.Variable, detail: "WorldAPI", doc: "Global game-lifecycle events. Use world.on(event, fn) to listen.", insert: "world" },
  { 
    label: "world.on", 
    kind: K.Function, 
    detail: "world.on(event, fn) → unsubscribe", 
    doc: "Subscribe to world events.\n\nEvents:\n- 'playerSpawned' - (player) => {}\n- 'playerDied' - (player) => {}\n- 'objectAdded' - (obj) => {}\n- 'objectRemoved' - (obj) => {}\n\nReturns an unsubscribe function.", 
    insert: "world.on(\"${1|playerSpawned,playerDied,objectAdded,objectRemoved|}\", (${2:arg}) => {\n\t${3}\n})", 
    snippet: true 
  },
  { 
    label: "world.off", 
    kind: K.Function, 
    detail: "world.off(event, fn) → void", 
    doc: "Unsubscribe a handler from a world event.", 
    insert: "world.off(\"${1:event}\", ${2:handler})", 
    snippet: true 
  },

  // ─── Camera ──────────────────────────────────────────────────────────────
  { label: "camera", kind: K.Variable, detail: "RuntimeCamera", doc: "Camera settings. Modes: thirdPerson, firstPerson, scripted, free.", insert: "camera" },
  { label: "camera.mode", kind: K.Property, detail: "string", doc: "Camera mode: 'thirdPerson' (default), 'firstPerson', 'scripted', 'free'.", insert: "camera.mode" },
  { label: "camera.distance", kind: K.Property, detail: "number", doc: "Third-person distance from player (default 6).", insert: "camera.distance" },
  { label: "camera.fov", kind: K.Property, detail: "number (degrees)", doc: "Field of view in degrees (default 60).", insert: "camera.fov" },
  { label: "camera.sensitivity", kind: K.Property, detail: "number", doc: "Mouse sensitivity multiplier (default 1).", insert: "camera.sensitivity" },
  { label: "camera.offset", kind: K.Property, detail: "Vec3", doc: "Look-at offset relative to player feet.", insert: "camera.offset" },
  { label: "camera.position", kind: K.Property, detail: "Vec3", doc: "Camera world position (set in 'scripted' mode).", insert: "camera.position" },
  { label: "camera.lookAt", kind: K.Property, detail: "Vec3", doc: "Camera look-at target (set in 'scripted' mode).", insert: "camera.lookAt" },

  // ─── Physics ─────────────────────────────────────────────────────────────
  { label: "physics", kind: K.Variable, detail: "RuntimePhysics", doc: "Global physics settings.", insert: "physics" },
  { label: "physics.gravity", kind: K.Property, detail: "number (m/s²)", doc: "Global gravity (default 9.81). Set to 0 for zero-G.", insert: "physics.gravity" },
  { label: "physics.airDrag", kind: K.Property, detail: "number", doc: "Air resistance applied to unanchored objects (default 0).", insert: "physics.airDrag" },

  // ─── State ───────────────────────────────────────────────────────────────
  { label: "state", kind: K.Variable, detail: "RuntimeState", doc: "Global key-value store for game state. Supports reactive subscriptions.", insert: "state" },
  { label: "state.set", kind: K.Function, detail: "state.set(key, value) → void", doc: "Set a state value. Triggers listeners registered with state.on().", insert: "state.set(\"${1:key}\", ${2:value})", snippet: true },
  { label: "state.get", kind: K.Function, detail: "state.get(key) → any", doc: "Read a state value. Returns undefined if not set.", insert: "state.get(\"${1:key}\")", snippet: true },
  { label: "state.on", kind: K.Function, detail: "state.on(key, fn) → unsubscribe", doc: "Watch a state key for changes. fn(newValue, oldValue).", insert: "state.on(\"${1:key}\", (val) => {\n\t${2}\n})", snippet: true },
  { label: "state.keys", kind: K.Function, detail: "state.keys() → string[]", doc: "Returns all keys currently stored in state.", insert: "state.keys()" },
  { label: "state.getAll", kind: K.Function, detail: "state.getAll() → Record<string, any>", doc: "Returns a snapshot of all state values.", insert: "state.getAll()" },

  // ─── GUI ─────────────────────────────────────────────────────────────────
  { label: "gui", kind: K.Variable, detail: "GuiAPI", doc: "Script-driven HUD overlay. Elements are positioned with anchor + offset.", insert: "gui" },
  {
    label: "gui.text",
    kind: K.Function,
    detail: "gui.text(id, text, opts?) → void",
    doc: "Display a text element on screen.\n\nOpts: anchor ('tl','tc','tr','cl','cc','cr','bl','bc','br'), x, y (px offset), size (font size), color (hex), bg (background).",
    insert: "gui.text(\"${1:label}\", \"${2:Hello}\", { anchor: \"${3:tc}\", y: ${4:16}, size: ${5:18} })",
    snippet: true,
  },
  {
    label: "gui.button",
    kind: K.Function,
    detail: "gui.button(id, text, opts?, onClick?) → void",
    doc: "Create a clickable button on screen. onClick receives the game API.",
    insert: "gui.button(\"${1:btn}\", \"${2:Click me}\", { anchor: \"${3:br}\", x: 24, y: 24 }, () => {\n\t${4}\n})",
    snippet: true,
  },
  {
    label: "gui.clear",
    kind: K.Function,
    detail: "gui.clear(id?) → void",
    doc: "Remove a GUI element by id, or clear all elements if id is omitted.",
    insert: "gui.clear(${1})",
    snippet: true,
  },

  // ─── Tags ────────────────────────────────────────────────────────────────
  { label: "tags", kind: K.Variable, detail: "TagsAPI", doc: "Tag objects for group queries.", insert: "tags" },
  { label: "tags.add", kind: K.Function, detail: "tags.add(obj, tag) → void", doc: "Add a tag to an object.", insert: "tags.add(${1:obj}, \"${2:enemy}\")", snippet: true },
  { label: "tags.remove", kind: K.Function, detail: "tags.remove(obj, tag) → void", doc: "Remove a tag from an object.", insert: "tags.remove(${1:obj}, \"${2:tag}\")", snippet: true },
  { label: "tags.has", kind: K.Function, detail: "tags.has(obj, tag) → boolean", doc: "Check if an object has a tag.", insert: "tags.has(${1:obj}, \"${2:tag}\")", snippet: true },
  { label: "tags.get", kind: K.Function, detail: "tags.get(tag) → RuntimeObject[]", doc: "Return all objects with the given tag.", insert: "tags.get(\"${1:enemy}\")", snippet: true },
  { label: "tags.all", kind: K.Function, detail: "tags.all(obj) → string[]", doc: "Return all tags on an object.", insert: "tags.all(${1:obj})", snippet: true },

  // ─── Math ────────────────────────────────────────────────────────────────
  { label: "random", kind: K.Function, detail: "random(min, max) → number", doc: "Random float between min (inclusive) and max (exclusive).", insert: "random(${1:0}, ${2:10})", snippet: true },
  { label: "randInt", kind: K.Function, detail: "randInt(min, max) → number", doc: "Random integer between min and max (inclusive).", insert: "randInt(${1:1}, ${2:6})", snippet: true },
  { label: "pick", kind: K.Function, detail: "pick(arr) → T", doc: "Pick a random element from an array.", insert: "pick([${1}])", snippet: true },
  { label: "dist", kind: K.Function, detail: "dist(a, b) → number", doc: "Distance between two Vec3 objects or RuntimeObjects.", insert: "dist(${1:a}, ${2:b})", snippet: true },
  { label: "lerp", kind: K.Function, detail: "lerp(a, b, t) → number", doc: "Linear interpolation between a and b by factor t (0–1).", insert: "lerp(${1:0}, ${2:100}, ${3:0.5})", snippet: true },
  { label: "clamp", kind: K.Function, detail: "clamp(n, min, max) → number", doc: "Clamp n between min and max.", insert: "clamp(${1:n}, ${2:0}, ${3:1})", snippet: true },

  // ─── Raycasting ──────────────────────────────────────────────────────────
  {
    label: "raycast",
    kind: K.Function,
    detail: "raycast(origin, direction, maxDist?, params?) → RaycastResult | null",
    doc: "Cast a ray. Returns { object, distance, point, normal } or null.\n\nParams: { ignore: RuntimeObject[], filter: (o) => boolean, maxDistance: number }",
    insert: "raycast(\n\tplayer.position,\n\t{ x: 0, y: -1, z: 0 },\n\t${1:50}\n)",
    snippet: true,
  },

  // ─── Tweens ──────────────────────────────────────────────────────────────
  {
    label: "tween",
    kind: K.Function,
    detail: "tween(target, to, duration, easing?, onDone?) → cancel()",
    doc: "Smoothly animate any numeric properties on target over duration (seconds).\n\nEasing: 'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic'.",
    insert: "tween(${1:obj}.position, { x: ${2:10} }, ${3:1}, \"${4:easeOutQuad}\")",
    snippet: true,
  },

  // ─── Networking ──────────────────────────────────────────────────────────
  { label: "network", kind: K.Variable, detail: "NetworkAPI", doc: "Real-time networking API for multiplayer. Uses server/client channels.", insert: "network" },
  { label: "network.server.broadcast", kind: K.Function, detail: "network.server.broadcast(channel, payload)", doc: "Send a message from server to all connected clients.", insert: "network.server.broadcast(\"${1:channel}\", ${2:payload})", snippet: true },
  { label: "network.server.on", kind: K.Function, detail: "network.server.on(channel, fn) → unsubscribe", doc: "Listen for client messages on the server.", insert: "network.server.on(\"${1:channel}\", (payload) => {\n\t${2}\n})", snippet: true },
  { label: "network.client.send", kind: K.Function, detail: "network.client.send(channel, payload)", doc: "Send a message from client to server.", insert: "network.client.send(\"${1:channel}\", ${2:payload})", snippet: true },
  { label: "network.client.on", kind: K.Function, detail: "network.client.on(channel, fn) → unsubscribe", doc: "Listen for server messages on the client.", insert: "network.client.on(\"${1:channel}\", (payload) => {\n\t${2}\n})", snippet: true },

  // ─── Modules ─────────────────────────────────────────────────────────────
  { label: "require", kind: K.Function, detail: "require(moduleName) → any", doc: "Load a ModuleScript from ReplicatedStorage by name. Returns the module's exports.", insert: "require(\"${1:MyModule}\")", snippet: true },
  { label: "exports", kind: K.Variable, detail: "any", doc: "In a ModuleScript — use this object to expose your public API.", insert: "exports" },

  // ─── Debug ───────────────────────────────────────────────────────────────
  { label: "log", kind: K.Function, detail: "log(...args) → void", doc: "Print a message to the in-game console. Supports multiple arguments.", insert: "log(${1})", snippet: true },
  { label: "debug", kind: K.Variable, detail: "DebugAPI", doc: "Advanced debugging utilities.", insert: "debug" },
  { label: "debug.getChildren", kind: K.Function, detail: "debug.getChildren(obj) → RuntimeObject[]", doc: "Get direct children of an object.", insert: "debug.getChildren(${1:obj})", snippet: true },
  { label: "debug.getDescendants", kind: K.Function, detail: "debug.getDescendants(obj) → RuntimeObject[]", doc: "Get all descendants of an object recursively.", insert: "debug.getDescendants(${1:obj})", snippet: true },
  { label: "debug.getFullName", kind: K.Function, detail: "debug.getFullName(obj) → string", doc: "Get the full dotted path of an object (e.g. 'Workspace.Platform.Coin').", insert: "debug.getFullName(${1:obj})", snippet: true },

  // ─── Tasks ───────────────────────────────────────────────────────────────
  { label: "task", kind: K.Variable, detail: "TaskAPI", doc: "Coroutine-style task scheduling.", insert: "task" },
  { label: "task.spawn", kind: K.Function, detail: "task.spawn(fn, ...args)", doc: "Run fn in a new concurrent task (doesn't block current script).", insert: "task.spawn(() => {\n\t${1}\n})", snippet: true },
  { label: "task.delay", kind: K.Function, detail: "task.delay(seconds, fn)", doc: "Run fn after a delay without blocking the current script.", insert: "task.delay(${1:1}, () => {\n\t${2}\n})", snippet: true },
  { label: "task.wait", kind: K.Function, detail: "await task.wait(seconds)", doc: "Async wait — same as await wait().", insert: "await task.wait(${1:1})", snippet: true },

  // ─── Inventory ───────────────────────────────────────────────────────────
  {
    label: "player.inventory.add",
    kind: K.Function,
    detail: "inventory.add(name, opts?) → InventoryItem | null",
    doc: "Add items to the player's inventory.\n\nOpts: { count?: number, template?: string, data?: Record<string, any> }\n\nReturns null if inventory is full.",
    insert: "player.inventory.add(\"${1:Item}\")",
    snippet: true,
  },
  { label: "player.inventory.remove", kind: K.Function, detail: "inventory.remove(name, count?)", doc: "Remove items from inventory. Returns number removed.", insert: "player.inventory.remove(\"${1:Item}\")", snippet: true },
  { label: "player.inventory.has", kind: K.Function, detail: "inventory.has(name, count?) → boolean", doc: "Check if inventory contains at least count of item.", insert: "player.inventory.has(\"${1:Item}\")", snippet: true },
  { label: "player.inventory.get", kind: K.Function, detail: "inventory.get(name) → InventoryItem | null", doc: "Get an item from inventory by name.", insert: "player.inventory.get(\"${1:Item}\")", snippet: true },
  { label: "player.inventory.equip", kind: K.Function, detail: "inventory.equip(name | null)", doc: "Equip an item (or pass null to unequip).", insert: "player.inventory.equip(\"${1:Item}\")", snippet: true },
  { label: "player.inventory.drop", kind: K.Function, detail: "inventory.drop(name, count?) → RuntimeObject | null", doc: "Drop items in front of player. Spawns from ReplicatedStorage template if available.", insert: "player.inventory.drop(\"${1:Item}\")", snippet: true },
  { label: "player.inventory.clear", kind: K.Function, detail: "inventory.clear()", doc: "Remove all items from inventory.", insert: "player.inventory.clear()" },
  { label: "player.inventory.items", kind: K.Property, detail: "InventoryItem[]", doc: "Array of all items in inventory.", insert: "player.inventory.items" },
  { label: "player.inventory.equipped", kind: K.Property, detail: "InventoryItem | null", doc: "Currently equipped item, or null.", insert: "player.inventory.equipped" },
  { label: "player.inventory.maxSlots", kind: K.Property, detail: "number", doc: "Maximum inventory capacity (default 32).", insert: "player.inventory.maxSlots" },

  // ─── Motors ──────────────────────────────────────────────────────────────
  {
    label: "player.motors.attach",
    kind: K.Function,
    detail: "motors.attach(slot, obj, offset?, rotation?)",
    doc: "Attach an object to a player body slot.\nSlots: 'rightHand', 'leftHand', 'head', 'back', 'chest'",
    insert: "player.motors.attach(\"${1:rightHand}\", ${2:obj})",
    snippet: true,
  },
  { label: "player.motors.detach", kind: K.Function, detail: "motors.detach(slot) → RuntimeObject | null", doc: "Detach the object in a body slot. Returns the detached object.", insert: "player.motors.detach(\"${1:rightHand}\")", snippet: true },
  { label: "player.motors.get", kind: K.Function, detail: "motors.get(slot) → RuntimeObject | null", doc: "Get the object currently attached to a body slot.", insert: "player.motors.get(\"${1:rightHand}\")", snippet: true },

  // ─── Classes ─────────────────────────────────────────────────────────────
  {
    label: "Emitter",
    kind: K.Module,
    detail: "class Emitter<T>",
    doc: "Custom typed event emitter.\n\nUsage:\nconst bus = new Emitter();\nbus.on('event', fn);\nbus.emit('event', ...args);",
    insert: "new Emitter()",
  },
  {
    label: "Class",
    kind: K.Module,
    detail: "Class(name, base?) → constructor",
    doc: "OOP class builder for engine-style inheritance.\n\nUsage:\nconst Enemy = Class('Enemy');\nEnemy.prototype.construct = function() { this.hp = 100; };\nconst e = new Enemy();",
    insert: "Class(\"${1:MyClass}\")",
    snippet: true,
  },
  {
    label: "weakRef",
    kind: K.Function,
    detail: "weakRef(obj) → { deref() }",
    doc: "Create a weak reference to an object. The reference does not prevent garbage collection.\n\nUsage:\nconst ref = weakRef(obj);\nconst alive = ref.deref(); // returns obj or undefined",
    insert: "weakRef(${1:obj})",
    snippet: true,
  },
  {
    label: "WeakTable",
    kind: K.Module,
    detail: "class WeakTable<K, V>",
    doc: "Map keyed by weak references — entries disappear automatically when keys are garbage collected.\n\nUsage:\nconst meta = new WeakTable();\nmeta.set(obj, { data: 123 });\nmeta.get(obj); // { data: 123 } or undefined",
    insert: "new WeakTable()",
  },
  {
    label: "Callable",
    kind: K.Module,
    detail: "Callable(fn?) → callable",
    doc: "Create a function-like value that can be invoked and has methods.\n\nUsage:\nconst c = Callable();\nc.setHandler((x) => x * 2);\nc(5); // 10",
    insert: "Callable()",
  },
];

/** Custom dark theme — keep the exact same look */
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
 * Configure Monaco for the engine editor.
 * - Kills ALL built-in JS/TS IntelliSense
 * - Registers our own completion + hover providers
 */
export function configureMonacoForEngine(monaco: typeof Monaco): void {
  // Register theme
  monaco.editor.defineTheme("engine-dark", ENGINE_EDITOR_THEME);

  // ── DISABLE built-in TypeScript/JavaScript completions ──────────────────
  // Turn off the TS language service entirely for JS
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,   // no red squiggles from TS inference
    noSyntaxValidation: false,    // keep syntax errors (missing bracket etc.)
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    noLib: true, // DO NOT include standard lib — kills built-in completions
    module: monaco.languages.typescript.ModuleKind.None,
    noEmit: true,
  });

  // Add our type definitions only for hover (not for inference — noLib: true)
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    ENGINE_TYPE_DEFS,
    "ts:engine.d.ts"
  );

  // ── CUSTOM completion provider ────────────────────────────────────────────
  const InsertAsSnippet = 4 as Monaco.languages.CompletionItemInsertTextRule;

  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: [".", " ", "(", '"', "'"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const word = model.getWordUntilPosition(position);
      const charBefore = line[position.column - 2] ?? "";

      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Build context-aware suggestions
      const suggestions: Monaco.languages.CompletionItem[] = [];

      for (const item of COMPLETIONS) {
        // For dotted completions (e.g. "player.health"), only offer if the
        // prefix before the dot matches, OR if the user typed the label start.
        const isDotted = item.label.includes(".");

        if (isDotted) {
          const [prefix] = item.label.split(".");
          // Show dotted members if cursor is after a dot and the text before
          // the dot ends with our prefix, OR always as a global completion.
          const textBefore = line.slice(0, position.column - 1);
          const afterDot = charBefore === ".";

          if (afterDot) {
            // Check if the thing before the dot is our prefix
            if (!textBefore.trimEnd().endsWith(prefix)) {
              // Still add if label starts with what user typed
              if (!item.label.startsWith(word.word) && word.word.length > 0) continue;
            }
          }
        }

        suggestions.push({
          label: item.label,
          kind: item.kind as Monaco.languages.CompletionItemKind,
          detail: item.detail,
          documentation: { value: item.doc },
          insertText: item.insert,
          insertTextRules: item.snippet ? InsertAsSnippet : undefined,
          range,
          sortText: isDotted ? "b" + item.label : "a" + item.label,
        });
      }

      return { suggestions, incomplete: false };
    },
  });

  // ── HOVER documentation provider ─────────────────────────────────────────
  monaco.languages.registerHoverProvider("javascript", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const found = COMPLETIONS.find(
        (i) => i.label === word.word || i.label.endsWith("." + word.word)
      );
      if (!found) return null;

      return {
        contents: [
          { value: `**${found.label}** — ${found.detail}` },
          { value: found.doc },
        ],
      };
    },
  });
}

/**
 * Default Monaco editor options that disable ALL built-in suggestion triggers.
 * Merge these into the MonacoEditor options prop.
 */
export const ENGINE_EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: "engine-dark",
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  fontLigatures: true,
  lineNumbers: "on",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  tabSize: 2,
  insertSpaces: true,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: "line",
  // ── kill built-in autocomplete triggers ──
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on",
  parameterHints: { enabled: false }, // no signature popup
  // ── keep these on ──
  formatOnPaste: false,
  formatOnType: false,
  tabCompletion: "off",
  folding: true,
  foldingHighlight: true,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
};

// Legacy export for compat with older Editor.tsx imports
export const AUTOCOMPLETE_ITEMS = COMPLETIONS;
