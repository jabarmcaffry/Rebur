/**
 * Game Loop Module
 * 
 * Provides utilities for managing the game loop phases and timing.
 * The main loop orchestration remains in core.ts, but this module
 * provides helpers for phase management and performance tracking.
 */

import type { RuntimePlayer, RuntimeObject, Vec3 } from "../types";

/**
 * Loop phase names in execution order
 */
export const LOOP_PHASES = [
  "input",
  "animation",
  "replication",
  "physics",
  "render",
  "update",
] as const;

export type LoopPhase = (typeof LOOP_PHASES)[number];

/**
 * Performance metrics for loop profiling
 */
export interface LoopMetrics {
  frameTime: number;
  phaseTimings: Record<LoopPhase, number>;
  objectCount: number;
  timestamp: number;
}

/**
 * Creates a performance tracker for the game loop
 */
export function createLoopProfiler() {
  const metrics: LoopMetrics = {
    frameTime: 0,
    phaseTimings: {
      input: 0,
      animation: 0,
      replication: 0,
      physics: 0,
      render: 0,
      update: 0,
    },
    objectCount: 0,
    timestamp: 0,
  };

  let frameStart = 0;
  let phaseStart = 0;

  return {
    startFrame() {
      frameStart = performance.now();
    },
    startPhase(phase: LoopPhase) {
      phaseStart = performance.now();
    },
    endPhase(phase: LoopPhase) {
      metrics.phaseTimings[phase] = performance.now() - phaseStart;
    },
    endFrame(objectCount: number) {
      metrics.frameTime = performance.now() - frameStart;
      metrics.objectCount = objectCount;
      metrics.timestamp = Date.now();
    },
    getMetrics(): Readonly<LoopMetrics> {
      return { ...metrics };
    },
    reset() {
      metrics.frameTime = 0;
      for (const phase of LOOP_PHASES) {
        metrics.phaseTimings[phase] = 0;
      }
    },
  };
}

/**
 * Clamps delta time to prevent physics explosions
 */
export function clampDeltaTime(dt: number, maxDt = 0.1): number {
  return dt > maxDt ? maxDt : dt;
}

/**
 * Computes player movement direction vectors based on camera and up vector
 */
export function computeMovementBasis(
  cameraForward: Vec3,
  playerUp: Vec3,
  moveForward: Vec3,
  dt: number
): { forward: Vec3; right: Vec3; updatedMoveForward: Vec3 } {
  // Project camera forward onto plane perpendicular to player up
  const cfDot = cameraForward.x * playerUp.x + cameraForward.y * playerUp.y + cameraForward.z * playerUp.z;
  let fx = cameraForward.x - playerUp.x * cfDot;
  let fy = cameraForward.y - playerUp.y * cfDot;
  let fz = cameraForward.z - playerUp.z * cfDot;
  let fLen = Math.hypot(fx, fy, fz);

  // Fallback to cached move forward if camera is looking straight up/down
  if (fLen < 0.15) {
    fx = moveForward.x;
    fy = moveForward.y;
    fz = moveForward.z;
    fLen = Math.hypot(fx, fy, fz) || 1;
  }

  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  // Smooth blend toward new forward direction
  const fwdBlend = Math.min(1, dt * 8);
  const newMoveForward = {
    x: moveForward.x + (fx - moveForward.x) * fwdBlend,
    y: moveForward.y + (fy - moveForward.y) * fwdBlend,
    z: moveForward.z + (fz - moveForward.z) * fwdBlend,
  };

  const mfLen = Math.hypot(newMoveForward.x, newMoveForward.y, newMoveForward.z) || 1;
  const forward = {
    x: newMoveForward.x / mfLen,
    y: newMoveForward.y / mfLen,
    z: newMoveForward.z / mfLen,
  };

  // Right vector is cross product of forward and up
  const right = {
    x: forward.y * playerUp.z - forward.z * playerUp.y,
    y: forward.z * playerUp.x - forward.x * playerUp.z,
    z: forward.x * playerUp.y - forward.y * playerUp.x,
  };

  return { forward, right, updatedMoveForward: newMoveForward };
}

/**
 * Updates player up vector to align with gravity
 */
export function updatePlayerUpVector(
  playerUp: Vec3,
  gravityVector: Vec3,
  dt: number
): Vec3 {
  const gMag = Math.hypot(gravityVector.x, gravityVector.y, gravityVector.z);
  const desiredUp = gMag > 0.001
    ? { x: -gravityVector.x / gMag, y: -gravityVector.y / gMag, z: -gravityVector.z / gMag }
    : { x: 0, y: 1, z: 0 };

  const slerpT = Math.min(1, dt * 6);
  const newUp = {
    x: playerUp.x + (desiredUp.x - playerUp.x) * slerpT,
    y: playerUp.y + (desiredUp.y - playerUp.y) * slerpT,
    z: playerUp.z + (desiredUp.z - playerUp.z) * slerpT,
  };

  // Normalize
  const upLen = Math.hypot(newUp.x, newUp.y, newUp.z) || 1;
  return {
    x: newUp.x / upLen,
    y: newUp.y / upLen,
    z: newUp.z / upLen,
  };
}

/**
 * Computes player speed based on sprint state
 */
export function computePlayerSpeed(
  player: RuntimePlayer,
  keys: Record<string, boolean>
): number {
  const sprinting = !!(keys["shift"] || keys["shiftleft"] || keys["shiftright"]);
  return sprinting
    ? (player.runSpeed || player.speed * 1.6)
    : (player.walkSpeed || player.speed);
}

/**
 * Updates player facing direction based on movement
 */
export function updatePlayerFacing(
  player: RuntimePlayer,
  wantX: number,
  wantZ: number,
  dt: number
): void {
  if (!player.autoFaceMovement) return;

  const moveMag = Math.hypot(wantX, wantZ);
  if (moveMag > 0.05) {
    const targetYaw = Math.atan2(wantX, wantZ);
    let diff = targetYaw - player.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.rotation.y += diff * Math.min(1, dt * 12);
  }
}

/**
 * Applies velocity integration for a position
 */
export function integrateVelocity(
  position: Vec3,
  velocity: Vec3,
  gravity: Vec3,
  dt: number
): void {
  velocity.x += gravity.x * dt;
  velocity.y += gravity.y * dt;
  velocity.z += gravity.z * dt;
  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;
}

/**
 * Updates ragdoll limb positions
 */
export function updateRagdollLimbs(
  ragdollPos: Record<string, Vec3>,
  ragdollVel: Record<string, Vec3>,
  gravity: number,
  dt: number
): void {
  const g = -gravity;
  for (const k of Object.keys(ragdollPos)) {
    const pos = ragdollPos[k];
    const vel = ragdollVel[k];
    vel.y += g * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;
  }
}
