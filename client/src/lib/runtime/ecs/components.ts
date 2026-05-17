/**
 * Canonical components for the new pipeline. Mirrors of fields from the
 * existing RuntimeObject so we can port systems incrementally.
 */
import { defineComponent } from "./world";
import type { Vec3 } from "../types";

export const Transform = defineComponent<{
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}>("transform");

export const Velocity = defineComponent<Vec3>("velocity");

export const Visual = defineComponent<{
  color: string;
  visible: boolean;
  transparency: number;
  primitiveType: string | null;
}>("visual");

export const Physics = defineComponent<{
  anchored: boolean;
  canCollide: boolean;
  mass: number;
  friction: number;
  gravity: false | { strength: number; radius: number };
}>("physics");

export const AutoBehavior = defineComponent<{
  autoRotateY?: number;
  autoBob?: { amplitude: number; speed: number; startY?: number; _time?: number };
  autoSpin?: { x?: number; y?: number; z?: number };
  autoMove?: { direction: Vec3; speed: number };
  autoFollow?: { target: { position: Vec3 }; speed: number; offset?: Vec3 };
}>("auto-behavior");

/** Identity tag — links an ECS entity to the legacy RuntimeObject id. */
export const LegacyHandle = defineComponent<{ legacyId: string; name: string }>("legacy-handle");

/** Player entity marker + state */
export const Player = defineComponent<{
  username: string;
  color: string;
  health: number;
  maxHealth: number;
  speed: number;
  walkSpeed: number;
  runSpeed: number;
  jumpPower: number;
  size: number;
  onGround: boolean;
  ragdoll: boolean;
  killY: number;
  up: Vec3;
  spawnPoint: Vec3;
}>("player");

/** Input state singleton (world entity 0) */
export const InputState = defineComponent<{
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
  prevKeys: Record<string, boolean>;
  cameraForward: Vec3;
}>("input-state");

/** World physics settings singleton (world entity 0) */
export const WorldPhysics = defineComponent<{
  gravity: number;
  airDrag: number;
}>("world-physics");

/** Motor attachments for player */
export const MotorAttachments = defineComponent<{
  slots: Record<string, { entityId: number; offset: Vec3; rotation: Vec3 } | null>;
}>("motor-attachments");

/** Collision result from last frame */
export const CollisionResult = defineComponent<{
  grounded: boolean;
  contacts: { entityId: number; normal: Vec3; depth: number }[];
}>("collision-result");

/** Pending destruction flag */
export const PendingDestroy = defineComponent<{ reason?: string }>("pending-destroy");

/** Spawn queue item */
export const PendingSpawn = defineComponent<{
  templateName: string;
  overrides?: Record<string, any>;
}>("pending-spawn");

/** Tween state */
export const TweenState = defineComponent<{
  tweens: {
    id: string;
    property: string;
    from: number;
    to: number;
    duration: number;
    elapsed: number;
    easing: string;
  }[];
}>("tween-state");
