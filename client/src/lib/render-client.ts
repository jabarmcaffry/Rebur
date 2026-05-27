/**
 * render-client.ts — Thin client for receiving and interpolating server state
 * 
 * This client contains NO game logic, physics, or scripting.
 * It only:
 *  1. Receives world state from the server
 *  2. Interpolates between states for smooth 60fps rendering
 *  3. Sends player inputs to the server
 *  4. Manages GUI click events
 */

import type {
  RenderState,
  RenderObject,
  RenderPlayer,
  RenderGuiElement,
  ServerMessage,
  ClientMessage,
  Vec3,
} from "@shared/render-types";

// ── Interpolation Helpers ─────────────────────────────────────────────────────

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  // Handle angle wrapping for smooth rotation interpolation
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// ── RenderClient Class ────────────────────────────────────────────────────────

export class RenderClient {
  // Current interpolated state for rendering
  readonly objects = new Map<string, RenderObject>();
  readonly players = new Map<string, RenderPlayer>();
  gui: RenderGuiElement[] = [];
  
  localPlayerId: string | null = null;
  localPlayerName: string | null = null;
  connected = false;
  
  // Lighting and camera from server
  lighting: RenderState["lighting"] = undefined;
  camera: RenderState["camera"] = undefined;
  
  // Callbacks
  onPlayersChanged?: () => void;
  onObjectsChanged?: () => void;
  onGuiChanged?: () => void;
  onChat?: (msg: { playerId: string; playerName: string; text: string }) => void;
  onScriptLog?: (logs: string[]) => void;
  onSound?: (soundId: string, options?: { volume?: number; loop?: boolean; position?: Vec3 }) => void;
  onError?: (err: { code: string; message: string }) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  
  // Interpolation state
  private prevState: RenderState | null = null;
  private nextState: RenderState | null = null;
  private stateReceivedAt = 0;
  private readonly interpDelayMs = 100; // Render 100ms behind server for smoothness
  
  // WebSocket
  private ws: WebSocket | null = null;
  private sessionId: string;
  private gameId: string;
  private username: string;
  private colors: Record<string, string>;
  
  // Input state
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private _moveX = 0;
  private _moveZ = 0;
  private _jump = false;
  private _camY = 0;
  private _sprint = false;
  
  private userId: string | undefined;

  constructor(gameId: string, username: string, colors: Record<string, string> = {}, userId?: string) {
    this.sessionId = `game-${gameId}`;
    this.gameId = gameId;
    this.username = username;
    this.colors = colors;
    this.userId = userId;
  }
  
  // ── Connection ──────────────────────────────────────────────────────────────
  
  connect() {
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${proto}//${location.host}/ws`);
      
      this.ws.onopen = () => {
        this.connected = true;
        this._send({
          type: "join",
          sessionId: this.sessionId,
          gameId: this.gameId,
          playerName: this.username,
          colors: this.colors,
          userId: this.userId,
        });
        // Send inputs at 20 Hz to match server tick rate
        this.inputTimer = setInterval(() => this._sendInput(), 50);
        this.onConnected?.();
      };
      
      this.ws.onmessage = (e) => {
        try {
          this._handleMessage(JSON.parse(e.data as string));
        } catch {
          // Malformed message
        }
      };
      
      this.ws.onclose = () => this._cleanup();
      this.ws.onerror = () => this._cleanup();
    } catch {
      // WebSocket unavailable
    }
  }
  
  disconnect() {
    this._cleanup();
    this.ws?.close();
    this.objects.clear();
    this.players.clear();
    this.gui = [];
  }
  
  private _cleanup() {
    this.connected = false;
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = null;
    }
    this.onDisconnected?.();
  }
  
  private _send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
  
  // ── Message Handling ────────────────────────────────────────────────────────
  
  private _handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "init": {
        this.localPlayerId = msg.playerId;
        this.localPlayerName = msg.playerName;
        this._applyState(msg.state);
        break;
      }
      
      case "worldState": {
        // Store for interpolation
        this.prevState = this.nextState;
        this.nextState = msg.state;
        this.stateReceivedAt = performance.now();
        
        // Apply immediately for non-interpolated data
        this.gui = msg.state.gui;
        this.lighting = msg.state.lighting;
        this.camera = msg.state.camera;
        this.onGuiChanged?.();
        break;
      }
      
      case "objectUpdate": {
        const obj = this.objects.get(msg.id);
        if (obj) {
          Object.assign(obj, msg.changes);
          this.onObjectsChanged?.();
        }
        break;
      }
      
      case "playerUpdate": {
        const player = this.players.get(msg.id);
        if (player) {
          Object.assign(player, msg.changes);
          this.onPlayersChanged?.();
        }
        break;
      }
      
      case "guiUpdate": {
        this.gui = msg.gui;
        this.onGuiChanged?.();
        break;
      }
      
      case "playerJoined": {
        if (msg.player.id !== this.localPlayerId) {
          this.players.set(msg.player.id, msg.player);
          this.onPlayersChanged?.();
        }
        break;
      }
      
      case "playerLeft": {
        this.players.delete(msg.playerId);
        this.onPlayersChanged?.();
        break;
      }
      
      case "chat": {
        this.onChat?.({
          playerId: msg.playerId,
          playerName: msg.playerName,
          text: msg.text,
        });
        break;
      }
      
      case "scriptLog": {
        this.onScriptLog?.(msg.logs);
        break;
      }
      
      case "sound": {
        this.onSound?.(msg.soundId, msg.options);
        break;
      }
      
      case "error": {
        this.onError?.({ code: msg.code, message: msg.message });
        break;
      }
    }
  }
  
  private _applyState(state: RenderState) {
    // Objects
    this.objects.clear();
    for (const obj of state.objects) {
      this.objects.set(obj.id, obj);
    }
    
    // Players (excluding local player which is handled separately)
    this.players.clear();
    for (const player of state.players) {
      if (player.id !== this.localPlayerId) {
        this.players.set(player.id, player);
      }
    }
    
    // GUI
    this.gui = state.gui;
    
    // Lighting and camera
    this.lighting = state.lighting;
    this.camera = state.camera;
    
    this.onPlayersChanged?.();
    this.onObjectsChanged?.();
    this.onGuiChanged?.();
  }
  
  // ── Interpolation for Smooth Rendering ──────────────────────────────────────
  
  /**
   * Get interpolated state for rendering at 60fps.
   * Call this every frame with the current timestamp.
   */
  getInterpolatedState(): { objects: RenderObject[]; players: RenderPlayer[] } {
    if (!this.prevState || !this.nextState) {
      return {
        objects: Array.from(this.objects.values()),
        players: Array.from(this.players.values()),
      };
    }
    
    // Calculate interpolation factor (0-1)
    const elapsed = performance.now() - this.stateReceivedAt;
    const t = Math.min(1, Math.max(0, elapsed / this.interpDelayMs));
    
    // Interpolate objects
    const interpObjects: RenderObject[] = [];
    for (const nextObj of this.nextState.objects) {
      const prevObj = this.prevState.objects.find(o => o.id === nextObj.id);
      if (prevObj) {
        interpObjects.push({
          ...nextObj,
          position: lerpVec3(prevObj.position, nextObj.position, t),
          rotation: {
            x: lerpAngle(prevObj.rotation.x, nextObj.rotation.x, t),
            y: lerpAngle(prevObj.rotation.y, nextObj.rotation.y, t),
            z: lerpAngle(prevObj.rotation.z, nextObj.rotation.z, t),
          },
        });
      } else {
        interpObjects.push(nextObj);
      }
    }
    
    // Interpolate players
    const interpPlayers: RenderPlayer[] = [];
    for (const nextPlayer of this.nextState.players) {
      if (nextPlayer.id === this.localPlayerId) continue;
      const prevPlayer = this.prevState.players.find(p => p.id === nextPlayer.id);
      if (prevPlayer) {
        interpPlayers.push({
          ...nextPlayer,
          position: lerpVec3(prevPlayer.position, nextPlayer.position, t),
          rotation: {
            x: lerpAngle(prevPlayer.rotation.x, nextPlayer.rotation.x, t),
            y: lerpAngle(prevPlayer.rotation.y, nextPlayer.rotation.y, t),
            z: lerpAngle(prevPlayer.rotation.z, nextPlayer.rotation.z, t),
          },
        });
      } else {
        interpPlayers.push(nextPlayer);
      }
    }
    
    return { objects: interpObjects, players: interpPlayers };
  }
  
  /**
   * Get the local player's state from the latest server update.
   * This is used for camera positioning and local prediction.
   */
  getLocalPlayer(): RenderPlayer | null {
    if (!this.localPlayerId || !this.nextState) return null;
    return this.nextState.players.find(p => p.id === this.localPlayerId) ?? null;
  }
  
  // ── Input Handling ──────────────────────────────────────────────────────────
  
  /**
   * Update the input state. Call this every frame with the current input.
   */
  updateInput(moveX: number, moveZ: number, jump: boolean, camY: number, sprint = false) {
    this._moveX = moveX;
    this._moveZ = moveZ;
    this._jump = this._jump || jump; // Latch jump until sent
    this._camY = camY;
    this._sprint = sprint;
  }
  
  private _sendInput() {
    this._send({
      type: "input",
      moveX: this._moveX,
      moveZ: this._moveZ,
      jump: this._jump,
      camY: this._camY,
      sprint: this._sprint,
    });
    this._jump = false; // Reset jump latch after sending
  }
  
  // ── GUI Interaction ─────────────────────────────────────────────────────────
  
  /**
   * Send a GUI element click to the server.
   */
  clickGuiElement(elementId: string) {
    this._send({ type: "guiClick", elementId });
  }
  
  // ── Chat ────────────────────────────────────────────────────────────────────
  
  /**
   * Send a chat message to all players.
   */
  sendChat(text: string) {
    this._send({ type: "chat", text });
  }
  
  // ── Custom Actions ──────────────────────────────────────────────────────────
  
  /**
   * Send a custom action to the server (e.g., use item, interact).
   */
  sendAction(actionId: string, data?: any) {
    this._send({ type: "action", actionId, data });
  }
}
