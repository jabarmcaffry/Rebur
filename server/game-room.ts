/**
 * game-room.ts — Server-side game room
 *
 * Each active session gets one GameRoom. The room:
 *  - Tracks player states (position, velocity, inputs)
 *  - Runs a 20 Hz physics tick (gravity, ground, basic AABB collision)
 *  - Broadcasts authoritative worldState to every client in the session
 */

const TICK_MS = 50;        // 20 Hz
const GRAVITY = -28;       // m/s²
const MOVE_SPEED = 14;     // m/s
const JUMP_VEL = 14;       // m/s upward
const PLAYER_HALF_H = 0.9; // half of 1.8 m avatar height
const PLAYER_RADIUS = 0.4; // XZ collision radius

interface PlayerState {
  id: string;
  name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotY: number;
  onGround: boolean;
  // inputs
  moveX: number;
  moveZ: number;
  jumpQueued: boolean;
  camY: number;
  // avatar colours (forwarded from client)
  shirtColor?: string;
  skinColor?: string;
  pantsColor?: string;
}

interface StaticBox {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export class GameRoom {
  private players = new Map<string, PlayerState>();
  private statics: StaticBox[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();

  constructor(private readonly broadcastFn: (msg: object, excludeId?: string) => void) {}

  /** Load static world geometry for server-side collision. */
  setStaticObjects(objects: any[]) {
    this.statics = objects
      .filter(o =>
        (o.container === 'Workspace' || !o.container) &&
        o.type !== 'light' &&
        o.type !== 'folder' &&
        o.type !== 'model' &&
        o.properties?.anchored !== false
      )
      .map(o => {
        const hx = (o.scaleX ?? 1) / 2;
        const hy = (o.scaleY ?? 1) / 2;
        const hz = (o.scaleZ ?? 1) / 2;
        return {
          minX: (o.positionX ?? 0) - hx, maxX: (o.positionX ?? 0) + hx,
          minY: (o.positionY ?? 0) - hy, maxY: (o.positionY ?? 0) + hy,
          minZ: (o.positionZ ?? 0) - hz, maxZ: (o.positionZ ?? 0) + hz,
        };
      });
  }

  addPlayer(id: string, name: string, x = 0, y = 5, z = 0, colors?: Record<string, string>) {
    this.players.set(id, {
      id, name,
      x, y, z,
      vx: 0, vy: 0, vz: 0,
      rotY: 0,
      onGround: false,
      moveX: 0, moveZ: 0,
      jumpQueued: false,
      camY: 0,
      ...colors,
    });
    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }

  removePlayer(id: string) {
    this.players.delete(id);
    if (this.players.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Client sends raw input — server physics drives position. */
  applyInput(id: string, moveX: number, moveZ: number, jump: boolean, rotY: number, camY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.moveX = moveX;
    p.moveZ = moveZ;
    if (jump) p.jumpQueued = true;
    p.rotY = rotY;
    p.camY = camY;
  }

  /** Client also reports its locally-computed position as a fallback. */
  syncPosition(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x; p.y = y; p.z = z; p.rotY = rotY;
  }

  private _tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;

    for (const p of this.players.values()) {
      // Gravity
      p.vy += GRAVITY * dt;

      // Camera-relative XZ movement
      const cos = Math.cos(p.camY);
      const sin = Math.sin(p.camY);
      p.vx = (p.moveX * cos + p.moveZ * sin) * MOVE_SPEED;
      p.vz = (-p.moveX * sin + p.moveZ * cos) * MOVE_SPEED;

      // Jump (consumed once)
      if (p.jumpQueued && p.onGround) {
        p.vy = JUMP_VEL;
        p.onGround = false;
      }
      p.jumpQueued = false;

      // Integrate position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Ground-plane collision
      p.onGround = false;
      if (p.y <= PLAYER_HALF_H) {
        p.y = PLAYER_HALF_H;
        if (p.vy < 0) p.vy = 0;
        p.onGround = true;
      }

      // Static AABB push-out
      for (const b of this.statics) {
        const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
        const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
        const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
        if (ox > 0 && oy > 0 && oz > 0) {
          const min = Math.min(ox, oy, oz);
          if (min === oy) {
            if (p.y > (b.minY + b.maxY) / 2) {
              p.y += oy;
              if (p.vy < 0) { p.vy = 0; p.onGround = true; }
            } else {
              p.y -= oy;
              if (p.vy > 0) p.vy = 0;
            }
          } else if (min === ox) {
            if (p.x > (b.minX + b.maxX) / 2) p.x += ox; else p.x -= ox;
            p.vx = 0;
          } else {
            if (p.z > (b.minZ + b.maxZ) / 2) p.z += oz; else p.z -= oz;
            p.vz = 0;
          }
        }
      }
    }

    // Broadcast authoritative world state to every connected client
    if (this.players.size > 0) {
      this.broadcastFn({
        type: 'worldState',
        players: Array.from(this.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          position: { x: p.x, y: p.y, z: p.z },
          rotY: p.rotY,
          onGround: p.onGround,
          shirtColor: p.shirtColor,
          skinColor: p.skinColor,
          pantsColor: p.pantsColor,
        })),
      });
    }
  }

  get playerCount() { return this.players.size; }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}
