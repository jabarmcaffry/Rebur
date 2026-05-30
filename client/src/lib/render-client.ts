/**
 * render-client.ts — Thin client for receiving and interpolating server state
 *
 * This client contains NO game logic, physics, or scripting.
 * It only:
 *  1. Receives world state from the server
 *  2. Interpolates between states for smooth 60fps rendering
 *  3. Sends player inputs to the server
 *  4. Manages GUI click events
 *  5. Auto-reconnects with exponential backoff (max 30s) after drops
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
  /** Called when a reconnect attempt begins. arg = attempt number (1-based). */
  onReconnecting?: (attempt: number) => void;
  /** Called when the server broadcasts a network message via Rebur.Network.broadcast(). */
  onNetworkMessage?: (event: string, payload: any) => void;

  // Interpolation state
  private prevState: RenderState | null = null;
  private nextState: RenderState | null = null;
  private stateReceivedAt = 0;
  private readonly interpDelayMs = 100;

  // WebSocket
  private ws: WebSocket | null = null;
  private sessionId: string;
  private gameId: string;
  private username: string;
  private colors: Record<string, string>;
  private userId: string | undefined;

  // Reconnection
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;
  private readonly MIN_RECONNECT_MS = 500;
  private readonly MAX_RECONNECT_MS = 30_000;

  // Input state
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private _moveX = 0;
  private _moveZ = 0;
  private _jump = false;
  private _camY = 0;
  private _sprint = false;

  constructor(gameId: string, username: string, colors: Record<string, string> = {}, userId?: string) {
    this.sessionId = `game-${gameId}`;
    this.gameId = gameId;
    this.username = username;
    this.colors = colors;
    this.userId = userId;
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  connect() {
    this.intentionalDisconnect = false;
    this._openSocket();
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this._clearReconnectTimer();
    this._closeSocket();
    this.objects.clear();
    this.players.clear();
    this.gui = [];
  }

  private _openSocket() {
    try {
      let wsUrl: string;
      const apiBase: string =
        typeof import.meta !== "undefined"
          ? (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "")
          : "";
      if (apiBase) {
        wsUrl = apiBase.replace(/^http/, "ws") + "/ws";
      } else {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${proto}//${location.host}/ws`;
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this._send({
          type: "join",
          sessionId: this.sessionId,
          gameId: this.gameId,
          playerName: this.username,
          colors: this.colors,
          userId: this.userId,
        });
        this.inputTimer = setInterval(() => this._sendInput(), 50);
        this.onConnected?.();
      };

      this.ws.onmessage = (e) => {
        try {
          this._handleMessage(JSON.parse(e.data as string));
        } catch {
          // Malformed message — ignore
        }
      };

      this.ws.onclose = () => this._handleClose();
      this.ws.onerror  = () => this._handleClose();
    } catch {
      // WebSocket constructor failed (e.g. invalid URL)
      this._scheduleReconnect();
    }
  }

  private _handleClose() {
    this._clearInputTimer();
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.onDisconnected?.();

    if (!this.intentionalDisconnect) {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    if (this.intentionalDisconnect) return;
    this._clearReconnectTimer();
    this.reconnectAttempt++;
    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, 16s, 30s (cap)
    const delay = Math.min(
      this.MIN_RECONNECT_MS * Math.pow(2, this.reconnectAttempt - 1),
      this.MAX_RECONNECT_MS
    );
    this.onReconnecting?.(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalDisconnect) this._openSocket();
    }, delay);
  }

  private _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _clearInputTimer() {
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = null;
    }
  }

  private _closeSocket() {
    this._clearInputTimer();
    this.connected = false;
    this.ws?.close();
    this.ws = null;
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
        this.prevState = this.nextState;
        this.nextState = msg.state;
        this.stateReceivedAt = performance.now();
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

      case "networkMessage": {
        this.onNetworkMessage?.(msg.event, msg.payload);
        break;
      }
    }
  }

  private _applyState(state: RenderState) {
    this.objects.clear();
    for (const obj of state.objects) {
      this.objects.set(obj.id, obj);
    }

    this.players.clear();
    for (const player of state.players) {
      if (player.id !== this.localPlayerId) {
        this.players.set(player.id, player);
      }
    }

    this.gui = state.gui;
    this.lighting = state.lighting;
    this.camera = state.camera;

    this.onPlayersChanged?.();
    this.onObjectsChanged?.();
    this.onGuiChanged?.();
  }

  // ── Interpolation for Smooth Rendering ──────────────────────────────────────

  getInterpolatedState(): { objects: RenderObject[]; players: RenderPlayer[] } {
    if (!this.prevState || !this.nextState) {
      return {
        objects: Array.from(this.objects.values()),
        players: Array.from(this.players.values()),
      };
    }

    const elapsed = performance.now() - this.stateReceivedAt;
    const t = Math.min(1, Math.max(0, elapsed / this.interpDelayMs));

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

  getLocalPlayer(): RenderPlayer | null {
    if (!this.localPlayerId || !this.nextState) return null;
    return this.nextState.players.find(p => p.id === this.localPlayerId) ?? null;
  }

  // ── Input Handling ──────────────────────────────────────────────────────────

  updateInput(
    moveX: number, moveZ: number,
    jump: boolean, camY: number,
    sprint = false
  ) {
    this._moveX = moveX;
    this._moveZ = moveZ;
    this._jump  = this._jump || jump; // latch jump until sent
    this._camY  = camY;
    this._sprint = sprint;
  }

  private _sendInput() {
    this._send({
      type: "input",
      moveX: this._moveX,
      moveZ: this._moveZ,
      jump:  this._jump,
      camY:  this._camY,
      sprint: this._sprint,
    });
    this._jump = false; // reset jump latch after sending
  }

  // ── GUI Interaction ─────────────────────────────────────────────────────────

  clickGuiElement(elementId: string) {
    this._send({ type: "guiClick", elementId });
  }

  // ── 3D Object Click ─────────────────────────────────────────────────────────

  /**
   * Tell the server that the local player clicked on a 3D object.
   * Pass `null` if the click missed all objects (hit empty space).
   * The server fires `obj.on("clicked", player)` in scripts.
   */
  clickObject3d(objectId: string | null) {
    this._send({ type: "click3d", objectId });
  }

  // ── Key Events (for Rebur.Input.on("press"/"release")) ──────────────────────

  /** Fire Rebur.Input.on("press") for this key on the server. */
  sendKeyDown(key: string) {
    this._send({ type: "keyDown", key });
  }

  /** Fire Rebur.Input.on("release") for this key on the server. */
  sendKeyUp(key: string) {
    this._send({ type: "keyUp", key });
  }

  // ── Network (client→server custom events for Rebur.Network.on) ──────────────

  /** Fire Rebur.Network.on(event) handlers on the server. */
  sendNetworkMessage(event: string, payload?: any) {
    this._send({ type: "networkSend", event, payload });
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  sendChat(text: string) {
    this._send({ type: "chat", text });
  }
}
