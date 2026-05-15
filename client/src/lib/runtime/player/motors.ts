/**
 * Player Motors System
 * 
 * Handles attaching objects to player rig slots (hands, back, etc.)
 * Motor-attached objects follow the player automatically.
 */

import type { RuntimeObject, Vec3 } from "../types";

export type MotorSlot = "rightHand" | "leftHand" | "back" | "head" | "torso";

export interface MotorState {
  obj: RuntimeObject;
  offset: Vec3;
  rotation: Vec3;
}

export interface PlayerMotors {
  attach: (slot: MotorSlot, obj: RuntimeObject | null, offset?: Partial<Vec3>, rotation?: Partial<Vec3>) => void;
  detach: (slot: MotorSlot) => RuntimeObject | null;
  get: (slot: MotorSlot) => RuntimeObject | null;
  animation: string;
}

/**
 * Slot offset positions relative to player rig (feet-based positioning)
 */
export const MOTOR_SLOT_OFFSETS: Record<MotorSlot, Vec3> = {
  rightHand: { x: 0.55, y: 1.25, z: 0.25 },
  leftHand:  { x: -0.55, y: 1.25, z: 0.25 },
  back:      { x: 0, y: 1.45, z: -0.35 },
  head:      { x: 0, y: 1.95, z: 0 },
  torso:     { x: 0, y: 1.30, z: 0 },
};

/**
 * Creates the player motors system
 */
export function createPlayerMotors(motorState: Map<string, MotorState>): PlayerMotors {
  return {
    attach(slot: MotorSlot, obj: RuntimeObject | null, offset?: Partial<Vec3>, rotation?: Partial<Vec3>) {
      if (!obj) {
        motorState.delete(slot);
        return;
      }
      // Un-anchor pinned objects so they move with the player
      obj.anchored = false;
      obj.canCollide = false;
      
      motorState.set(slot, {
        obj,
        offset: offset ? { x: offset.x ?? 0, y: offset.y ?? 0, z: offset.z ?? 0 } : { x: 0, y: 0, z: 0 },
        rotation: rotation ? { x: rotation.x ?? 0, y: rotation.y ?? 0, z: rotation.z ?? 0 } : { x: 0, y: 0, z: 0 },
      });
    },

    detach(slot: MotorSlot): RuntimeObject | null {
      const m = motorState.get(slot);
      if (!m) return null;
      
      motorState.delete(slot);
      m.obj.canCollide = true;
      return m.obj;
    },

    get(slot: MotorSlot): RuntimeObject | null {
      return motorState.get(slot)?.obj ?? null;
    },

    animation: "idle",
  };
}

/**
 * Apply motor positions to attached objects
 * Called each physics frame to keep objects pinned to the player rig
 */
export function applyMotorPositions(
  motorState: Map<string, MotorState>,
  playerPosition: Vec3,
  playerRotationY: number
): void {
  if (motorState.size === 0) return;

  const cosY = Math.cos(playerRotationY);
  const sinY = Math.sin(playerRotationY);

  for (const [slot, m] of motorState) {
    const base = MOTOR_SLOT_OFFSETS[slot as MotorSlot] ?? { x: 0, y: 0, z: 0 };
    const lx = base.x + m.offset.x;
    const ly = base.y + m.offset.y;
    const lz = base.z + m.offset.z;
    
    // Rotate offset by player yaw around up axis
    const wx = lx * cosY + lz * sinY;
    const wz = -lx * sinY + lz * cosY;
    
    m.obj.position.x = playerPosition.x + wx;
    m.obj.position.y = playerPosition.y + ly;
    m.obj.position.z = playerPosition.z + wz;
    m.obj.rotation.x = m.rotation.x;
    m.obj.rotation.y = playerRotationY + m.rotation.y;
    m.obj.rotation.z = m.rotation.z;
    m.obj.velocity.x = 0;
    m.obj.velocity.y = 0;
    m.obj.velocity.z = 0;
  }
}

/**
 * Get the set of motor-pinned object IDs
 */
export function getMotorPinnedIds(motorState: Map<string, MotorState>): Set<string> {
  const ids = new Set<string>();
  for (const m of motorState.values()) {
    ids.add(m.obj.id);
  }
  return ids;
}

/**
 * Check if an object is currently held in any motor slot
 */
export function isObjectHeld(motorState: Map<string, MotorState>, objId: string): boolean {
  for (const m of motorState.values()) {
    if (m.obj.id === objId) return true;
  }
  return false;
}

/**
 * Get the slot name where an object is held, or null if not held
 */
export function getHeldObjectSlot(motorState: Map<string, MotorState>, objId: string): MotorSlot | null {
  for (const [slot, m] of motorState) {
    if (m.obj.id === objId) return slot as MotorSlot;
  }
  return null;
}
