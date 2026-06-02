/**
 * render-types.ts — Shared types for server→client rendering
 * 
 * These types define the minimal data the server sends to clients.
 * NO game logic, physics, or scripting APIs are exposed here.
 */

// ── Basic Types ───────────────────────────────────────────────────────────────

export type Vec3 = { x: number; y: number; z: number };

// ── Render-Only Object State ──────────────────────────────────────────────────

export interface RenderObject {
  id: string;
  name: string;
  type: string;
  primitiveType: string | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  modelUrl?: string;
  modelScale?: number;
  audioUrl?: string;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
}

// ── Render-Only Player State ──────────────────────────────────────────────────

export interface RenderPlayer {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  onGround: boolean;
  animation: string;
  health: number;
  maxHealth: number;
  colors: {
    shirt: string;
    skin: string;
    pants: string;
  };
  motors: {
    [slot: string]: {
      objectId: string;
      offset: Vec3;
      rotation: Vec3;
    } | null;
  };
}

// ── GUI Elements ──────────────────────────────────────────────────────────────

export interface RenderGuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar";
  text?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  anchor: string;
  color: string;
  fontSize: number;
  backgroundColor?: string;
  imageUrl?: string;
  value?: number;
  maxValue?: number;
  visible: boolean;
  clickable?: boolean;
}

// ── Complete Render State ─────────────────────────────────────────────────────

export interface RenderState {
  tick: number;
  serverTime: number;
  objects: RenderObject[];
  players: RenderPlayer[];
  gui: RenderGuiElement[];
  localPlayerId: string | null;
  camera?: {
    mode: "thirdPerson" | "firstPerson" | "fixed" | "follow" | "scripted" | "free";
    position?: Vec3;
    lookAt?: Vec3;
    fov?: number;
    distance?: number;
  };
  lighting?: {
    ambientColor: string;
    ambientIntensity: number;
    sunColor: string;
    sunIntensity: number;
    sunDirection: Vec3;
    fogColor?: string;
    fogNear?: number;
    fogFar?: number;
  };
}

// ── WebSocket Protocol Messages ───────────────────────────────────────────────

// ── World Delta (delta-compressed tick update with network culling) ───────────

export interface WorldDelta {
  /** Tick number of the state this delta was computed from. */
  baseTick: number;
  /** Tick number of this delta (the new state). */
  tick: number;
  serverTime: number;
  /** Objects newly entered the player's view radius. */
  added: RenderObject[];
  /** Objects that changed position/rotation/color/visibility. */
  changed: RenderObject[];
  /** IDs of objects that left the player's view radius or were destroyed. */
  removed: string[];
  /** Always the full player list (players are always relevant). */
  players: RenderPlayer[];
  gui: RenderGuiElement[];
  localPlayerId: string;
  camera?: RenderState["camera"];
}

// Server → Client
export type ServerMessage =
  | { type: "init"; playerId: string; playerName: string; state: RenderState }
  | { type: "worldState"; state: RenderState }
  | { type: "worldDelta" } & WorldDelta
  | { type: "objectUpdate"; id: string; changes: Partial<RenderObject> }
  | { type: "playerUpdate"; id: string; changes: Partial<RenderPlayer> }
  | { type: "guiUpdate"; gui: RenderGuiElement[] }
  | { type: "playerJoined"; player: RenderPlayer }
  | { type: "playerLeft"; playerId: string }
  | { type: "chat"; playerId: string; playerName: string; text: string }
  | { type: "scriptLog"; logs: string[] }
  | { type: "sound"; soundId: string; options?: { volume?: number; loop?: boolean; position?: Vec3 } }
  | { type: "error"; code: string; message: string }
  | { type: "networkMessage"; event: string; payload: any };

// Client → Server
export type ClientMessage =
  | { type: "join"; sessionId: string; gameId: string; playerName: string; colors?: Record<string, string>; userId?: string }
  | { type: "input"; moveX: number; moveZ: number; jump: boolean; camY: number; sprint?: boolean }
  | { type: "keyDown"; key: string }
  | { type: "keyUp"; key: string }
  | { type: "guiClick"; elementId: string }
  | { type: "click3d"; objectId: string | null }
  | { type: "chat"; text: string }
  | { type: "networkSend"; event: string; payload?: any };

// ── Asset Request/Response ────────────────────────────────────────────────────

export interface AssetRequest {
  assetId: string;
  sessionToken: string;
}

export interface AssetResponse {
  url: string;
  expiresAt: number;
}
