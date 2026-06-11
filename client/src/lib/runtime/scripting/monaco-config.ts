/**
 * Monaco Editor Configuration for Rebur Engine Scripts
 *
 * - Disables Monaco's built-in TypeScript/JavaScript IntelliSense
 * - Registers a fully custom completion provider for the Rebur API
 * - Registers hover documentation
 * - Keeps the custom dark theme and syntax highlighting unchanged
 *
 * API design:
 *   - Rebur is the ONLY global — all subsystems hang off it
 *   - Entities (including players) share one base API
 *   - Single access pattern: Rebur.Workspace.find("name")
 *   - Force-based physics via entity.body.*
 *   - Consistent camelCase everywhere
 */

import type * as Monaco from "monaco-editor";

export const ENGINE_TYPE_DEFS = `
// =============================================================================
// REBUR ENGINE — TYPE DEFINITIONS (hover documentation only)
// =============================================================================

interface Vec3 { x: number; y: number; z: number; }

// ─── Physics body ─────────────────────────────────────────────────────────────
interface EntityBody {
  anchored: boolean;
  canCollide: boolean;
  mass: number;
  friction: number;
  restitution: number;
  isKinematic: boolean;
  isTrigger: boolean;
  readonly velocity: Vec3;
  applyForce(force: Vec3): void;
  applyImpulse(impulse: Vec3): void;
  setVelocity(v: Vec3): void;
}

// ─── Base entity ──────────────────────────────────────────────────────────────
interface Entity {
  readonly id: string;
  name: string;
  readonly type: string;
  readonly isPlayer: boolean;
  /** True once destroy() has been called. Methods on a destroyed entity are no-ops. */
  readonly destroyed: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  /** Current HP (0–maxHealth). Setting to 0 fires "died" and destroys (if autoDestroy). */
  health: number;
  /** Max HP (default 100). */
  maxHealth: number;
  /** If true (default) entity is destroyed when health hits 0. */
  autoDestroy: boolean;
  /** Deal damage — reduces health by amount; fires "died" + destroys if health hits 0. */
  takeDamage(amount: number): void;
  /** Restore health by amount, capped at maxHealth. */
  heal(amount: number): void;
  /** When true, pressing E near this entity fires the "interact" event. */
  interactionEnabled: boolean;
  /** Max distance in units for E-key prompt (default 3). */
  interactionDistance: number;
  /** Hint text shown near the entity (default "Press E to interact"). */
  interactionHint: string;
  readonly body: EntityBody;
  readonly parent: Entity | null;
  readonly children: Entity[];
  find(name: string): Entity | null;
  setParent(parent: Entity | null): void;
  destroy(): void;
  on(event: string, fn: (...args: any[]) => void): () => void;
  off(event: string, fn: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
  setAttribute(key: string, value: any): void;
  getAttribute(key: string): any;
}

// ─── Player entity (extends Entity) ──────────────────────────────────────────
interface PlayerEntity extends Entity {
  readonly isPlayer: true;
  readonly username: string;
  health: number;
  maxHealth: number;
  walkSpeed: number;
  runSpeed: number;
  jumpPower: number;
  spawnPoint: Vec3;
  /** Set to true to trigger immediate respawn to spawnPoint. */
  respawn: boolean;
  /** When true, built-in physics is skipped; scripts fully control position/velocity. */
  isKinematic: boolean;
  readonly inventory: Inventory;
  readonly gui: PlayerGuiAPI;
  readonly data: PlayerDataAPI;
  readonly animator: AnimatorAPI;
  motors: MotorAPI;
}

interface Inventory {
  items: InventoryItem[];
  maxSlots: number;
  equipped: InventoryItem | null;
  add(name: string, opts?: { count?: number; data?: Record<string, any> }): InventoryItem | null;
  remove(name: string, count?: number): number;
  has(name: string, count?: number): boolean;
  get(name: string): InventoryItem | null;
  equip(name: string | null): boolean;
  drop(name: string, count?: number): Entity | null;
  clear(): void;
}

interface InventoryItem { id: string; name: string; count: number; data: Record<string, any>; }

interface MotorAPI {
  attach(slot: string, entity: Entity, offset?: Vec3, rotation?: Vec3): void;
  detach(slot: string): Entity | null;
  get(slot: string): Entity | null;
}

// ─── Per-player GUI ───────────────────────────────────────────────────────────
interface PlayerGuiAPI {
  text(id: string, text: string, opts?: GuiOpts): void;
  button(id: string, text: string, opts?: GuiOpts, onClick?: () => void): void;
  bar(id: string, value: number, maxValue: number, opts?: GuiOpts): void;
  image(id: string, url: string, opts?: GuiOpts): void;
  clear(id?: string): void;
}

// ─── Per-player persistent data ──────────────────────────────────────────────
interface PlayerDataAPI {
  get(key: string): any;
  set(key: string, value: any): void;
  delete(key: string): void;
  increment(key: string, amount?: number): number;
  getAll(): Record<string, any>;
}

// ─── Animator ─────────────────────────────────────────────────────────────────
interface AnimatorAPI {
  readonly current: string | null;
  readonly playing: boolean;
  play(name: string, opts?: { blend?: number; loop?: boolean }): void;
  stop(): void;
  on(event: 'done', fn: (name: string) => void): () => void;
}

// ─── Raycast ──────────────────────────────────────────────────────────────────
interface RaycastResult {
  entity: Entity;
  point: Vec3;
  normal: Vec3;
  distance: number;
}

interface SceneQueryFilter {
  tag?: string;
  tags?: string[];
  type?: string;
  limit?: number;
  where?: (entity: Entity) => boolean;
}

// ─── Rebur subsystems ─────────────────────────────────────────────────────────
interface SceneContainer {
  find(name: string): Entity | null;
  get(id: string): Entity | null;
  all(): Entity[];
  query(filter: SceneQueryFilter): Entity[];
  raycast(origin: Vec3, direction: Vec3, opts?: { maxDistance?: number; ignore?: Entity[]; tag?: string }): RaycastResult | null;
  create(opts: {
    name?: string;
    primitiveType?: 'cube' | 'sphere' | 'cylinder' | 'plane';
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    color?: string;
  }): Entity;
}

interface PlayersContainer {
  all(): PlayerEntity[];
  find(username: string): PlayerEntity | null;
  get(id: string): PlayerEntity | null;
}

interface StateAPI {
  set(key: string, value: any): void;
  get(key: string): any;
  on(key: string, fn: (newVal: any, oldVal: any) => void): () => void;
  keys(): string[];
  getAll(): Record<string, any>;
}

interface GuiAPI {
  text(id: string, text: string, opts?: GuiOpts): void;
  button(id: string, text: string, opts?: GuiOpts, onClick?: () => void): void;
  bar(id: string, value: number, maxValue: number, opts?: GuiOpts): void;
  image(id: string, url: string, opts?: GuiOpts): void;
  clear(id?: string): void;
}

interface GuiOpts {
  anchor?: 'tl'|'tc'|'tr'|'cl'|'cc'|'cr'|'bl'|'bc'|'br';
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  bg?: string;
  width?: number;
  height?: number;
}

interface SoundAPI {
  play(id: string, opts?: { volume?: number; loop?: boolean }): void;
  stop(id: string): void;
}

interface TagsAPI {
  add(entity: Entity, tag: string): void;
  remove(entity: Entity, tag: string): void;
  has(entity: Entity, tag: string): boolean;
  get(tag: string): Entity[];
  all(entity: Entity): string[];
}

interface DataStoreAPI {
  get(key: string): any;
  set(key: string, value: any): void;
  delete(key: string): void;
  increment(key: string, amount?: number): number;
  keys(): string[];
}

interface PhysicsAPI { gravity: number; airDrag: number; }

interface CameraAPI {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  [key: string]: any;
}

interface InputAPI {
  /** Subscribe to key / mouse events. Events: "press", "release", "mouseClick".
   *  - "press"      → fn(player, key)
   *  - "release"    → fn(player, key)
   *  - "mouseClick" → fn(player, entity | null)
   */
  on(event: 'press' | 'release' | 'mouseClick', fn: (...args: any[]) => void): () => void;
  off(event: string, fn: any): void;
}

interface RunServiceAPI {
  on(phase: 'input'|'animation'|'replication'|'physics'|'render'|'update', fn: (dt: number) => void): () => void;
  off(phase: string, fn: any): void;
}

interface NetworkAPI {
  /** SERVER — send a message to all connected clients. */
  send(channel: string, payload: any): void;
  /** SERVER — send a message to a specific player only. */
  sendTo(player: PlayerEntity, channel: string, payload: any): void;
  /** SERVER/CLIENT — listen for incoming messages. Server: fn(payload, sender). Client: fn(payload). */
  on(channel: string, fn: (payload: any, sender?: PlayerEntity) => void): () => void;
  off(channel: string, fn: any): void;
}

interface TweenFn {
  (target: any, to: Record<string, any>, duration: number, easing?: string, onDone?: () => void): () => void;
}

interface AssetsSharedAPI extends SceneContainer {}
interface AssetsServerAPI extends SceneContainer {}
interface AssetsContainer {
  readonly Shared: AssetsSharedAPI;
  readonly Server: AssetsServerAPI;
}

// ─── Root global ──────────────────────────────────────────────────────────────
interface ReburAPI {
  readonly Workspace: SceneContainer;
  readonly Lighting: SceneContainer;
  readonly Assets: AssetsContainer;
  readonly Players: PlayersContainer;
  readonly State: StateAPI;
  readonly DataStore: DataStoreAPI;
  readonly Gui: GuiAPI;
  readonly Sound: SoundAPI;
  readonly Tags: TagsAPI;
  readonly Physics: PhysicsAPI;
  readonly Camera: CameraAPI;
  readonly Input: InputAPI;
  readonly RunService: RunServiceAPI;
  readonly Network: NetworkAPI;
  readonly Tween: TweenFn;
  on(event: 'tick', fn: (dt: number) => void): () => void;
  on(event: 'playerJoined' | 'playerLeft' | 'playerDied' | 'playerRespawned', fn: (player: PlayerEntity) => void): () => void;
  on(event: 'entityAdded' | 'entityRemoved', fn: (entity: Entity) => void): () => void;
  off(event: string, fn: any): void;
}

declare const Rebur: ReburAPI;
`;

type CompletionDef = {
  label: string;
  kind: number;
  detail: string;
  doc: string;
  insert: string;
  snippet?: boolean;
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
  // ─── Root global ─────────────────────────────────────────────────────────
  {
    label: "Rebur",
    kind: K.Variable,
    detail: "ReburAPI — the only global",
    doc: "The single global entry point for the Rebur engine. All subsystems hang off it:\n\n- Rebur.Workspace — live 3D entity container (rendered + simulated)\n- Rebur.Lighting — lighting entity container\n- Rebur.Assets.Shared — shared templates visible to all clients\n- Rebur.Assets.Server — server-only storage, never replicated to clients\n- Rebur.Players — player entity container\n- Rebur.State — shared key-value store (session)\n- Rebur.DataStore — persistent cross-session storage\n- Rebur.Gui — HUD overlay\n- Rebur.Sound — audio\n- Rebur.Tween — property animation\n- Rebur.Camera — camera control\n- Rebur.Input — keyboard & mouse\n- Rebur.Physics — global physics settings\n- Rebur.RunService — game loop phases\n- Rebur.Network — multiplayer messaging\n- Rebur.Tags — entity tag queries",
    insert: "Rebur",
  },

  // ─── Rebur.on ────────────────────────────────────────────────────────────
  {
    label: "Rebur.on",
    kind: K.Function,
    detail: "Rebur.on(event, fn) → unsubscribe",
    doc: "Subscribe to a global engine event. Returns an unsubscribe function.\n\nEvents:\n- 'tick' — (dt) — every physics step ~20 Hz\n- 'playerJoined' — (player) — player connected\n- 'playerLeft' — (player) — player disconnected\n- 'playerDied' — (player) — health reached 0\n- 'playerRespawned' — (player) — after respawn\n- 'entityAdded' — (entity) — any entity added\n- 'entityRemoved' — (entity) — any entity removed",
    insert: "Rebur.on(\"${1|tick,playerJoined,playerLeft,playerDied,playerRespawned,entityAdded,entityRemoved|}\", (${2:arg}) => {\n\t${3}\n})",
    snippet: true,
  },
  {
    label: "Rebur.off",
    kind: K.Function,
    detail: "Rebur.off(event, fn) → void",
    doc: "Unsubscribe a handler from a global event.",
    insert: "Rebur.off(\"${1:event}\", ${2:handler})",
    snippet: true,
  },

  // ─── Rebur.Workspace ─────────────────────────────────────────────────────────
  {
    label: "Rebur.Workspace",
    kind: K.Variable,
    detail: "SceneContainer — live 3D world",
    doc: "The live 3D world container. All rendered and simulated entities live here.\n\nMethods:\n- find(name) — look up entity by name\n- get(id) — look up by immutable id\n- all() — all entities in the scene\n- create(opts) — spawn a new entity at runtime",
    insert: "Rebur.Workspace",
  },
  {
    label: "Rebur.Workspace.find",
    kind: K.Function,
    detail: "Rebur.Workspace.find(name) → Entity | null",
    doc: "Look up an entity by name. Returns null if not found — always guard the result.\n\nExample:\n  const part = Rebur.Workspace.find(\"Platform\");\n  if (!part) return;\n  part.position = { x: 0, y: 5, z: 0 };",
    insert: "Rebur.Workspace.find(\"${1:Name}\")",
    snippet: true,
  },
  {
    label: "Rebur.Workspace.get",
    kind: K.Function,
    detail: "Rebur.Workspace.get(id) → Entity | null",
    doc: "Look up an entity by its immutable id. Safer than find() for long-lived references since names can change.",
    insert: "Rebur.Workspace.get(\"${1:id}\")",
    snippet: true,
  },
  {
    label: "Rebur.Workspace.all",
    kind: K.Function,
    detail: "Rebur.Workspace.all() → Entity[]",
    doc: "Return all entities currently in the scene.",
    insert: "Rebur.Workspace.all()",
  },
  {
    label: "Rebur.Workspace.query",
    kind: K.Function,
    detail: "Rebur.Workspace.query(filter) → Entity[]",
    doc: "Filter entities by criteria. More efficient than all().filter() for large worlds.\n\nFilter options:\n- tag: string — entities with this tag\n- tags: string[] — entities with ALL these tags\n- type: string — 'primitive', 'model', 'light', 'audio'\n- limit: number — max results\n- where: (entity) => boolean — custom predicate\n\nExamples:\n  Rebur.Workspace.query({ tag: \"enemy\" })\n  Rebur.Workspace.query({ type: \"light\" })\n  Rebur.Workspace.query({ tag: \"coin\", limit: 5 })\n  Rebur.Workspace.query({ where: (e) => e.body.mass > 10 })",
    insert: "Rebur.Workspace.query({ tag: \"${1:enemy}\" })",
    snippet: true,
  },
  {
    label: "Rebur.Workspace.raycast",
    kind: K.Function,
    detail: "Rebur.Workspace.raycast(origin, direction, opts?) → RaycastResult | null",
    doc: "Cast a ray and return the first entity hit.\n\nReturns: { entity, point, normal, distance } or null if nothing hit.\n\nOpts:\n- maxDistance: number (default 500)\n- ignore: Entity[] — skip these entities\n- tag: string — only hit entities with this tag\n\nExample:\n  const hit = Rebur.Workspace.raycast(\n    player.position,\n    { x: 0, y: 0, z: -1 },\n    { maxDistance: 30, ignore: [player] }\n  );\n  if (hit) log(hit.entity.name, hit.distance);",
    insert: "Rebur.Workspace.raycast(\n\t${1:origin},\n\t${2:direction},\n\t{ maxDistance: ${3:50} }\n)",
    snippet: true,
  },
  {
    label: "Rebur.Workspace.create",
    kind: K.Function,
    detail: "Rebur.Workspace.create(opts) → Entity",
    doc: "Spawn a new entity at runtime. Returns the entity.\n\nOpts:\n- name?: string\n- primitiveType?: 'cube'|'sphere'|'cylinder'|'plane'\n- position?: { x, y, z }\n- rotation?: { x, y, z }\n- scale?: { x, y, z }\n- color?: string\n\nNote: Runtime entities are not saved — they exist only for the current session.",
    insert: "Rebur.Workspace.create({\n\tname: \"${1:Part}\",\n\tprimitiveType: \"${2:cube}\",\n\tposition: { x: ${3:0}, y: ${4:1}, z: ${5:0} },\n\tcolor: \"${6:#88aaff}\",\n})",
    snippet: true,
  },

  // ─── Rebur.Lighting ──────────────────────────────────────────────────────
  {
    label: "Rebur.Lighting",
    kind: K.Variable,
    detail: "LightingContainer — query lights + world settings",
    doc: "Query API for entities in the Lighting container, plus world environment settings (sky, fog, ambient, sun).\n\nEntity methods:\n- find(name) — look up a light entity by name\n- get(id) — look up by immutable id\n- all() — all light entities\n\nWorld settings (same store as Rebur.World):\n- skyColor, fogColor, fogDensity, fogNear, fogFar\n- ambientColor, ambientIntensity\n- sunColor, sunIntensity, sunDirection\n- shadowsEnabled, timeOfDay",
    insert: "Rebur.Lighting",
  },
  {
    label: "Rebur.Lighting.find",
    kind: K.Function,
    detail: "Rebur.Lighting.find(name) → Entity | null",
    doc: "Look up a light entity by name.",
    insert: "Rebur.Lighting.find(\"${1:Name}\")",
    snippet: true,
  },
  {
    label: "Rebur.Lighting.all",
    kind: K.Function,
    detail: "Rebur.Lighting.all() → Entity[]",
    doc: "Return all entities in the Lighting container.",
    insert: "Rebur.Lighting.all()",
  },
  {
    label: "Rebur.Lighting.skyColor",
    kind: K.Property,
    detail: "string (CSS color)",
    doc: "Background sky color. Same property as Rebur.World.skyColor.\n\nExample:\n  Rebur.Lighting.skyColor = \"#1a1a2e\"; // dark night sky",
    insert: "Rebur.Lighting.skyColor",
  },
  {
    label: "Rebur.Lighting.fogColor",
    kind: K.Property,
    detail: "string | null",
    doc: "Fog color. Set to null to disable fog. Defaults to null (no fog).\n\nExample:\n  Rebur.Lighting.fogColor = \"#cccccc\";\n  Rebur.Lighting.fogDensity = 0.02;",
    insert: "Rebur.Lighting.fogColor",
  },
  {
    label: "Rebur.Lighting.fogDensity",
    kind: K.Property,
    detail: "number (0 = off)",
    doc: "Exponential fog density. 0 = no fog. Typical values 0.01–0.05.\n\nExample:\n  Rebur.Lighting.fogDensity = 0.02;",
    insert: "Rebur.Lighting.fogDensity",
  },
  {
    label: "Rebur.Lighting.ambientColor",
    kind: K.Property,
    detail: "string (CSS color)",
    doc: "Ambient light color (fills shadows). Default \"#404040\".\n\nExample:\n  Rebur.Lighting.ambientColor = \"#334455\";",
    insert: "Rebur.Lighting.ambientColor",
  },
  {
    label: "Rebur.Lighting.ambientIntensity",
    kind: K.Property,
    detail: "number (default 0.5)",
    doc: "Ambient light intensity multiplier. Default 0.5.",
    insert: "Rebur.Lighting.ambientIntensity",
  },
  {
    label: "Rebur.Lighting.sunColor",
    kind: K.Property,
    detail: "string (CSS color)",
    doc: "Directional sun light color. Default \"#ffffff\".",
    insert: "Rebur.Lighting.sunColor",
  },
  {
    label: "Rebur.Lighting.sunIntensity",
    kind: K.Property,
    detail: "number (default 1)",
    doc: "Directional sun light intensity. Default 1.",
    insert: "Rebur.Lighting.sunIntensity",
  },
  {
    label: "Rebur.Lighting.timeOfDay",
    kind: K.Property,
    detail: "number (0–24)",
    doc: "Time of day in 24-hour notation. 6 = dawn, 12 = noon, 18 = dusk, 0/24 = midnight.\n\nExample:\n  Rebur.Lighting.timeOfDay = 18; // sunset",
    insert: "Rebur.Lighting.timeOfDay",
  },
  {
    label: "Rebur.Lighting.shadowsEnabled",
    kind: K.Property,
    detail: "boolean (default true)",
    doc: "Enable or disable shadow rendering from the sun.\n\nExample:\n  Rebur.Lighting.shadowsEnabled = false; // disable for performance",
    insert: "Rebur.Lighting.shadowsEnabled",
  },

  // ─── Rebur.Assets ────────────────────────────────────────────────────────
  {
    label: "Rebur.Assets",
    kind: K.Variable,
    detail: "AssetsContainer — { Shared, Server }",
    doc: "The Assets namespace groups reusable game content into two sub-containers:\n\n- Rebur.Assets.Shared — replicated to all clients (models, audio, textures, animations)\n- Rebur.Assets.Server — server-only assets, never sent to clients",
    insert: "Rebur.Assets",
  },
  {
    label: "Rebur.Assets.Shared",
    kind: K.Variable,
    detail: "AssetsSharedAPI — shared templates (visible to all clients)",
    doc: "Query API for assets in Assets/Shared and its sub-folders (Models, Audio, Textures, Animations, Data).\n\nReplicated to all clients — do NOT store sensitive server-only data here.\n\nMethods:\n- find(name) — look up a template by name\n- get(id) — look up by immutable id\n- all() — all templates in Assets/Shared",
    insert: "Rebur.Assets.Shared",
  },
  {
    label: "Rebur.Assets.Shared.find",
    kind: K.Function,
    detail: "Rebur.Assets.Shared.find(name) → Entity | null",
    doc: "Look up a shared asset by name.\n\nFor sensitive server-only data use Rebur.Assets.Server instead.",
    insert: "Rebur.Assets.Shared.find(\"${1:Name}\")",
    snippet: true,
  },
  {
    label: "Rebur.Assets.Shared.get",
    kind: K.Function,
    detail: "Rebur.Assets.Shared.get(id) → Entity | null",
    doc: "Look up a shared asset by immutable id.",
    insert: "Rebur.Assets.Shared.get(\"${1:id}\")",
    snippet: true,
  },
  {
    label: "Rebur.Assets.Shared.all",
    kind: K.Function,
    detail: "Rebur.Assets.Shared.all() → Entity[]",
    doc: "Return all entities in Assets/Shared (and sub-folders).",
    insert: "Rebur.Assets.Shared.all()",
  },

  // ─── Rebur.Assets.Server ─────────────────────────────────────────────────
  {
    label: "Rebur.Assets.Server",
    kind: K.Variable,
    detail: "AssetsServerAPI — server-only assets (never replicated)",
    doc: "Query API for assets in Assets/Server and its sub-folders (Models, Audio, Textures, Animations, Data).\n\nNever replicated to clients — safe for secrets, server-side configs, and private content.\n\nMethods:\n- find(name) — look up an asset by name\n- get(id) — look up by immutable id\n- all() — all assets in Assets/Server",
    insert: "Rebur.Assets.Server",
  },
  {
    label: "Rebur.Assets.Server.find",
    kind: K.Function,
    detail: "Rebur.Assets.Server.find(name) → Entity | null",
    doc: "Look up a server-only asset by name. Never sent to clients.",
    insert: "Rebur.Assets.Server.find(\"${1:Name}\")",
    snippet: true,
  },
  {
    label: "Rebur.Assets.Server.get",
    kind: K.Function,
    detail: "Rebur.Assets.Server.get(id) → Entity | null",
    doc: "Look up a server-only asset by immutable id.",
    insert: "Rebur.Assets.Server.get(\"${1:id}\")",
    snippet: true,
  },
  {
    label: "Rebur.Assets.Server.all",
    kind: K.Function,
    detail: "Rebur.Assets.Server.all() → Entity[]",
    doc: "Return all entities in Assets/Server (and sub-folders).",
    insert: "Rebur.Assets.Server.all()",
  },

  // ─── Rebur.Players ───────────────────────────────────────────────────────
  {
    label: "Rebur.Players",
    kind: K.Variable,
    detail: "PlayersContainer — player entities",
    doc: "Container for all connected player entities.\n\nPlayers are entities with isPlayer = true. They have all entity properties plus health, walkSpeed, jumpPower, inventory, etc.\n\nMethods:\n- all() — all connected players\n- find(username) — find by display name\n- get(id) — find by immutable id (safest for cross-container refs)",
    insert: "Rebur.Players",
  },
  {
    label: "Rebur.Players.all",
    kind: K.Function,
    detail: "Rebur.Players.all() → PlayerEntity[]",
    doc: "Return all currently connected players.",
    insert: "Rebur.Players.all()",
  },
  {
    label: "Rebur.Players.find",
    kind: K.Function,
    detail: "Rebur.Players.find(username) → PlayerEntity | null",
    doc: "Find a player by username. Returns null if not found.",
    insert: "Rebur.Players.find(\"${1:username}\")",
    snippet: true,
  },
  {
    label: "Rebur.Players.get",
    kind: K.Function,
    detail: "Rebur.Players.get(id) → PlayerEntity | null",
    doc: "Find a player by their immutable session id. Preferred for cross-container references:\n\n  entity.on(\"touched\", (other) => {\n    if (other.isPlayer) {\n      const player = Rebur.Players.get(other.id);\n      if (player) player.health -= 10;\n    }\n  });",
    insert: "Rebur.Players.get(${1:id})",
    snippet: true,
  },

  // ─── Entity base properties ───────────────────────────────────────────────
  {
    label: "entity.id",
    kind: K.Property,
    detail: "string (read-only)",
    doc: "Immutable unique id. Use this for long-lived references — names can be renamed but ids never change.",
    insert: ".id",
  },
  {
    label: "entity.name",
    kind: K.Property,
    detail: "string",
    doc: "Display name. Used by Rebur.Workspace.find(). Can be changed at runtime.",
    insert: ".name",
  },
  {
    label: "entity.type",
    kind: K.Property,
    detail: "string (read-only)",
    doc: "Entity type: 'primitive', 'model', 'light', 'audio', 'folder', etc.",
    insert: ".type",
  },
  {
    label: "entity.isPlayer",
    kind: K.Property,
    detail: "boolean (read-only)",
    doc: "True if this entity is a player. Use this to branch on player vs non-player inside touched/collision handlers.\n\n  entity.on(\"touched\", (other) => {\n    if (other.isPlayer) {\n      other.health -= 10;\n    }\n  });",
    insert: ".isPlayer",
  },
  {
    label: "entity.position",
    kind: K.Property,
    detail: "Vec3 — { x, y, z }",
    doc: "World position. Read returns { x, y, z }. Write by assigning a full new object.\n\n  entity.position = { x: 0, y: 5, z: 0 };",
    insert: ".position",
  },
  {
    label: "entity.rotation",
    kind: K.Property,
    detail: "Vec3 — { x, y, z } radians",
    doc: "Rotation in radians. rotation.y is yaw.\n\n  entity.rotation = { x: 0, y: Math.PI / 2, z: 0 }; // 90° yaw",
    insert: ".rotation",
  },
  {
    label: "entity.scale",
    kind: K.Property,
    detail: "Vec3 — { x, y, z }",
    doc: "Scale multiplier. Default { x:1, y:1, z:1 }.",
    insert: ".scale",
  },
  {
    label: "entity.color",
    kind: K.Property,
    detail: "string — CSS color",
    doc: "Surface color. Accepts hex (#ff0000), rgb(), or named colors.",
    insert: ".color",
  },
  {
    label: "entity.visible",
    kind: K.Property,
    detail: "boolean",
    doc: "Whether the entity is rendered. Setting to false hides it but keeps it in the world.",
    insert: ".visible",
  },
  {
    label: "entity.transparency",
    kind: K.Property,
    detail: "number 0–1",
    doc: "0 = fully opaque, 1 = fully invisible.",
    insert: ".transparency",
  },
  {
    label: "entity.parent",
    kind: K.Property,
    detail: "Entity | null (read-only)",
    doc: "Parent entity in the hierarchy, or null if at root.",
    insert: ".parent",
  },
  {
    label: "entity.children",
    kind: K.Property,
    detail: "Entity[] (read-only)",
    doc: "Direct children of this entity.",
    insert: ".children",
  },

  // ─── Entity methods ───────────────────────────────────────────────────────
  {
    label: "entity.find",
    kind: K.Function,
    detail: "entity.find(name) → Entity | null",
    doc: "Find a direct child by name.",
    insert: ".find(\"${1:name}\")",
    snippet: true,
  },
  {
    label: "entity.setParent",
    kind: K.Function,
    detail: "entity.setParent(parent) → void",
    doc: "Attach this entity to a parent. Pass null to detach.",
    insert: ".setParent(${1:parent})",
    snippet: true,
  },
  {
    label: "entity.destroy",
    kind: K.Function,
    detail: "entity.destroy() → void",
    doc: "Remove and destroy this entity from the world. After this, entity.destroyed is true.",
    insert: ".destroy()",
  },
  {
    label: "entity.destroyed",
    kind: K.Property,
    detail: "boolean (read-only)",
    doc: "True once this entity has been destroyed. Methods called on a destroyed entity are no-ops (they log a warning but don't throw).\n\nAlways check entity.destroyed when holding long-lived references:\n\n  every(1, () => {\n    if (!enemy || enemy.destroyed) return;\n    enemy.rotation.y += 0.1;\n  });",
    insert: ".destroyed",
  },
  {
    label: "entity.setAttribute",
    kind: K.Function,
    detail: "entity.setAttribute(key, value) → void",
    doc: "Store arbitrary data on this entity.",
    insert: ".setAttribute(\"${1:key}\", ${2:value})",
    snippet: true,
  },
  {
    label: "entity.getAttribute",
    kind: K.Function,
    detail: "entity.getAttribute(key) → any",
    doc: "Read data stored with setAttribute.",
    insert: ".getAttribute(\"${1:key}\")",
    snippet: true,
  },

  // ─── Entity events ────────────────────────────────────────────────────────
  {
    label: "entity.on",
    kind: K.Function,
    detail: "entity.on(event, fn) → unsubscribe",
    doc: "Subscribe to an entity event. Returns an unsubscribe function.\n\nBuilt-in events:\n- 'touched' — (other: Entity) — overlap starts\n- 'untouched' — (other: Entity) — overlap ends\n- 'clicked' — (player: PlayerEntity) — 3D viewport click\n- 'destroyed' — () — entity destroyed\n- 'collisionStarted' — (other, impulse) — physics collision\n- 'collisionEnded' — (other) — collision ends\n\nCustom events — pair with entity.emit().",
    insert: ".on(\"${1|touched,untouched,clicked,destroyed,collisionStarted,collisionEnded|}\", (${2:other}) => {\n\t${3}\n})",
    snippet: true,
  },
  {
    label: "entity.off",
    kind: K.Function,
    detail: "entity.off(event, fn) → void",
    doc: "Unsubscribe a handler.",
    insert: ".off(\"${1:event}\", ${2:handler})",
    snippet: true,
  },
  {
    label: "entity.emit",
    kind: K.Function,
    detail: "entity.emit(event, ...args) → boolean",
    doc: "Fire a custom event on this entity. Cannot emit reserved engine events.\nReturns true on success.",
    insert: ".emit(\"${1:myEvent}\", ${2})",
    snippet: true,
  },

  // ─── Entity physics body ──────────────────────────────────────────────────
  {
    label: "entity.body",
    kind: K.Property,
    detail: "EntityBody — physics simulation",
    doc: "Physics body for this entity. Force-based — use applyForce/applyImpulse for realistic physics.\n\nProperties:\n- body.anchored — static collider\n- body.canCollide — participates in collision\n- body.mass — kg (default 1)\n- body.friction — (default 0.5)\n- body.restitution — bounciness 0–1\n- body.isKinematic — script-moved, not force-driven\n- body.isTrigger — overlap only, no collision response\n- body.velocity — current velocity (read-only)",
    insert: ".body",
  },
  {
    label: "entity.body.anchored",
    kind: K.Property,
    detail: "boolean",
    doc: "When true: static collider, cannot be moved by physics. When false: dynamic, affected by forces and gravity.",
    insert: ".body.anchored",
  },
  {
    label: "entity.body.canCollide",
    kind: K.Property,
    detail: "boolean",
    doc: "Whether this entity participates in collision detection.",
    insert: ".body.canCollide",
  },
  {
    label: "entity.body.mass",
    kind: K.Property,
    detail: "number (kg)",
    doc: "Mass in kilograms. Affects how forces and impulses move the entity. Default 1.",
    insert: ".body.mass",
  },
  {
    label: "entity.body.friction",
    kind: K.Property,
    detail: "number 0–1",
    doc: "Surface friction coefficient. Default 0.5.",
    insert: ".body.friction",
  },
  {
    label: "entity.body.restitution",
    kind: K.Property,
    detail: "number 0–1",
    doc: "Bounciness coefficient. 0 = no bounce, 1 = perfect bounce. Default 0.",
    insert: ".body.restitution",
  },
  {
    label: "entity.body.isKinematic",
    kind: K.Property,
    detail: "boolean",
    doc: "When true: entity is moved by script (position/rotation assignment) not physics. Collisions still detected but forces don't affect it.",
    insert: ".body.isKinematic",
  },
  {
    label: "entity.body.isTrigger",
    kind: K.Property,
    detail: "boolean",
    doc: "When true: detects overlaps (fires 'touched'/'untouched') but has no physical collision response — other entities pass through.",
    insert: ".body.isTrigger",
  },
  {
    label: "entity.body.velocity",
    kind: K.Property,
    detail: "Vec3 (read-only)",
    doc: "Current linear velocity. Read-only — use setVelocity() or applyImpulse() to change it.",
    insert: ".body.velocity",
  },
  {
    label: "entity.body.applyForce",
    kind: K.Function,
    detail: "entity.body.applyForce(force: Vec3) → void",
    doc: "Apply a continuous force (Newtons) this frame. Best for sustained pushes like rocket thrust, gravity wells, wind.\n\nExample:\n  entity.body.applyForce({ x: 0, y: 50, z: 0 }); // lift",
    insert: ".body.applyForce({ x: ${1:0}, y: ${2:0}, z: ${3:0} })",
    snippet: true,
  },
  {
    label: "entity.body.applyImpulse",
    kind: K.Function,
    detail: "entity.body.applyImpulse(impulse: Vec3) → void",
    doc: "Apply an instant velocity change. Best for one-shot launches, hits, explosions.\n\nExample:\n  entity.body.applyImpulse({ x: 0, y: 10, z: -20 }); // launch",
    insert: ".body.applyImpulse({ x: ${1:0}, y: ${2:10}, z: ${3:0} })",
    snippet: true,
  },
  {
    label: "entity.body.setVelocity",
    kind: K.Function,
    detail: "entity.body.setVelocity(v: Vec3) → void",
    doc: "Directly override the linear velocity. Use sparingly — breaks physical realism. Prefer applyImpulse for launchers.",
    insert: ".body.setVelocity({ x: ${1:0}, y: ${2:0}, z: ${3:0} })",
    snippet: true,
  },

  // ─── Entity health ────────────────────────────────────────────────────────
  {
    label: "entity.health",
    kind: K.Property,
    detail: "number (0–maxHealth)",
    doc: "Current HP. Setting to 0 fires the \"died\" event and destroys the entity (if autoDestroy is true).\n\nDefault value equals maxHealth (100 unless changed).",
    insert: ".health",
  },
  {
    label: "entity.maxHealth",
    kind: K.Property,
    detail: "number (default 100)",
    doc: "Maximum HP. Setting this after spawn adjusts the cap; health is not automatically changed.",
    insert: ".maxHealth",
  },
  {
    label: "entity.autoDestroy",
    kind: K.Property,
    detail: "boolean (default true)",
    doc: "When true (default): entity is destroyed when health hits 0.\nSet false to handle death yourself — entity stays alive, \"died\" event still fires.",
    insert: ".autoDestroy",
  },
  {
    label: "entity.takeDamage",
    kind: K.Function,
    detail: "entity.takeDamage(amount) → void",
    doc: "Reduce entity health by amount (clamped to 0). Fires \"died\" and destroys if health hits 0 and autoDestroy is true.\n\nExample:\n  enemy.takeDamage(25);",
    insert: ".takeDamage(${1:amount})",
    snippet: true,
  },
  {
    label: "entity.heal",
    kind: K.Function,
    detail: "entity.heal(amount) → void",
    doc: "Restore entity health by amount, capped at maxHealth.\n\nExample:\n  pickup.on(\"touched\", (other) => { if(other.isPlayer) other.heal(20); });",
    insert: ".heal(${1:amount})",
    snippet: true,
  },

  // ─── Entity interaction ────────────────────────────────────────────────────
  {
    label: "entity.interactionEnabled",
    kind: K.Property,
    detail: "boolean (default false)",
    doc: "When true: pressing E while near this entity fires the \"interact\" event.\nPlayers within interactionDistance trigger it.",
    insert: ".interactionEnabled",
  },
  {
    label: "entity.interactionDistance",
    kind: K.Property,
    detail: "number (default 3, units)",
    doc: "Max distance in world units at which a player can trigger this entity's \"interact\" event. Default 3.",
    insert: ".interactionDistance",
  },
  {
    label: "entity.interactionHint",
    kind: K.Property,
    detail: "string",
    doc: "Tooltip text shown when the player is close enough to interact. Default \"Press E to interact\".",
    insert: ".interactionHint",
  },

  // ─── Player-specific properties ───────────────────────────────────────────
  {
    label: "player.username",
    kind: K.Property,
    detail: "string (read-only)",
    doc: "The player's display name.",
    insert: ".username",
  },
  {
    label: "player.isPlayer",
    kind: K.Property,
    detail: "true (read-only)",
    doc: "Always true for player entities. Use this inside touched/collision handlers to branch on player vs non-player.",
    insert: ".isPlayer",
  },
  {
    label: "player.health",
    kind: K.Property,
    detail: "number 0–maxHealth",
    doc: "Current health. When it reaches 0, playerDied fires and the player respawns.",
    insert: ".health",
  },
  {
    label: "player.maxHealth",
    kind: K.Property,
    detail: "number",
    doc: "Maximum health (default 100).",
    insert: ".maxHealth",
  },
  {
    label: "player.walkSpeed",
    kind: K.Property,
    detail: "number",
    doc: "Walk speed in units/s (default 6).",
    insert: ".walkSpeed",
  },
  {
    label: "player.runSpeed",
    kind: K.Property,
    detail: "number",
    doc: "Run speed when Shift is held (default 12).",
    insert: ".runSpeed",
  },
  {
    label: "player.jumpPower",
    kind: K.Property,
    detail: "number",
    doc: "Jump velocity (default 8).",
    insert: ".jumpPower",
  },
  {
    label: "player.onGround",
    kind: K.Property,
    detail: "boolean (read-only)",
    doc: "True while the player is standing on a surface.",
    insert: ".onGround",
  },
  {
    label: "player.spawnPoint",
    kind: K.Property,
    detail: "Vec3",
    doc: "Position used when the player respawns.",
    insert: ".spawnPoint",
  },
  {
    label: "player.position",
    kind: K.Property,
    detail: "Vec3 (writable)",
    doc: "World position. Write to instantly move the player:\n\n  player.position = { x: 0, y: 10, z: 0 };\n\nReading always returns the current server-authoritative position.",
    insert: ".position",
  },
  {
    label: "player.respawn",
    kind: K.Property,
    detail: "boolean (set to true to respawn)",
    doc: "Set to true to teleport the player to their spawnPoint and restore full health.\n\n  player.respawn = true;\n\n  // Change spawn first:\n  player.spawnPoint = { x: 50, y: 5, z: 0 };\n  player.respawn = true;",
    insert: ".respawn = true",
  },
  {
    label: "player.isKinematic",
    kind: K.Property,
    detail: "boolean (default false)",
    doc: "When true, the built-in physics engine is completely skipped for this player — gravity, collision, and WASD movement are all disabled. Scripts then have full control over position and velocity each tick.\n\nUseful for scripted vehicles, moving platforms, cutscenes, and similar patterns.\n\nExample (vehicle):\n  Rebur.on(\"playerJoined\", (p) => {\n    p.isKinematic = true;\n  });\n  Rebur.on(\"tick\", () => {\n    for (const p of Rebur.Players.all()) {\n      p.position = { x: cart.position.x, y: cart.position.y + 1.2, z: cart.position.z };\n    }\n  });\n\nSet back to false to return physics control to the engine.",
    insert: ".isKinematic",
  },
  {
    label: "player.inventory",
    kind: K.Property,
    detail: "Inventory",
    doc: "The player's item inventory. Methods: add, remove, has, get, equip, drop, clear.",
    insert: ".inventory",
  },
  {
    label: "player.inventory.add",
    kind: K.Function,
    detail: "inventory.add(name, opts?) → InventoryItem | null",
    doc: "Add items to inventory. Returns null if full.",
    insert: ".inventory.add(\"${1:Item}\")",
    snippet: true,
  },
  {
    label: "player.inventory.remove",
    kind: K.Function,
    detail: "inventory.remove(name, count?) → number",
    doc: "Remove items from inventory. Returns number removed.",
    insert: ".inventory.remove(\"${1:Item}\")",
    snippet: true,
  },
  {
    label: "player.inventory.has",
    kind: K.Function,
    detail: "inventory.has(name, count?) → boolean",
    doc: "Check if inventory contains at least count of item.",
    insert: ".inventory.has(\"${1:Item}\")",
    snippet: true,
  },
  {
    label: "player.inventory.equip",
    kind: K.Function,
    detail: "inventory.equip(name | null) → boolean",
    doc: "Equip an item by name, or pass null to unequip.",
    insert: ".inventory.equip(\"${1:Item}\")",
    snippet: true,
  },
  {
    label: "player.inventory.drop",
    kind: K.Function,
    detail: "inventory.drop(name, count?) → Entity | null",
    doc: "Drop items in front of player, spawning a world entity.",
    insert: ".inventory.drop(\"${1:Item}\")",
    snippet: true,
  },
  {
    label: "player.motors.attach",
    kind: K.Function,
    detail: "motors.attach(slot, entity, offset?, rotation?) → void",
    doc: "Attach an entity to a player body slot.\nSlots: 'rightHand' | 'leftHand' | 'head' | 'back' | 'chest'",
    insert: ".motors.attach(\"${1:rightHand}\", ${2:entity})",
    snippet: true,
  },
  {
    label: "player.motors.detach",
    kind: K.Function,
    detail: "motors.detach(slot) → Entity | null",
    doc: "Detach entity from a body slot. Returns the detached entity.",
    insert: ".motors.detach(\"${1:rightHand}\")",
    snippet: true,
  },
  {
    label: "player.motors.get",
    kind: K.Function,
    detail: "motors.get(slot) → Entity | null",
    doc: "Get the entity currently attached to a body slot.",
    insert: ".motors.get(\"${1:rightHand}\")",
    snippet: true,
  },

  // ─── player.gui (per-player private HUD) ─────────────────────────────────
  {
    label: "player.gui",
    kind: K.Property,
    detail: "PlayerGuiAPI — private per-player HUD",
    doc: "Private HUD visible ONLY to this player. Same API as Rebur.Gui but scoped to one player.\n\nUse for: inventories, health bars, quest logs, shops, notifications, dialogue, admin panels.\nUse Rebur.Gui for shared elements: round timers, kill feeds, scoreboards.\n\nMethods:\n- player.gui.text(id, text, opts?)\n- player.gui.button(id, text, opts?, onClick?)\n- player.gui.bar(id, value, max, opts?)\n- player.gui.image(id, url, opts?)\n- player.gui.clear(id?)",
    insert: ".gui",
  },
  {
    label: "player.gui.text",
    kind: K.Function,
    detail: "player.gui.text(id, text, opts?) → void",
    doc: "Show private text to this player only. Re-call with same id to update.",
    insert: ".gui.text(\"${1:label}\", \"${2:Hello}\", { anchor: \"${3:tc}\", y: ${4:20} })",
    snippet: true,
  },
  {
    label: "player.gui.button",
    kind: K.Function,
    detail: "player.gui.button(id, text, opts?, onClick?) → void",
    doc: "Show a private button to this player only.",
    insert: ".gui.button(\"${1:btn}\", \"${2:Click}\", { anchor: \"${3:cc}\" }, () => {\n\t${4}\n})",
    snippet: true,
  },
  {
    label: "player.gui.bar",
    kind: K.Function,
    detail: "player.gui.bar(id, value, maxValue, opts?) → void",
    doc: "Show a private progress/health bar to this player only.",
    insert: ".gui.bar(\"${1:hp}\", ${2:100}, ${3:100}, { anchor: \"${4:bl}\", x: 20, y: 20, width: 200, height: 16 })",
    snippet: true,
  },
  {
    label: "player.gui.clear",
    kind: K.Function,
    detail: "player.gui.clear(id?) → void",
    doc: "Remove a private GUI element. Omit id to clear all of this player's private GUI.",
    insert: ".gui.clear(${1})",
    snippet: true,
  },

  // ─── player.data (per-player persistent storage) ─────────────────────────
  {
    label: "player.data",
    kind: K.Property,
    detail: "PlayerDataAPI — persistent per-player storage",
    doc: "Persistent key-value store for this player. Values survive between sessions.\n\nUse for: coins, XP, level, unlocks, inventory persistence, settings.\n\nMethods:\n- player.data.get(key)\n- player.data.set(key, value)\n- player.data.increment(key, amount?)\n- player.data.delete(key)\n- player.data.getAll()",
    insert: ".data",
  },
  {
    label: "player.data.get",
    kind: K.Function,
    detail: "player.data.get(key) → any",
    doc: "Read a persistent value for this player. Returns undefined if never set.\n\n  const coins = player.data.get(\"coins\") ?? 0;",
    insert: ".data.get(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "player.data.set",
    kind: K.Function,
    detail: "player.data.set(key, value) → void",
    doc: "Write a persistent value for this player. Saved immediately.",
    insert: ".data.set(\"${1:key}\", ${2:value})",
    snippet: true,
  },
  {
    label: "player.data.increment",
    kind: K.Function,
    detail: "player.data.increment(key, amount?) → number",
    doc: "Increment a number atomically. Returns the new value. Amount defaults to 1.\n\n  player.data.increment(\"coins\", 10); // coins += 10\n  player.data.increment(\"deaths\");     // deaths += 1",
    insert: ".data.increment(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "player.data.delete",
    kind: K.Function,
    detail: "player.data.delete(key) → void",
    doc: "Delete a persistent key for this player.",
    insert: ".data.delete(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "player.data.getAll",
    kind: K.Function,
    detail: "player.data.getAll() → Record<string, any>",
    doc: "Snapshot of all persistent values for this player.",
    insert: ".data.getAll()",
  },

  // ─── player.animator (skeletal animation controller) ─────────────────────
  {
    label: "player.animator",
    kind: K.Property,
    detail: "AnimatorAPI — skeletal animation controller",
    doc: "Animation controller for humanoid player characters.\n\nBuilt-in animations: 'Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Wave', 'Dance', 'Sit'\n\nMethods:\n- player.animator.play(name, opts?)\n- player.animator.stop()\n- player.animator.on('done', fn)\n\nProps:\n- player.animator.current — currently playing animation name\n- player.animator.playing — whether animation is active",
    insert: ".animator",
  },
  {
    label: "player.animator.play",
    kind: K.Function,
    detail: "player.animator.play(name, opts?) → void",
    doc: "Play an animation by name. Blends from the current animation.\n\nOpts:\n- blend: number — blend time in seconds (default 0.1)\n- loop: boolean — loop the animation (default true)\n\nBuilt-in: 'Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Wave', 'Dance', 'Sit'",
    insert: ".animator.play(\"${1|Idle,Walk,Run,Jump,Fall,Land,Wave,Dance,Sit|}\", { blend: ${2:0.2} })",
    snippet: true,
  },
  {
    label: "player.animator.stop",
    kind: K.Function,
    detail: "player.animator.stop() → void",
    doc: "Stop the current animation and return to idle.",
    insert: ".animator.stop()",
  },
  {
    label: "player.animator.current",
    kind: K.Property,
    detail: "string | null (read-only)",
    doc: "Name of the currently playing animation, or null if stopped.",
    insert: ".animator.current",
  },

  // ─── Rebur.State ─────────────────────────────────────────────────────────
  {
    label: "Rebur.State",
    kind: K.Variable,
    detail: "StateAPI — shared key-value store",
    doc: "Shared reactive key-value store. Values sync across all scripts in the session. Ideal for score, round state, flags, etc.",
    insert: "Rebur.State",
  },
  {
    label: "Rebur.State.set",
    kind: K.Function,
    detail: "Rebur.State.set(key, value) → void",
    doc: "Set a value. Triggers all listeners registered with Rebur.State.on().",
    insert: "Rebur.State.set(\"${1:key}\", ${2:value})",
    snippet: true,
  },
  {
    label: "Rebur.State.get",
    kind: K.Function,
    detail: "Rebur.State.get(key) → any",
    doc: "Read a value. Returns undefined if not set.",
    insert: "Rebur.State.get(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "Rebur.State.on",
    kind: K.Function,
    detail: "Rebur.State.on(key, fn) → unsubscribe",
    doc: "Watch a key for changes. fn(newValue, oldValue). Returns unsubscribe.",
    insert: "Rebur.State.on(\"${1:key}\", (val, prev) => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "Rebur.State.keys",
    kind: K.Function,
    detail: "Rebur.State.keys() → string[]",
    doc: "Return all keys currently in the state store.",
    insert: "Rebur.State.keys()",
  },
  {
    label: "Rebur.State.getAll",
    kind: K.Function,
    detail: "Rebur.State.getAll() → Record<string, any>",
    doc: "Snapshot of all state values.",
    insert: "Rebur.State.getAll()",
  },

  // ─── Rebur.DataStore ─────────────────────────────────────────────────────
  {
    label: "Rebur.DataStore",
    kind: K.Variable,
    detail: "DataStoreAPI — persistent cross-session storage",
    doc: "Persistent key-value store that survives server restarts and new sessions. Use for game-wide data: leaderboards, world records, global flags, total games played.\n\nFor per-player data use player.data instead.",
    insert: "Rebur.DataStore",
  },
  {
    label: "Rebur.DataStore.get",
    kind: K.Function,
    detail: "Rebur.DataStore.get(key) → any",
    doc: "Read a persistent value. Returns undefined if not set.",
    insert: "Rebur.DataStore.get(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "Rebur.DataStore.set",
    kind: K.Function,
    detail: "Rebur.DataStore.set(key, value) → void",
    doc: "Write a persistent value. Survives server restarts.",
    insert: "Rebur.DataStore.set(\"${1:key}\", ${2:value})",
    snippet: true,
  },
  {
    label: "Rebur.DataStore.increment",
    kind: K.Function,
    detail: "Rebur.DataStore.increment(key, amount?) → number",
    doc: "Atomically increment a numeric value. Returns the new value. Amount defaults to 1.",
    insert: "Rebur.DataStore.increment(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "Rebur.DataStore.delete",
    kind: K.Function,
    detail: "Rebur.DataStore.delete(key) → void",
    doc: "Delete a persistent key.",
    insert: "Rebur.DataStore.delete(\"${1:key}\")",
    snippet: true,
  },
  {
    label: "Rebur.DataStore.keys",
    kind: K.Function,
    detail: "Rebur.DataStore.keys() → string[]",
    doc: "Return all keys in the data store.",
    insert: "Rebur.DataStore.keys()",
  },

  // ─── Rebur.Gui ───────────────────────────────────────────────────────────
  {
    label: "Rebur.Gui",
    kind: K.Variable,
    detail: "GuiAPI — shared global HUD overlay",
    doc: "Global HUD overlay — ALL players see every element. Re-call with the same id to update.\n\nUse for: round timers, kill feeds, scoreboards, game-wide announcements.\nFor private per-player UI (health bars, inventories, shops) use player.gui instead.\n\nAnchor shortcuts: 'tl'=top-left, 'tc'=top-center, 'tr'=top-right, 'bl'/'bc'/'br'=bottom, 'cc'=center.",
    insert: "Rebur.Gui",
  },
  {
    label: "Rebur.Gui.text",
    kind: K.Function,
    detail: "Rebur.Gui.text(id, text, opts?) → void",
    doc: "Display or update a text element. Re-call with same id to update.\n\nOpts: anchor, x, y, size, color, bg.",
    insert: "Rebur.Gui.text(\"${1:label}\", \"${2:Hello}\", { anchor: \"${3:tc}\", y: ${4:16}, size: ${5:18} })",
    snippet: true,
  },
  {
    label: "Rebur.Gui.button",
    kind: K.Function,
    detail: "Rebur.Gui.button(id, text, opts?, onClick?) → void",
    doc: "Create or update a clickable button. onClick receives no arguments.",
    insert: "Rebur.Gui.button(\"${1:btn}\", \"${2:Click me}\", { anchor: \"${3:br}\", x: 24, y: 24 }, () => {\n\t${4}\n})",
    snippet: true,
  },
  {
    label: "Rebur.Gui.bar",
    kind: K.Function,
    detail: "Rebur.Gui.bar(id, value, maxValue, opts?) → void",
    doc: "Create or update a progress/health bar. Re-call with same id to update value.",
    insert: "Rebur.Gui.bar(\"${1:hp}\", ${2:100}, ${3:100}, { anchor: \"${4:bl}\", x: 20, y: 20, width: 200, height: 16 })",
    snippet: true,
  },
  {
    label: "Rebur.Gui.image",
    kind: K.Function,
    detail: "Rebur.Gui.image(id, url, opts?) → void",
    doc: "Display an image on the HUD.",
    insert: "Rebur.Gui.image(\"${1:icon}\", \"${2:/uploads/icon.png}\", { anchor: \"${3:tl}\", x: 20, y: 20, width: 48, height: 48 })",
    snippet: true,
  },
  {
    label: "Rebur.Gui.clear",
    kind: K.Function,
    detail: "Rebur.Gui.clear(id?) → void",
    doc: "Remove a GUI element by id. Omit id to clear all elements.",
    insert: "Rebur.Gui.clear(${1})",
    snippet: true,
  },

  // ─── Rebur.Sound ─────────────────────────────────────────────────────────
  {
    label: "Rebur.Sound",
    kind: K.Variable,
    detail: "SoundAPI — audio playback",
    doc: "Play sounds for all players in the session.\n\nBuilt-in ids: 'jump', 'land', 'hit', 'collect', 'click'\nCustom: use the filename from an imported audio asset.",
    insert: "Rebur.Sound",
  },
  {
    label: "Rebur.Sound.play",
    kind: K.Function,
    detail: "Rebur.Sound.play(id, opts?) → void",
    doc: "Play a sound.\n\nOpts:\n- volume: 0.0–1.0 (default 1.0)\n- loop: boolean (default false)",
    insert: "Rebur.Sound.play(\"${1:collect}\")",
    snippet: true,
  },
  {
    label: "Rebur.Sound.stop",
    kind: K.Function,
    detail: "Rebur.Sound.stop(id) → void",
    doc: "Stop a playing sound.",
    insert: "Rebur.Sound.stop(\"${1:id}\")",
    snippet: true,
  },

  // ─── Rebur.Tween ─────────────────────────────────────────────────────────
  {
    label: "Rebur.Tween",
    kind: K.Function,
    detail: "Rebur.Tween(target, to, duration, easing?, onDone?) → cancel()",
    doc: "Smoothly animate any numeric properties on target over duration (seconds). Returns a cancel function.\n\nEasing: 'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'bounce', 'elastic'\n\nExample:\n  Rebur.Tween(entity.position, { y: 10 }, 2, \"easeOutQuad\");\n  Rebur.Tween(entity.rotation, { y: Math.PI }, 1, \"linear\", () => log(\"done\"));",
    insert: "Rebur.Tween(${1:entity}.position, { ${2:y}: ${3:5} }, ${4:2}, \"${5:easeOutQuad}\")",
    snippet: true,
  },

  // ─── Rebur.Camera ────────────────────────────────────────────────────────
  {
    label: "Rebur.Camera",
    kind: K.Variable,
    detail: "CameraAPI — camera control",
    doc: "Camera settings. Set mode to 'scripted' for full manual control.",
    insert: "Rebur.Camera",
  },
  {
    label: "Rebur.Camera.distance",
    kind: K.Property,
    detail: "number",
    doc: "Third-person distance from player (default 6).",
    insert: "Rebur.Camera.distance",
  },
  {
    label: "Rebur.Camera.fov",
    kind: K.Property,
    detail: "number (degrees)",
    doc: "Field of view in degrees (default 60).",
    insert: "Rebur.Camera.fov",
  },
  {
    label: "Rebur.Camera.position",
    kind: K.Property,
    detail: "Vec3",
    doc: "Camera world position (set in 'scripted' mode).",
    insert: "Rebur.Camera.position",
  },
  {
    label: "Rebur.Camera.lookAt",
    kind: K.Property,
    detail: "Vec3",
    doc: "Camera look-at target (set in 'scripted' mode).",
    insert: "Rebur.Camera.lookAt",
  },

  // ─── Rebur.Input ─────────────────────────────────────────────────────────
  {
    label: "Rebur.Input",
    kind: K.Variable,
    detail: "InputAPI — keyboard & mouse",
    doc: "Keyboard and mouse input.\n\nMethods:\n- .on('press', fn)      — fn(player, key) fires on key down\n- .on('release', fn)    — fn(player, key) fires on key up\n- .on('mouseClick', fn) — fn(player, entity|null) fires on 3D click\n- .off(event, fn)       — remove a listener\n\nTo poll whether a specific key is held for a specific player, use:\n  player.input.key('w')   — returns true/false",
    insert: "Rebur.Input",
  },
  {
    label: "Rebur.Input.on(press)",
    kind: K.Function,
    detail: "Rebur.Input.on('press', fn) → unsubscribe",
    doc: "Fire fn(player, key) once each time any player presses a key.\nKey names: 'a'–'z', 'space', 'shift', 'control', 'alt', 'enter', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'.",
    insert: "Rebur.Input.on(\"press\", (player, key) => {\n\tif (key === \"${1:e}\") {\n\t\t${2}\n\t}\n})",
    snippet: true,
  },
  {
    label: "Rebur.Input.on(release)",
    kind: K.Function,
    detail: "Rebur.Input.on('release', fn) → unsubscribe",
    doc: "Fire fn(player, key) once each time any player releases a key.",
    insert: "Rebur.Input.on(\"release\", (player, key) => {\n\tif (key === \"${1:e}\") {\n\t\t${2}\n\t}\n})",
    snippet: true,
  },
  {
    label: "Rebur.Input.on(mouseClick)",
    kind: K.Function,
    detail: "Rebur.Input.on('mouseClick', fn) → unsubscribe",
    doc: "Called on every 3D viewport click. Callback receives (player, entity | null).\nfires for the player who clicked. entity is null if the click hit empty space.\n\nExample:\nRebur.Input.on('mouseClick', (player, entity) => {\n  if (entity) log(player.username, 'clicked', entity.name);\n});",
    insert: "Rebur.Input.on(\"mouseClick\", (player, entity) => {\n\tif (entity) {\n\t\t${1}\n\t}\n})",
    snippet: true,
  },
  {
    label: "Rebur.Input.off",
    kind: K.Function,
    detail: "Rebur.Input.off(event, fn)",
    doc: "Remove a previously registered listener. Prefer the unsubscribe function returned by .on() instead.",
    insert: "Rebur.Input.off(\"${1:press}\", ${2:handler})",
    snippet: true,
  },

  // ─── Rebur.Physics ───────────────────────────────────────────────────────
  {
    label: "Rebur.Physics",
    kind: K.Variable,
    detail: "PhysicsAPI — global physics settings",
    doc: "Global physics configuration.",
    insert: "Rebur.Physics",
  },
  {
    label: "Rebur.Physics.gravity",
    kind: K.Property,
    detail: "number (m/s²)",
    doc: "Global gravity (default 9.81). Set to 0 for zero-G environments.",
    insert: "Rebur.Physics.gravity",
  },
  {
    label: "Rebur.Physics.airDrag",
    kind: K.Property,
    detail: "number",
    doc: "Global air resistance applied to all dynamic entities (default 0).",
    insert: "Rebur.Physics.airDrag",
  },

  // ─── Rebur.RunService ────────────────────────────────────────────────────
  {
    label: "Rebur.RunService",
    kind: K.Variable,
    detail: "RunServiceAPI — game loop phases",
    doc: "Low-level game loop channels. Phase order each frame: input → animation → replication → physics → render → update.\n\nUse 'update' for most scripted movement (post-physics). Use 'physics' to apply forces.",
    insert: "Rebur.RunService",
  },
  {
    label: "Rebur.RunService.on",
    kind: K.Function,
    detail: "Rebur.RunService.on(phase, fn) → unsubscribe",
    doc: "Subscribe to a game loop phase. fn receives (dt, time).\n\nPhases: 'input', 'animation', 'replication', 'physics', 'render', 'update'",
    insert: "Rebur.RunService.on(\"${1|update,physics,render,input,animation|}\", (dt) => {\n\t${2}\n})",
    snippet: true,
  },

  // ─── Rebur.Network ───────────────────────────────────────────────────────
  {
    label: "Rebur.Network",
    kind: K.Variable,
    detail: "NetworkAPI — multiplayer messaging",
    doc: "Real-time multiplayer messaging between server and clients.",
    insert: "Rebur.Network",
  },
  {
    label: "Rebur.Network.send",
    kind: K.Function,
    detail: "Rebur.Network.send(event, payload) → void  [SERVER → all clients]",
    doc: "SERVER — Send a message to ALL connected clients.\n\nExample:\nRebur.Network.send('roundOver', { winner: 'Alice', score: 42 });",
    insert: "Rebur.Network.send(\"${1:event}\", ${2:payload})",
    snippet: true,
  },
  {
    label: "Rebur.Network.sendTo",
    kind: K.Function,
    detail: "Rebur.Network.sendTo(player, event, payload) → void  [SERVER → one player]",
    doc: "SERVER — Send a message to one specific player.\n\nExample:\nRebur.Network.sendTo(player, 'personalMessage', { text: 'You won!' });",
    insert: "Rebur.Network.sendTo(${1:player}, \"${2:event}\", ${3:payload})",
    snippet: true,
  },
  {
    label: "Rebur.Network.on",
    kind: K.Function,
    detail: "Rebur.Network.on(event, fn) → unsubscribe",
    doc: "Listen for incoming messages.\n\nServer: fn receives (payload, sender: PlayerEntity) — triggered when a client calls Rebur.Network.send().\nClient (future): fn receives (payload) — triggered when server calls Rebur.Network.send() or sendTo().\n\nExample:\nRebur.Network.on('action', (payload, sender) => {\n  log(sender.username, 'sent:', payload);\n});",
    insert: "Rebur.Network.on(\"${1:event}\", (payload, sender) => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "Rebur.Network.off",
    kind: K.Function,
    detail: "Rebur.Network.off(event, fn) → void",
    doc: "Remove a listener registered with Rebur.Network.on().",
    insert: "Rebur.Network.off(\"${1:event}\", ${2:handler})",
    snippet: true,
  },

  // ─── Rebur.Tags ──────────────────────────────────────────────────────────
  {
    label: "Rebur.Tags",
    kind: K.Variable,
    detail: "TagsAPI — entity tag queries",
    doc: "Group entities with string tags and query them in bulk.\n\nExample:\n  Rebur.Tags.add(entity, \"enemy\");\n  const enemies = Rebur.Tags.get(\"enemy\");\n  for (const e of enemies) e.destroy();",
    insert: "Rebur.Tags",
  },
  {
    label: "Rebur.Tags.add",
    kind: K.Function,
    detail: "Rebur.Tags.add(entity, tag) → void",
    doc: "Add a tag to an entity.",
    insert: "Rebur.Tags.add(${1:entity}, \"${2:enemy}\")",
    snippet: true,
  },
  {
    label: "Rebur.Tags.remove",
    kind: K.Function,
    detail: "Rebur.Tags.remove(entity, tag) → void",
    doc: "Remove a tag from an entity.",
    insert: "Rebur.Tags.remove(${1:entity}, \"${2:tag}\")",
    snippet: true,
  },
  {
    label: "Rebur.Tags.has",
    kind: K.Function,
    detail: "Rebur.Tags.has(entity, tag) → boolean",
    doc: "Check if an entity has a specific tag.",
    insert: "Rebur.Tags.has(${1:entity}, \"${2:tag}\")",
    snippet: true,
  },
  {
    label: "Rebur.Tags.get",
    kind: K.Function,
    detail: "Rebur.Tags.get(tag) → Entity[]",
    doc: "Return all entities that have the given tag.",
    insert: "Rebur.Tags.get(\"${1:enemy}\")",
    snippet: true,
  },
  {
    label: "Rebur.Tags.all",
    kind: K.Function,
    detail: "Rebur.Tags.all(entity) → string[]",
    doc: "Return all tags on an entity.",
    insert: "Rebur.Tags.all(${1:entity})",
    snippet: true,
  },

  // ─── Timers (global helpers) ──────────────────────────────────────────────
  {
    label: "after",
    kind: K.Function,
    detail: "after(seconds, fn) → cancel()",
    doc: "Call fn once after a delay (seconds). Returns a cancel function.",
    insert: "after(${1:2}, () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "every",
    kind: K.Function,
    detail: "every(seconds, fn) → cancel()",
    doc: "Call fn repeatedly at the given interval (seconds). Returns a cancel function.",
    insert: "every(${1:1}, () => {\n\t${2}\n})",
    snippet: true,
  },
  {
    label: "wait",
    kind: K.Function,
    detail: "wait(seconds) → Promise<void>",
    doc: "Returns a native Promise<void> that resolves after the given seconds.\n\nUse with async/await:\n  async function example() {\n    await wait(2);\n    log(\"done\");\n  }\n  example();\n\nOr with .then():\n  wait(2).then(() => log(\"done\"));\n\nOr combined:\n  Promise.all([wait(1), wait(2)]).then(() => log(\"both done\"));\n\nNote: native Promise is fully available in Rebur scripts.",
    insert: "await wait(${1:1})",
    snippet: true,
  },

  // ─── Logging (global helpers) ─────────────────────────────────────────────
  {
    label: "log",
    kind: K.Function,
    detail: "log(...args) → void",
    doc: "Print to the in-game console (HUD → Show Console).",
    insert: "log(${1})",
    snippet: true,
  },
  {
    label: "warn",
    kind: K.Function,
    detail: "warn(...args) → void",
    doc: "Print a warning to the in-game console.",
    insert: "warn(${1})",
    snippet: true,
  },
  {
    label: "error",
    kind: K.Function,
    detail: "error(...args) → void",
    doc: "Print an error to the in-game console.",
    insert: "error(${1})",
    snippet: true,
  },

  // ─── Math utilities (global helpers) ─────────────────────────────────────
  {
    label: "Vector3",
    kind: K.Module,
    detail: "Vector3(x, y, z) → Vec3",
    doc: "Create a Vec3. Also has factory methods:\n  Vector3.zero(), Vector3.one(), Vector3.up(), Vector3.right(), Vector3.forward()\n\nMethods:\n  v.add(other), v.sub(other), v.scale(n), v.normalize(), v.dot(other)\n  v.magnitude — length",
    insert: "Vector3(${1:0}, ${2:0}, ${3:0})",
    snippet: true,
  },
  {
    label: "Color3",
    kind: K.Module,
    detail: "Color3(r, g, b) → string",
    doc: "Build a CSS color string from 0–1 components.\n  Color3(1, 0, 0) → 'rgb(255,0,0)'\n  Color3.fromRGB(0, 0, 255) → 'rgb(0,0,255)'\n  Color3.fromHex('#ff8800') → '#ff8800'",
    insert: "Color3(${1:1}, ${2:0}, ${3:0})",
    snippet: true,
  },
  {
    label: "random",
    kind: K.Function,
    detail: "random(min, max) → number",
    doc: "Random float between min (inclusive) and max (exclusive).",
    insert: "random(${1:0}, ${2:10})",
    snippet: true,
  },
  {
    label: "randInt",
    kind: K.Function,
    detail: "randInt(min, max) → number",
    doc: "Random integer between min and max (inclusive).",
    insert: "randInt(${1:1}, ${2:6})",
    snippet: true,
  },
  {
    label: "pick",
    kind: K.Function,
    detail: "pick(arr) → T",
    doc: "Pick a random element from an array.",
    insert: "pick([${1}])",
    snippet: true,
  },
  {
    label: "dist",
    kind: K.Function,
    detail: "dist(a, b) → number",
    doc: "Distance between two Vec3 objects or Entities.",
    insert: "dist(${1:a}, ${2:b})",
    snippet: true,
  },
  {
    label: "lerp",
    kind: K.Function,
    detail: "lerp(a, b, t) → number",
    doc: "Linear interpolation between a and b by factor t (0–1).",
    insert: "lerp(${1:0}, ${2:100}, ${3:0.5})",
    snippet: true,
  },
  {
    label: "clamp",
    kind: K.Function,
    detail: "clamp(n, min, max) → number",
    doc: "Clamp n between min and max.",
    insert: "clamp(${1:n}, ${2:0}, ${3:1})",
    snippet: true,
  },
  {
    label: "raycast",
    kind: K.Function,
    detail: "raycast(origin, direction, maxDist?, params?) → { entity, distance, point, normal } | null",
    doc: "Cast a ray into the scene. Returns hit info or null.\n\nParams: { ignore: Entity[], filter: (e) => boolean, maxDistance: number }",
    insert: "raycast(\n\t{ x: ${1:0}, y: ${2:1}, z: ${3:0} },\n\t{ x: 0, y: -1, z: 0 },\n\t${4:50}\n)",
    snippet: true,
  },

  // ─── Module system ────────────────────────────────────────────────────────
  {
    label: "require",
    kind: K.Function,
    detail: "require(moduleName) → any",
    doc: "Load a ModuleScript from Storage by name. Returns the module's exports object.",
    insert: "require(\"${1:MyModule}\")",
    snippet: true,
  },
  {
    label: "exports",
    kind: K.Variable,
    detail: "any",
    doc: "In a ModuleScript — attach your public API to this object to expose it to other scripts via require().",
    insert: "exports",
  },

  // ─── Classes ──────────────────────────────────────────────────────────────
  {
    label: "Emitter",
    kind: K.Module,
    detail: "class Emitter",
    doc: "Custom typed event emitter.\n\nUsage:\n  const bus = new Emitter();\n  bus.on('event', fn);\n  bus.emit('event', ...args);",
    insert: "new Emitter()",
  },
  {
    label: "Class",
    kind: K.Module,
    detail: "Class(name, base?) → constructor",
    doc: "OOP class builder.\n\nUsage:\n  const Enemy = Class('Enemy');\n  Enemy.prototype.construct = function() { this.hp = 100; };\n  const e = new Enemy();",
    insert: "Class(\"${1:MyClass}\")",
    snippet: true,
  },
];

export const ENGINE_EDITOR_THEME: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7280" },
    { token: "keyword", foreground: "d4d4d4" },
    { token: "string", foreground: "a3a3a3" },
    { token: "number", foreground: "e5e5e5" },
    { token: "type", foreground: "d4d4d4" },
    { token: "function", foreground: "f5f5f5" },
    { token: "variable", foreground: "e5e5e5" },
    { token: "identifier", foreground: "e5e5e5" },
  ],
  colors: {
    "editor.background": "#0a0a0a",
    "editor.foreground": "#e5e5e5",
    "editor.lineHighlightBackground": "#171717",
    "editor.selectionBackground": "#262626",
    "editorLineNumber.foreground": "#525252",
    "editorIndentGuide.background": "#262626",
    "editor.wordHighlightBackground": "#262626",
    "editorCursor.foreground": "#ffffff",
    "editor.lineHighlightBorder": "#262626",
  },
};

let monacoConfigured = false;

export function configureMonacoForEngine(monaco: typeof Monaco): void {
  if (monacoConfigured) return;
  monacoConfigured = true;

  monaco.editor.defineTheme("engine-dark", ENGINE_EDITOR_THEME);

  const tsLang = (monaco.languages as any).typescript;
  tsLang.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  tsLang.javascriptDefaults.setCompilerOptions({
    target: tsLang.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    noLib: true,
    module: tsLang.ModuleKind.None,
    noEmit: true,
  });

  tsLang.javascriptDefaults.addExtraLib(ENGINE_TYPE_DEFS, "ts:rebur-engine.d.ts");

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

      const suggestions: Monaco.languages.CompletionItem[] = [];

      for (const item of COMPLETIONS) {
        const isDotted = item.label.includes(".");

        if (isDotted) {
          const parts = item.label.split(".");
          const prefix = parts.slice(0, -1).join(".");
          const textBefore = line.slice(0, position.column - 1);
          const afterDot = charBefore === ".";

          if (afterDot) {
            if (!textBefore.trimEnd().endsWith(prefix)) {
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
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on",
  parameterHints: { enabled: false },
  formatOnPaste: false,
  formatOnType: false,
  tabCompletion: "off",
  folding: true,
  foldingHighlight: true,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
};

export const AUTOCOMPLETE_ITEMS = COMPLETIONS;
