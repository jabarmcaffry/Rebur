/**
 * Server/Client Authority System
 * 
 * This module defines which code runs where in a client-server architecture:
 * 
 * SERVER-SIDE (Authoritative):
 * - Physics simulation
 * - Collision detection and resolution
 * - Game state management
 * - NPC/AI logic
 * - Score/health/inventory validation
 * - Server scripts (ServerScriptService)
 * 
 * CLIENT-SIDE (Predicted/Interpolated):
 * - Input handling
 * - Camera control
 * - UI/GUI rendering
 * - Local visual effects
 * - Sound playback
 * - Client scripts (StarterPlayer/LocalScript)
 * 
 * SHARED (Replicated):
 * - Module scripts (ReplicatedStorage)
 * - World state snapshots
 * - Object positions/rotations
 */

import type { RuntimeObject, RuntimePlayer, Vec3 } from "../types";

/** Authority context - passed to systems to determine execution context */
export type AuthorityContext = "server" | "client" | "local";

/** Script types and their execution context */
export const SCRIPT_AUTHORITY: Record<string, AuthorityContext> = {
  Script: "server",
  LocalScript: "client",
  ModuleScript: "local", // Can run on both, imported where needed
};

/** Container authority mapping */
export const CONTAINER_AUTHORITY: Record<string, AuthorityContext> = {
  Workspace: "server",           // Objects owned by server
  Lighting: "server",            // Lighting owned by server
  ServerScriptService: "server", // Server scripts only
  StarterPlayer: "client",       // Client scripts
  Players: "client",             // Player-local data
  ReplicatedStorage: "local",    // Shared modules
};

/**
 * Server-side state that should never be modified by clients.
 * The server is authoritative over these values.
 */
export interface ServerAuthorityState {
  // Game state
  tick: number;
  serverTime: number;
  
  // Object state (authoritative positions)
  objects: Map<string, ServerObjectState>;
  
  // Player state (authoritative)
  players: Map<string, ServerPlayerState>;
  
  // Global game state
  gameState: Map<string, unknown>;
}

export interface ServerObjectState {
  id: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  velocity: Vec3;
  anchored: boolean;
  canCollide: boolean;
  visible: boolean;
  health?: number;
  owner?: string; // Player ID who owns this object
}

export interface ServerPlayerState {
  id: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  health: number;
  score: number;
  team?: string;
  lastInputTick: number;
  lastInputTime: number;
}

/**
 * Client-side state that is predicted locally and reconciled with server.
 */
export interface ClientAuthorityState {
  // Local player input
  pendingInputs: InputFrame[];
  
  // Predicted state (before server confirmation)
  predictedPosition: Vec3;
  predictedVelocity: Vec3;
  
  // Server reconciliation
  lastServerTick: number;
  lastServerPosition: Vec3;
  
  // Visual interpolation
  renderPosition: Vec3;
  renderRotation: Vec3;
}

export interface InputFrame {
  tick: number;
  clientTime: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
}

/**
 * Authority Manager - handles the split between server and client logic.
 */
export class AuthorityManager {
  private context: AuthorityContext;
  private serverState: ServerAuthorityState;
  private clientState: ClientAuthorityState;
  
  constructor(context: AuthorityContext = "local") {
    this.context = context;
    
    this.serverState = {
      tick: 0,
      serverTime: 0,
      objects: new Map(),
      players: new Map(),
      gameState: new Map(),
    };
    
    this.clientState = {
      pendingInputs: [],
      predictedPosition: { x: 0, y: 0, z: 0 },
      predictedVelocity: { x: 0, y: 0, z: 0 },
      lastServerTick: 0,
      lastServerPosition: { x: 0, y: 0, z: 0 },
      renderPosition: { x: 0, y: 0, z: 0 },
      renderRotation: { x: 0, y: 0, z: 0 },
    };
  }

  get isServer(): boolean {
    return this.context === "server" || this.context === "local";
  }

  get isClient(): boolean {
    return this.context === "client" || this.context === "local";
  }

  get isLocal(): boolean {
    return this.context === "local";
  }

  /**
   * Check if a script should run in the current context.
   */
  shouldRunScript(scriptType: string): boolean {
    const authority = SCRIPT_AUTHORITY[scriptType] ?? "local";
    
    if (authority === "local") return true;
    if (authority === "server") return this.isServer;
    if (authority === "client") return this.isClient;
    
    return false;
  }

  /**
   * Check if an operation on a container is allowed in the current context.
   */
  canModifyContainer(container: string): boolean {
    const authority = CONTAINER_AUTHORITY[container] ?? "server";
    
    if (authority === "local") return true;
    if (authority === "server") return this.isServer;
    if (authority === "client") return this.isClient;
    
    return false;
  }

  /**
   * Check if a specific property modification is allowed.
   * Server-authoritative properties cannot be modified by clients.
   */
  canModifyProperty(objectId: string, property: string): boolean {
    // Server-authoritative properties
    const serverOnly = ["health", "score", "team", "position", "velocity"];
    
    if (this.isLocal) return true; // Local mode allows all
    if (this.isServer) return true; // Server can modify anything
    
    // Client can only modify non-authoritative properties
    return !serverOnly.includes(property);
  }

  /**
   * Register a server-side object state.
   */
  registerObject(obj: RuntimeObject): void {
    if (!this.isServer) return;
    
    this.serverState.objects.set(obj.id, {
      id: obj.id,
      position: { ...obj.position },
      rotation: { ...obj.rotation },
      scale: { ...obj.scale },
      velocity: { ...obj.velocity },
      anchored: obj.anchored,
      canCollide: obj.canCollide,
      visible: obj.visible,
    });
  }

  /**
   * Update server-side object state.
   */
  updateObject(obj: RuntimeObject): void {
    if (!this.isServer) return;
    
    const state = this.serverState.objects.get(obj.id);
    if (state) {
      state.position = { ...obj.position };
      state.rotation = { ...obj.rotation };
      state.velocity = { ...obj.velocity };
      state.visible = obj.visible;
    }
  }

  /**
   * Register a player on the server.
   */
  registerPlayer(player: RuntimePlayer): void {
    if (!this.isServer) return;
    
    this.serverState.players.set(player.username, {
      id: player.username,
      position: { ...player.position },
      rotation: { ...player.rotation },
      velocity: { ...player.velocity },
      health: player.health,
      score: 0,
      lastInputTick: 0,
      lastInputTime: 0,
    });
  }

  /**
   * Process client input on the server.
   */
  processInput(playerId: string, input: InputFrame): void {
    if (!this.isServer) return;
    
    const state = this.serverState.players.get(playerId);
    if (!state) return;
    
    // Validate input timing (anti-cheat)
    if (input.tick <= state.lastInputTick) return;
    
    state.lastInputTick = input.tick;
    state.lastInputTime = input.clientTime;
  }

  /**
   * Apply server reconciliation on the client.
   */
  reconcile(serverTick: number, serverPosition: Vec3): void {
    if (!this.isClient) return;
    
    this.clientState.lastServerTick = serverTick;
    this.clientState.lastServerPosition = { ...serverPosition };
    
    // Re-apply inputs after the server tick
    this.clientState.pendingInputs = this.clientState.pendingInputs.filter(
      input => input.tick > serverTick
    );
    
    // Reset prediction from server state
    this.clientState.predictedPosition = { ...serverPosition };
    
    // Re-predict using remaining inputs
    for (const input of this.clientState.pendingInputs) {
      this.applyInput(input);
    }
  }

  /**
   * Apply an input locally for prediction.
   */
  applyInput(input: InputFrame): void {
    const speed = 6; // Base move speed
    const dt = 1 / 60; // Fixed timestep
    
    this.clientState.predictedVelocity.x = input.moveX * speed;
    this.clientState.predictedVelocity.z = input.moveZ * speed;
    
    this.clientState.predictedPosition.x += this.clientState.predictedVelocity.x * dt;
    this.clientState.predictedPosition.z += this.clientState.predictedVelocity.z * dt;
  }

  /**
   * Queue an input for sending to server and local prediction.
   */
  queueInput(input: InputFrame): void {
    if (!this.isClient) return;
    
    this.clientState.pendingInputs.push(input);
    this.applyInput(input);
  }

  /**
   * Get the current server tick.
   */
  get tick(): number {
    return this.serverState.tick;
  }

  /**
   * Advance the server tick.
   */
  advanceTick(): void {
    if (!this.isServer) return;
    this.serverState.tick++;
    this.serverState.serverTime = performance.now();
  }

  /**
   * Get a snapshot of server state for network sync.
   */
  getServerSnapshot(): ServerAuthorityState {
    return {
      tick: this.serverState.tick,
      serverTime: this.serverState.serverTime,
      objects: new Map(this.serverState.objects),
      players: new Map(this.serverState.players),
      gameState: new Map(this.serverState.gameState),
    };
  }

  /**
   * Get the interpolated render position for smooth visuals.
   */
  getRenderPosition(alpha: number): Vec3 {
    // Interpolate between last server position and predicted position
    const pred = this.clientState.predictedPosition;
    const serv = this.clientState.lastServerPosition;
    
    return {
      x: serv.x + (pred.x - serv.x) * alpha,
      y: serv.y + (pred.y - serv.y) * alpha,
      z: serv.z + (pred.z - serv.z) * alpha,
    };
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.serverState.objects.clear();
    this.serverState.players.clear();
    this.serverState.gameState.clear();
    this.serverState.tick = 0;
    this.clientState.pendingInputs = [];
  }
}

/**
 * Global authority manager instance.
 * Default is "local" mode which allows both server and client operations.
 */
export const globalAuthority = new AuthorityManager("local");

/**
 * Create a server-side script context.
 */
export function createServerContext() {
  return new AuthorityManager("server");
}

/**
 * Create a client-side script context.
 */
export function createClientContext() {
  return new AuthorityManager("client");
}
