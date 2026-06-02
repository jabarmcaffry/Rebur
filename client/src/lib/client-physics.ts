import type { Vec3 } from "@shared/render-types";

/**
 * ClientPhysics — client-side physics prediction for the local player.
 *
 * Coordinate convention (mirrors server/game-room.ts exactly):
 *   position.y = render position = physics_center_y - PLAYER_HALF_H
 *   i.e. it's approximately the player's feet level.
 *
 * Server constants mirrored here so prediction stays in sync:
 *   GRAVITY       = -28  (m/s²)
 *   PLAYER_HALF_H =  0.9 (half the capsule height)
 *   PLAYER_RADIUS =  0.4 (capsule radius)
 */

interface Collider {
  id: string;
  name: string;
  position: Vec3;
  scale: Vec3;
  type: string;
  anchored: boolean;
  canCollide: boolean;
}

interface PredictedState {
  position: Vec3;
  rotation: { x: number; y: number; z: number };
  velocity: Vec3;
  onGround: boolean;
  animation: string;
}

const GRAVITY       = -28;
const PLAYER_HALF_H =  0.9;
const PLAYER_RADIUS =  0.4;
const WALK_SPEED    = 16;
const SPRINT_SPEED  = 24;
const JUMP_FORCE    = 14;
const VISUAL_LERP   = 0.3;
const KILL_Y        = -50;

export class ClientPhysics {
  /**
   * position.y = render Y = physics center Y - PLAYER_HALF_H
   * (matches what the server sends in RenderPlayer.position.y)
   */
  private position: Vec3 = { x: 0, y: 1.5, z: 0 };
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  private rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private onGround = false;
  private animation = "idle";
  private colliders: Collider[] = [];

  private visualPosition: Vec3 = { x: 0, y: 1.5, z: 0 };
  private visualRotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  private initialized = false;

  setColliders(colliders: Collider[]): void {
    this.colliders = colliders.filter((c) => c.canCollide !== false && c.anchored !== false);
  }

  /**
   * Reconcile client prediction with the server's authoritative state.
   * position here is the render position (same coordinate as position.y stored here).
   */
  reconcileWithServer(
    position: Vec3,
    velocity: Vec3,
    rotationY: number,
    onGround: boolean
  ): void {
    if (!this.initialized) {
      // First reconcile — snap immediately to server position.
      this.position = { ...position };
      this.visualPosition = { ...position };
      this.velocity = { ...velocity };
      this.rotation.y = rotationY;
      this.onGround = onGround;
      this.initialized = true;
      return;
    }

    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    const dz = position.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 2) {
      // Large divergence — snap.
      this.position = { ...position };
      this.visualPosition = { ...position };
    } else if (dist > 0.05) {
      // Small divergence — soft correction (30% per reconcile call).
      this.position.x += dx * 0.3;
      this.position.y += dy * 0.3;
      this.position.z += dz * 0.3;
    }

    // Always sync velocity and ground state from server.
    this.velocity = { ...velocity };
    this.rotation.y = rotationY;
    this.onGround = onGround;
  }

  applyInput(
    moveX: number,
    moveZ: number,
    jump: boolean,
    cameraYaw: number,
    sprint: boolean,
    dt: number
  ): void {
    // ── Reset ground state each tick (server does the same thing) ────────────
    // _resolveCollisions will set it back to true if the player touches ground.
    const wasOnGround = this.onGround;
    this.onGround = false;

    // ── Horizontal movement ───────────────────────────────────────────────────
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);

    // Camera-relative input → world directions (matches server applyInput formula)
    const worldX = (-moveX * cosYaw - moveZ * sinYaw);
    const worldZ = ( moveX * sinYaw - moveZ * cosYaw);

    const mag = Math.sqrt(worldX * worldX + worldZ * worldZ);
    if (mag > 0) {
      this.velocity.x = (worldX / mag) * speed;
      this.velocity.z = (worldZ / mag) * speed;
      this.rotation.y = Math.atan2(worldX, worldZ);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // ── Jump ─────────────────────────────────────────────────────────────────
    if (jump && wasOnGround) {
      this.velocity.y = JUMP_FORCE;
    }

    // ── Gravity (always — _resolveCollisions cancels it when on solid floor) ─
    this.velocity.y += GRAVITY * dt;

    // ── Integrate position ────────────────────────────────────────────────────
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // ── Collision resolution ──────────────────────────────────────────────────
    this._resolveCollisions();

    // ── Kill plane ────────────────────────────────────────────────────────────
    if (this.position.y < KILL_Y) {
      this.position.y = 1.5;
      this.velocity.y = 0;
    }

    // ── Animation ─────────────────────────────────────────────────────────────
    const hspd = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (!this.onGround) {
      this.animation = this.velocity.y > 1 ? "jump" : "fall";
    } else if (hspd > speed * 0.8) {
      this.animation = "run";
    } else if (hspd > 0.5) {
      this.animation = "walk";
    } else {
      this.animation = "idle";
    }
  }

  /**
   * Collision resolution against static colliders.
   *
   * Matches the server's _pushPlayerOutOfStatics logic:
   *   physics center Y = this.position.y + PLAYER_HALF_H
   *   player occupies:
   *     Y: [center - PLAYER_HALF_H, center + PLAYER_HALF_H]
   *     X: [center - PLAYER_RADIUS, center + PLAYER_RADIUS]
   *     Z: [center - PLAYER_RADIUS, center + PLAYER_RADIUS]
   *
   * this.position.y is the RENDER (feet) position, so:
   *   bottom of capsule = this.position.y
   *   top    of capsule = this.position.y + 2 * PLAYER_HALF_H
   */
  private _resolveCollisions(): void {
    const cx = this.position.x;                            // physics center X
    const cy = this.position.y + PLAYER_HALF_H;            // physics center Y
    const cz = this.position.z;                            // physics center Z

    for (const col of this.colliders) {
      const hx = col.scale.x / 2;
      const hy = col.scale.y / 2;
      const hz = col.scale.z / 2;

      // Overlap on each axis (using physics center ± half-extents, matching server)
      const ox = Math.min(cx + PLAYER_RADIUS, col.position.x + hx) -
                 Math.max(cx - PLAYER_RADIUS, col.position.x - hx);
      const oy = Math.min(cy + PLAYER_HALF_H, col.position.y + hy) -
                 Math.max(cy - PLAYER_HALF_H, col.position.y - hy);
      const oz = Math.min(cz + PLAYER_RADIUS, col.position.z + hz) -
                 Math.max(cz - PLAYER_RADIUS, col.position.z - hz);

      if (ox > 0 && oy > 0 && oz > 0) {
        const minO = Math.min(ox, oy, oz);
        if (minO === oy) {
          if (cy > col.position.y) {
            // Player is above the block → push up (landing on top).
            this.position.y += oy;   // render position moves up
            if (this.velocity.y < 0) {
              this.velocity.y = 0;
              this.onGround = true;
            }
          } else {
            // Player is below the block → push down (hitting ceiling).
            this.position.y -= oy;
            if (this.velocity.y > 0) this.velocity.y = 0;
          }
        } else if (minO === ox) {
          if (cx > col.position.x) this.position.x += ox;
          else                      this.position.x -= ox;
          this.velocity.x = 0;
        } else {
          if (cz > col.position.z) this.position.z += oz;
          else                      this.position.z -= oz;
          this.velocity.z = 0;
        }
      }
    }
  }

  updateVisual(dt: number): void {
    const alpha = Math.min(1, VISUAL_LERP + dt * 6);
    this.visualPosition.x += (this.position.x - this.visualPosition.x) * alpha;
    this.visualPosition.y += (this.position.y - this.visualPosition.y) * alpha;
    this.visualPosition.z += (this.position.z - this.visualPosition.z) * alpha;

    let rotDiff = this.rotation.y - this.visualRotation.y;
    while (rotDiff >  Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.visualRotation.y += rotDiff * alpha;
  }

  getPredictedState(): PredictedState {
    return {
      position: { ...this.visualPosition },
      rotation: { ...this.visualRotation },
      velocity: { ...this.velocity },
      onGround: this.onGround,
      animation: this.animation,
    };
  }
}
