import type { Vec3 } from "@shared/render-types";

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

const GRAVITY = -40;
const JUMP_FORCE = 18;
const WALK_SPEED = 16;
const SPRINT_SPEED = 24;
const PLAYER_HEIGHT = 2.2;
const PLAYER_RADIUS = 0.4;
const VISUAL_LERP = 0.25;

export class ClientPhysics {
  private position: Vec3 = { x: 0, y: 5, z: 0 };
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  private rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private onGround = false;
  private animation = "idle";
  private colliders: Collider[] = [];

  private visualPosition: Vec3 = { x: 0, y: 5, z: 0 };
  private visualRotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  setColliders(colliders: Collider[]): void {
    this.colliders = colliders.filter((c) => c.canCollide && c.anchored);
  }

  reconcileWithServer(
    position: Vec3,
    velocity: Vec3,
    rotationY: number,
    onGround: boolean
  ): void {
    const dx = position.x - this.position.x;
    const dy = position.y - this.position.y;
    const dz = position.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 3) {
      this.position = { ...position };
      this.visualPosition = { ...position };
    } else if (dist > 0.1) {
      this.position.x += dx * 0.3;
      this.position.y += dy * 0.3;
      this.position.z += dz * 0.3;
    }

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
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);

    const worldX = moveX * cosYaw - moveZ * sinYaw;
    const worldZ = moveX * sinYaw + moveZ * cosYaw;

    const mag = Math.sqrt(worldX * worldX + worldZ * worldZ);
    if (mag > 0) {
      this.velocity.x = (worldX / mag) * speed;
      this.velocity.z = (worldZ / mag) * speed;
      this.rotation.y = Math.atan2(worldX, worldZ);
      this.animation = sprint ? "run" : "walk";
    } else {
      this.velocity.x *= 0.7;
      this.velocity.z *= 0.7;
      this.animation = "idle";
    }

    if (jump && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
      this.animation = "jump";
    }

    if (!this.onGround) {
      this.velocity.y += GRAVITY * dt;
      this.animation = this.velocity.y > 0 ? "jump" : "fall";
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    this._resolveCollisions(dt);
  }

  private _resolveCollisions(_dt: number): void {
    for (const col of this.colliders) {
      const hx = col.scale.x / 2;
      const hy = col.scale.y / 2;
      const hz = col.scale.z / 2;

      const minX = col.position.x - hx;
      const maxX = col.position.x + hx;
      const minY = col.position.y - hy;
      const maxY = col.position.y + hy;
      const minZ = col.position.z - hz;
      const maxZ = col.position.z + hz;

      const px = this.position.x;
      const py = this.position.y;
      const pz = this.position.z;

      const overlapX = Math.max(0, Math.min(px + PLAYER_RADIUS, maxX) - Math.max(px - PLAYER_RADIUS, minX));
      const overlapY = Math.max(0, Math.min(py + PLAYER_HEIGHT, maxY) - Math.max(py, minY));
      const overlapZ = Math.max(0, Math.min(pz + PLAYER_RADIUS, maxZ) - Math.max(pz - PLAYER_RADIUS, minZ));

      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        const minOverlap = Math.min(overlapX, overlapY, overlapZ);
        if (minOverlap === overlapY) {
          if (py < col.position.y) {
            this.position.y = minY - PLAYER_HEIGHT;
            if (this.velocity.y > 0) this.velocity.y = 0;
          } else {
            this.position.y = maxY;
            this.onGround = true;
            if (this.velocity.y < 0) this.velocity.y = 0;
          }
        } else if (minOverlap === overlapX) {
          if (px < col.position.x) {
            this.position.x = minX - PLAYER_RADIUS;
          } else {
            this.position.x = maxX + PLAYER_RADIUS;
          }
          this.velocity.x = 0;
        } else {
          if (pz < col.position.z) {
            this.position.z = minZ - PLAYER_RADIUS;
          } else {
            this.position.z = maxZ + PLAYER_RADIUS;
          }
          this.velocity.z = 0;
        }
      }
    }

    if (this.position.y < -100) {
      this.position.y = 5;
      this.velocity.y = 0;
    }
  }

  updateVisual(dt: number): void {
    const alpha = Math.min(1, VISUAL_LERP + dt * 8);
    this.visualPosition.x += (this.position.x - this.visualPosition.x) * alpha;
    this.visualPosition.y += (this.position.y - this.visualPosition.y) * alpha;
    this.visualPosition.z += (this.position.z - this.visualPosition.z) * alpha;

    let rotDiff = this.rotation.y - this.visualRotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
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
