/**
 * Keyframe animation player — evaluates stored animations on RuntimeObjects.
 * Animations are stored in object.properties.animations (array of AnimationDef).
 * Joints are stored in object.properties.joints (array of JointDef).
 */
import type { RuntimeObject } from "../types";

export interface Keyframe {
  id: string;
  time: number;
  px?: number; py?: number; pz?: number;
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
}

export interface AnimationDef {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  autoPlay: boolean;
  keyframes: Keyframe[];
  // Runtime state (not persisted between sessions)
  _currentTime?: number;
  _playing?: boolean;
}

export interface JointDef {
  id: string;
  name: string;
  targetObjectId: string;
  type: "fixed" | "hinge" | "ball" | "slider";
  axis: [number, number, number];
  offsetX?: number; offsetY?: number; offsetZ?: number;
  minAngle?: number; maxAngle?: number;
  currentAngle?: number;
}

function lerp(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}

function sampleAnimation(anim: AnimationDef, time: number): Partial<Keyframe> {
  const kfs = [...anim.keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return {};
  if (kfs.length === 1) return kfs[0];
  if (time <= kfs[0].time) return kfs[0];
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1];

  // Find surrounding keyframes
  let lo = kfs[0], hi = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].time <= time && kfs[i + 1].time >= time) {
      lo = kfs[i];
      hi = kfs[i + 1];
      break;
    }
  }
  const span = hi.time - lo.time;
  const t = span > 0 ? (time - lo.time) / span : 0;

  return {
    px: lerp(lo.px, hi.px, t),
    py: lerp(lo.py, hi.py, t),
    pz: lerp(lo.pz, hi.pz, t),
    rx: lerp(lo.rx, hi.rx, t),
    ry: lerp(lo.ry, hi.ry, t),
    rz: lerp(lo.rz, hi.rz, t),
    sx: lerp(lo.sx, hi.sx, t),
    sy: lerp(lo.sy, hi.sy, t),
    sz: lerp(lo.sz, hi.sz, t),
  };
}

/** Apply all active keyframe animations on every object each frame. */
export function applyKeyframeAnimations(objectList: RuntimeObject[], dt: number): void {
  for (const obj of objectList) {
    const props = obj.properties as Record<string, any> | undefined;
    const anims = props?.animations as AnimationDef[] | undefined;
    if (!anims?.length) continue;

    for (const anim of anims) {
      // Auto-start if autoPlay set and not yet started
      if (anim.autoPlay && anim._playing === undefined) {
        anim._playing = true;
        anim._currentTime = 0;
      }
      if (!anim._playing) continue;

      anim._currentTime = (anim._currentTime ?? 0) + dt;
      if (anim._currentTime > anim.duration) {
        if (anim.loop) {
          anim._currentTime = anim._currentTime % anim.duration;
        } else {
          anim._currentTime = anim.duration;
          anim._playing = false;
        }
      }

      const sample = sampleAnimation(anim, anim._currentTime);
      if (sample.px !== undefined) obj.position.x = sample.px;
      if (sample.py !== undefined) obj.position.y = sample.py;
      if (sample.pz !== undefined) obj.position.z = sample.pz;
      if (sample.rx !== undefined) obj.rotation.x = sample.rx;
      if (sample.ry !== undefined) obj.rotation.y = sample.ry;
      if (sample.rz !== undefined) obj.rotation.z = sample.rz;
      if (sample.sx !== undefined) obj.scale.x = sample.sx;
      if (sample.sy !== undefined) obj.scale.y = sample.sy;
      if (sample.sz !== undefined) obj.scale.z = sample.sz;
    }
  }
}

/** Apply joint constraints each frame. */
export function applyJoints(objectList: RuntimeObject[], dt: number): void {
  const byId = new Map(objectList.map(o => [o.id, o]));
  for (const obj of objectList) {
    const props = obj.properties as Record<string, any> | undefined;
    const joints = props?.joints as JointDef[] | undefined;
    if (!joints?.length) continue;
    for (const joint of joints) {
      const target = byId.get(joint.targetObjectId);
      if (!target) continue;
      if (joint.type === "fixed") {
        target.position.x = obj.position.x + (joint.offsetX ?? 0);
        target.position.y = obj.position.y + (joint.offsetY ?? 0);
        target.position.z = obj.position.z + (joint.offsetZ ?? 0);
      } else if (joint.type === "hinge") {
        const angle = joint.currentAngle ?? 0;
        const [ax, ay, az] = joint.axis;
        // Apply rotation relative to parent's rotation
        target.position.x = obj.position.x + (joint.offsetX ?? 0);
        target.position.y = obj.position.y + (joint.offsetY ?? 0);
        target.position.z = obj.position.z + (joint.offsetZ ?? 0);
        target.rotation.x = obj.rotation.x + ax * angle;
        target.rotation.y = obj.rotation.y + ay * angle;
        target.rotation.z = obj.rotation.z + az * angle;
      }
    }
  }
  void dt;
}

/** Script API helpers — call from GameRuntime */
export function playAnimation(obj: RuntimeObject, name: string): boolean {
  const props = obj.properties as Record<string, any> | undefined;
  const anims = props?.animations as AnimationDef[] | undefined;
  const anim = anims?.find(a => a.name === name);
  if (!anim) return false;
  anim._playing = true;
  anim._currentTime = 0;
  return true;
}

export function stopAnimation(obj: RuntimeObject, name: string): boolean {
  const props = obj.properties as Record<string, any> | undefined;
  const anims = props?.animations as AnimationDef[] | undefined;
  const anim = anims?.find(a => a.name === name);
  if (!anim) return false;
  anim._playing = false;
  anim._currentTime = 0;
  return true;
}

export function pauseAnimation(obj: RuntimeObject, name: string): boolean {
  const props = obj.properties as Record<string, any> | undefined;
  const anims = props?.animations as AnimationDef[] | undefined;
  const anim = anims?.find(a => a.name === name);
  if (!anim) return false;
  anim._playing = false;
  return true;
}
