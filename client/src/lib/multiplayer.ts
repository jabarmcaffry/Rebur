/**
 * multiplayer.ts — WebSocket multiplayer client
 *
 * Connects to the /ws endpoint, joins a session keyed by gameId,
 * broadcasts the local player position every 100 ms, and maintains
 * a live map of remote players that PlayMode uses for the leaderboard.
 */

export type RemotePlayer = {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
};

export class MultiplayerManager {
  readonly remotePlayers = new Map<string, RemotePlayer>();
  myPlayerId: string | null = null;
  connected = false;

  onPlayersChanged?: () => void;

  private ws: WebSocket | null = null;
  private sessionId: string;
  private username: string;
  private moveTimer: ReturnType<typeof setInterval> | null = null;
  private _pos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private _rot = 0;

  constructor(gameId: string, username: string) {
    this.sessionId = `game-${gameId}`;
    this.username = username;
  }

  connect() {
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${proto}//${location.host}/ws`);

      this.ws.onopen = () => {
        this.connected = true;
        this._send({ type: "join", sessionId: this.sessionId, playerName: this.username });
        this.moveTimer = setInterval(() => this._flushPosition(), 100);
      };

      this.ws.onmessage = (e) => {
        try { this._handle(JSON.parse(e.data as string)); } catch { /* ignore malformed */ }
      };

      this.ws.onclose = () => { this._cleanup(); };
      this.ws.onerror = () => { this._cleanup(); };
    } catch {
      // WebSocket unavailable (e.g. dev over plain HTTP with proxy restrictions)
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
        if (rp) { rp.position = msg.position; rp.rotationY = msg.rotation; }
        break;
      }
      case "playerLeft": {
        this.remotePlayers.delete(msg.playerId);
        this.onPlayersChanged?.();
        break;
      }
    }
  }

  /** Call each frame so the manager tracks the latest position without a per-frame send. */
  updatePosition(pos: { x: number; y: number; z: number }, rotY: number) {
    this._pos = pos;
    this._rot = rotY;
  }

  private _flushPosition() {
    this._send({ type: "move", position: this._pos, rotation: this._rot });
  }

  getPlayerList(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  disconnect() {
    this._cleanup();
    this.ws?.close();
    this.remotePlayers.clear();
  }
}
