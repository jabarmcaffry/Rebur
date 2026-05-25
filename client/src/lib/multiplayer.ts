/**
 * multiplayer.ts — WebSocket multiplayer client
 *
 * Connects to the /ws endpoint, joins a session keyed by gameId,
 * sends player inputs and position to the server, and handles:
 *   - worldState  → authoritative positions for ALL players + world objects
 *   - playerJoined / playerLeft / playerMoved → roster updates
 *   - chat        → incoming chat messages from other players
 *   - scriptLog   → server-side script console output
 *   - init        → initial player list on connect
 */

export type RemotePlayer = {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  onGround?: boolean;
  shirtColor?: string;
  skinColor?: string;
  pantsColor?: string;
};

export type ChatMessage = {
  playerId: string;
  playerName: string;
  text: string;
};

export type ServerObject = {
  x: number; y: number; z: number;
  rotX: number; rotY: number; rotZ: number;
  color?: string; visible?: boolean;
};

export class MultiplayerManager {
  readonly remotePlayers = new Map<string, RemotePlayer>();
  /** Live server-authoritative object positions, keyed by object id. */
  readonly serverObjects = new Map<string, ServerObject>();

  myPlayerId: string | null = null;
  myPlayerName: string | null = null;
  connected = false;

  onPlayersChanged?: () => void;
  onObjectsChanged?: () => void;
  onChat?: (msg: ChatMessage) => void;
  onScriptLog?: (lines: string[]) => void;
  onError?: (err: { code: string; message: string }) => void;

  private ws: WebSocket | null = null;
  private sessionId: string;
  private gameId: string;
  private username: string;
  private colors: Record<string, string>;

  private moveTimer: ReturnType<typeof setInterval> | null = null;
  private _pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private _rot = 0;
  private _moveX = 0;
  private _moveZ = 0;
  private _jump = false;
  private _camY = 0;

  constructor(gameId: string, username: string, colors: Record<string, string> = {}) {
    this.sessionId = `game-${gameId}`;
    this.gameId = gameId;
    this.username = username;
    this.colors = colors;
  }

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
        });
        // Send position + inputs at 20 Hz
        this.moveTimer = setInterval(() => this._flush(), 50);
      };

      this.ws.onmessage = (e) => {
        try { this._handle(JSON.parse(e.data as string)); } catch { /* malformed */ }
      };

      this.ws.onclose = () => { this._cleanup(); };
      this.ws.onerror = () => { this._cleanup(); };
    } catch {
      // WebSocket unavailable in some proxy/dev setups
    }
  }

  private _cleanup() {
    this.connected = false;
    if (this.moveTimer) { clearInterval(this.moveTimer); this.moveTimer = null; }
  }

  private _send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _handle(msg: any) {
    switch (msg.type) {

      case "init": {
        this.myPlayerId = msg.playerId;
        this.myPlayerName = msg.playerName ?? this.username;
        for (const p of (msg.players ?? [])) {
          if (p.id !== this.myPlayerId) {
            this.remotePlayers.set(p.id, {
              id: p.id,
              username: p.playerName || "Player",
              position: { x: p.positionX ?? 0, y: p.positionY ?? 5, z: p.positionZ ?? 0 },
              rotationY: p.rotationY ?? 0,
            });
          }
        }
        this.onPlayersChanged?.();
        break;
      }

      case "playerJoined": {
        const p = msg.player;
        if (p?.id && p.id !== this.myPlayerId) {
          this.remotePlayers.set(p.id, {
            id: p.id,
            username: p.playerName || "Player",
            position: { x: 0, y: 5, z: 0 },
            rotationY: 0,
          });
          this.onPlayersChanged?.();
        }
        break;
      }

      case "playerMoved": {
        const rp = this.remotePlayers.get(msg.playerId);
        if (rp) {
          rp.position = msg.position;
          rp.rotationY = msg.rotation;
        }
        break;
      }

      case "worldState": {
        // ── Players ──────────────────────────────────────────────────────────
        for (const sp of (msg.players ?? [])) {
          if (sp.id === this.myPlayerId) continue;
          let rp = this.remotePlayers.get(sp.id);
          if (!rp) {
            rp = {
              id: sp.id,
              username: sp.name || "Player",
              position: sp.position ?? { x: 0, y: 5, z: 0 },
              rotationY: sp.rotY ?? 0,
            };
            this.remotePlayers.set(sp.id, rp);
            this.onPlayersChanged?.();
          } else {
            rp.position = sp.position ?? rp.position;
            rp.rotationY = sp.rotY ?? rp.rotationY;
            rp.onGround = sp.onGround;
            if (sp.shirtColor) rp.shirtColor = sp.shirtColor;
            if (sp.skinColor)  rp.skinColor  = sp.skinColor;
            if (sp.pantsColor) rp.pantsColor = sp.pantsColor;
          }
        }
        // Remove players absent from worldState
        const activeIds = new Set((msg.players ?? []).map((p: any) => p.id));
        for (const id of this.remotePlayers.keys()) {
          if (!activeIds.has(id)) {
            this.remotePlayers.delete(id);
            this.onPlayersChanged?.();
          }
        }

        // ── World objects (dynamic + script-driven) ───────────────────────
        if (Array.isArray(msg.objects) && msg.objects.length > 0) {
          for (const so of msg.objects as any[]) {
            this.serverObjects.set(so.id, {
              x: so.x ?? 0, y: so.y ?? 0, z: so.z ?? 0,
              rotX: so.rotX ?? 0, rotY: so.rotY ?? 0, rotZ: so.rotZ ?? 0,
              color: so.color,
              visible: so.visible,
            });
          }
          this.onObjectsChanged?.();
        }
        break;
      }

      case "playerLeft": {
        this.remotePlayers.delete(msg.playerId);
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
        if (Array.isArray(msg.logs)) {
          this.onScriptLog?.(msg.logs as string[]);
        }
        break;
      }

      case "error": {
        this.onError?.({ code: msg.code ?? "UNKNOWN", message: msg.message ?? "Server error" });
        break;
      }
    }
  }

  /** Call every frame so the manager tracks the latest local position. */
  updatePosition(pos: { x: number; y: number; z: number }, rotY: number) {
    this._pos = pos;
    this._rot = rotY;
  }

  /** Call every frame with current input state for server-side physics. */
  updateInput(moveX: number, moveZ: number, jump: boolean, camY: number) {
    this._moveX = moveX;
    this._moveZ = moveZ;
    this._jump = this._jump || jump; // latch until flushed
    this._camY = camY;
  }

  /** Send a chat message through the server (broadcast to all players). */
  sendChat(text: string) {
    this._send({ type: "chat", text });
  }

  private _flush() {
    this._send({
      type: "input",
      moveX: this._moveX,
      moveZ: this._moveZ,
      jump: this._jump,
      rotY: this._rot,
      camY: this._camY,
    });
    this._send({
      type: "move",
      position: this._pos,
      rotation: this._rot,
    });
    this._jump = false;
  }

  getPlayerList(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  disconnect() {
    this._cleanup();
    this.ws?.close();
    this.remotePlayers.clear();
    this.serverObjects.clear();
  }
}
