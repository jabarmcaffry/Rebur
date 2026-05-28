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
  value?: number;      // For progress bars
  maxValue?: number;
  visible: boolean;
  // Button callbacks are handled server-side, client just sends click events
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

// Server → Client
export type ServerMessage =
  | { type: "init"; playerId: string; playerName: string; state: RenderState }
  | { type: "worldState"; state: RenderState }
  | { type: "objectUpdate"; id: string; changes: Partial<RenderObject> }
  | { type: "playerUpdate"; id: string; changes: Partial<RenderPlayer> }
  | { type: "guiUpdate"; gui: RenderGuiElement[] }
  | { type: "playerJoined"; player: RenderPlayer }
  | { type: "playerLeft"; playerId: string }
  | { type: "chat"; playerId: string; playerName: string; text: string }
  | { type: "scriptLog"; logs: string[] }
  | { type: "sound"; soundId: string; options?: { volume?: number; loop?: boolean; position?: Vec3 } }
  | { type: "error"; code: string; message: string };

// Client → Server
export type ClientMessage =
  | { type: "join"; sessionId: string; gameId: string; playerName: string; colors?: Record<string, string>; userId?: string }
  | { type: "input"; moveX: number; moveZ: number; jump: boolean; camY: number; sprint?: boolean }
  | { type: "guiClick"; elementId: string }
  | { type: "click3d"; objectId: string | null }
  | { type: "chat"; text: string }
  | { type: "action"; actionId: string; data?: any };

// ── Asset Request/Response ────────────────────────────────────────────────────

export interface AssetRequest {
  assetId: string;
  sessionToken: string;
}

export interface AssetResponse {
  url: string;           // Temporary signed URL
  expiresAt: number;     // Unix timestamp
}
