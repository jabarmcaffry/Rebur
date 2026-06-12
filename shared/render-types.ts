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
  parentId?: string | null;
  properties?: Record<string, any> | null;
  modelUrl?: string;
  modelScale?: number;
  audioUrl?: string;
  animation?: string | null;
  animationSpeed?: number;
  animationLoop?: boolean;
  health?: number;
  maxHealth?: number;
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
      objectName: string;
      offset: Vec3;
      rotation: Vec3;
    } | null;
  };
}

// ── GUI Elements ──────────────────────────────────────────────────────────────

export interface RenderGuiElement {
  id: string;
  kind: "text" | "button" | "image" | "bar" | "frame";
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: "topLeft" | "topCenter" | "topRight" | "centerLeft" | "center" | "centerRight" | "bottomLeft" | "bottomCenter" | "bottomRight";
  color: string;
  fontSize: number;
  backgroundColor?: string;
  imageUrl?: string;
  value?: number;
  maxValue?: number;
  visible: boolean;
  clickable?: boolean;
  parentId?: string | null;
  zIndex?: number;
  opacity?: number;
  cornerRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

// ── Debug Visualization ───────────────────────────────────────────────────────

export interface DebugDraw {
  id: string;
  kind: "ray" | "point" | "box" | "sphere";
  origin: Vec3;
  direction?: Vec3;   // for "ray"
  length?: number;    // for "ray"
  size?: Vec3;        // for "box" (full extents)
  radius?: number;    // for "point" / "sphere"
  color: string;
  duration: number;   // seconds; 0 = one render frame
}

// ── Particle Events ───────────────────────────────────────────────────────────

export interface ParticleEvent {
  id: string;
  position: Vec3;
  effectType:
    | "explosion"
    | "muzzleFlash"
    | "smoke"
    | "sparkle"
    | "hit"
    | "pickup"
    | "fire"
    | "blood"
    | "custom";
  color?: string;
  count?: number;
  speed?: number;
  size?: number;
  lifetime?: number;
  direction?: Vec3;
  spread?: number;
  isPersistent?: boolean; // If true, this is a continuous emitter, not a one-shot burst
  rate?: number;         // Particles per second for persistent emitters
  objectId?: string;    // If attached to an object
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
  debugDraws?: DebugDraw[];
  particleEvents?: ParticleEvent[];
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
  | { type: "error"; code: string; message: string }
  | { type: "networkMessage"; event: string; payload: any };

// Client → Server
export type ClientMessage =
  | { type: "join"; sessionId: string; gameId: string; playerName: string; colors?: Record<string, string>; userId?: string }
  | { type: "input"; moveX: number; moveZ: number; jump: boolean; camY: number; sprint?: boolean;
      cameraPos?: Vec3; cameraForward?: Vec3 }
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
