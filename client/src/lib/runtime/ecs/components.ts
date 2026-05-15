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
