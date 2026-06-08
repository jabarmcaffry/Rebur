/**
 * Avatar.tsx — Procedural / motor-driven avatar.
 *
 * Loads ONLY Avatar.fbx (mesh + skeleton, no animations) and drives bones
 * directly each frame, the way Roblox motors drive R15 limbs. There is no
 * AnimationMixer and no .fbx animation clip.
 *
 * Per-instance flow:
 *   1. SkeletonUtils.clone() the shared base group so each player has their
 *      own independent skeleton.
 *   2. Walk the skeleton, locate the named bones we care about (arms, legs,
 *      spine, head), and snapshot their bind-pose quaternions.
 *   3. Every frame, build a target quaternion = bind * additive(state, phase)
 *      and slerp toward it. State (idle / walk / run / jump) is read from
 *      player.animation. Phase is a per-instance clock advanced by dt and
 *      scaled by movement speed so the cycle matches stride.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

import avatarFbxUrl from "./Avatar.fbx?url";

const LABEL_HEIGHT = 2.4;
const TARGET_HEIGHT = 1.8;

// ── Shared library (parsed once) ─────────────────────────────────────────────
interface AvatarLibrary {
  baseGroup: THREE.Group;
  displayScale: number;
  boneNames: string[];
}

type LoadState = "idle" | "loading" | "ready" | "error";
let _loadState: LoadState = "idle";
let _library: AvatarLibrary | null = null;
let _waiters: Array<(ok: boolean) => void> = [];

function notifyWaiters(ok: boolean) {
  _waiters.forEach((fn) => fn(ok));
  _waiters = [];
}

async function ensureLibraryLoaded(): Promise<boolean> {
  if (_loadState === "ready") return true;
  if (_loadState === "error") return false;
  if (_loadState === "loading") {
    return new Promise((resolve) => _waiters.push(resolve));
  }
  _loadState = "loading";
  try {
    const loader = new FBXLoader();
    const baseFbx = await loader.loadAsync(avatarFbxUrl);

    // Strip any embedded clips — we drive bones procedurally.
    baseFbx.animations = [];

    const boneNames: string[] = [];
    baseFbx.traverse((c) => {
      if ((c as THREE.Bone).isBone) boneNames.push(c.name);
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
        (c as THREE.SkinnedMesh).frustumCulled = false;
      }
    });
    console.log(`[avatar] Loaded Avatar.fbx — ${boneNames.length} bones`);
    console.log(`[avatar] Bones: ${boneNames.join(", ")}`);

    // Compute displayScale from skinned-mesh geometry only.
    const box = new THREE.Box3();
    baseFbx.updateWorldMatrix(true, true);
    baseFbx.traverse((child) => {
      const sm = child as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.geometry.computeBoundingBox();
      const geoBB = sm.geometry.boundingBox;
      if (!geoBB) return;
      box.union(geoBB.clone().applyMatrix4(sm.matrixWorld));
    });
    const size = new THREE.Vector3();
    box.getSize(size);
    const displayScale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;

    _library = { baseGroup: baseFbx, displayScale, boneNames };
    _loadState = "ready";
    notifyWaiters(true);
    return true;
  } catch (err) {
    console.error("[avatar] Failed to load Avatar.fbx:", err);
    _loadState = "error";
    notifyWaiters(false);
    return false;
  }
}

// ── Bone lookup ──────────────────────────────────────────────────────────────
// Score each bone for a (side, part) target and pick the best match. Handles
// all common naming schemes:
//   Mixamo:   mixamorig:LeftArm, mixamorig:LeftForeArm, mixamorig:LeftUpLeg
//   Blender:  Arm.L, ForeArm.L, UpLeg.L
//   Unreal:   upperarm_l, lowerarm_l, thigh_l, calf_l
//   Plain:    L_Arm, LeftArm, leftShoulder
type Side = "left" | "right" | "center";
type Part = "spine" | "head" | "upperArm" | "foreArm" | "upperLeg" | "lowerLeg";

const SIDE_RE: Record<Side, (n: string) => boolean> = {
  // Case-sensitive trailing L/R (e.g. upperarmL, lowerlegR) PLUS the usual
  // "left"/"right" words, .L/.R, _l/_r, l_/r_ prefixes. Case-insensitive
  // "l"/"r" alone would false-match every word containing those letters, so
  // we keep the single-letter form strictly case-sensitive.
  left:   (n) => /L$/.test(n) || /(^|[^a-zA-Z])left([^a-zA-Z]|$)/i.test(n) || /\.L$/.test(n) || /_l$/i.test(n) || /^L_/.test(n) || /^left/i.test(n),
  right:  (n) => /R$/.test(n) || /(^|[^a-zA-Z])right([^a-zA-Z]|$)/i.test(n) || /\.R$/.test(n) || /_r$/i.test(n) || /^R_/.test(n) || /^right/i.test(n),
  center: (_) => false,
};

// Higher score wins. End bones are excluded outright.
function partScore(name: string, part: Part): number {
  const n = name.toLowerCase();
  switch (part) {
    case "spine":    return /spine2$/.test(n) ? 6 : /spine1$/.test(n) ? 5 : /(^|[^a-z])spine($|[^a-z])/.test(n) ? 4 : /chest|torso/.test(n) ? 3 : 0;
    case "head":     return /(^|[^a-z])head($|[^a-z])/.test(n) ? 5 : 0;
    case "upperArm": return /(forearm|lowerarm|elbow)/.test(n) ? 0
                          : /upperarm/.test(n) ? 6
                          : /(^|[^a-z])arm($|[^a-z])/.test(n) ? 5
                          : /shoulder/.test(n) ? 3 : 0;
    case "foreArm":  return /(forearm|lowerarm)/.test(n) ? 6 : /elbow/.test(n) ? 4 : 0;
    case "upperLeg": return /(lowerleg|shin|calf|knee)/.test(n) ? 0
                          : /(upleg|upperleg|thigh)/.test(n) ? 6
                          : /(^|[^a-z])leg($|[^a-z])/.test(n) ? 4
                          : /hip(?!s$)/.test(n) ? 3 : 0;
    case "lowerLeg": return /(lowerleg|shin|calf)/.test(n) ? 6 : /knee/.test(n) ? 4 : 0;
  }
}

function isEnd(name: string) {
  return /_end$|\.end$|end$/i.test(name);
}

function findBone(root: THREE.Object3D, side: Side, part: Part): THREE.Bone | null {
  let best: THREE.Bone | null = null;
  let bestScore = 0;
  root.traverse((c) => {
    if (!(c as THREE.Bone).isBone) return;
    if (isEnd(c.name)) return;
    const ps = partScore(c.name, part);
    if (ps === 0) return;
    if (side !== "center" && !SIDE_RE[side](c.name)) return;
    if (side === "center") {
      // Reject if name looks side-tagged
      if (SIDE_RE.left(c.name) || SIDE_RE.right(c.name)) return;
    }
    if (ps > bestScore) { bestScore = ps; best = c as THREE.Bone; }
  });
  return best;
}

interface RigBones {
  spine: THREE.Bone | null;
  head: THREE.Bone | null;
  leftArm: THREE.Bone | null;
  rightArm: THREE.Bone | null;
  leftForeArm: THREE.Bone | null;
  rightForeArm: THREE.Bone | null;
  leftUpLeg: THREE.Bone | null;
  rightUpLeg: THREE.Bone | null;
  leftLeg: THREE.Bone | null;
  rightLeg: THREE.Bone | null;
}

// ── T-pose correction ────────────────────────────────────────────────────────
// When the FBX ships in T-pose (arms pointing straight out sideways) the
// bind quaternions will be horizontal. We detect that and rotate each upper-arm
// bone so the "rest" position is arms-at-sides before snapping the bindQ.
//
// All math is in world space; we convert back to the bone's local space via the
// parent chain's world quaternion.

function getBoneAlongWorldDir(bone: THREE.Bone): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  const boneWorldQ = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQ);
  // Try +Y (Blender/FBX standard along-bone axis) and +X; pick whichever is
  // more horizontal — that's the real "along" axis for a T-posed arm.
  const yDir = new THREE.Vector3(0, 1, 0).applyQuaternion(boneWorldQ);
  const xDir = new THREE.Vector3(1, 0, 0).applyQuaternion(boneWorldQ);
  const yH = Math.abs(yDir.x) + Math.abs(yDir.z);
  const xH = Math.abs(xDir.x) + Math.abs(xDir.z);
  return xH > yH ? xDir : yDir;
}

function correctArmTpose(bone: THREE.Bone, isLeft: boolean): void {
  const currentDir = getBoneAlongWorldDir(bone);
  // Only act if the arm is substantially horizontal (T-pose criterion).
  if (Math.abs(currentDir.x) < 0.45) return;

  // Desired world-space direction: arm hanging at side with a slight outward angle.
  const target = new THREE.Vector3(isLeft ? -0.15 : 0.15, -0.98, 0).normalize();

  // World-space rotation that maps currentDir → target.
  const worldCorrection = new THREE.Quaternion().setFromUnitVectors(currentDir, target);

  // Express that world-space correction in the bone's LOCAL space so we can
  // premultiply it onto bone.quaternion.
  //   newBoneWorldQ = worldCorrection * oldBoneWorldQ
  //                 = worldCorrection * parentWorldQ * oldBoneLocalQ
  //   newBoneLocalQ = parentWorldQ⁻¹ * worldCorrection * parentWorldQ * oldBoneLocalQ
  // → localCorrection = parentWorldQ⁻¹ * worldCorrection * parentWorldQ
  const parentWorldQ = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
  // THREE.js: .multiply(q) = this * q, .premultiply(q) = q * this
  // We want: pWQ⁻¹ * worldCorrection * pWQ
  const localCorrection = parentWorldQ.clone().invert() // pWQ⁻¹
    .multiply(worldCorrection)                          // pWQ⁻¹ * worldCorrection
    .multiply(parentWorldQ);                            // pWQ⁻¹ * worldCorrection * pWQ

  bone.quaternion.premultiply(localCorrection);
  bone.updateMatrixWorld(true);
}

function buildRig(root: THREE.Object3D): { rig: RigBones; bindQ: Map<THREE.Bone, THREE.Quaternion> } {
  const rig: RigBones = {
    spine:        findBone(root, "center", "spine"),
    head:         findBone(root, "center", "head"),
    leftArm:      findBone(root, "left",  "upperArm"),
    rightArm:     findBone(root, "right", "upperArm"),
    leftForeArm:  findBone(root, "left",  "foreArm"),
    rightForeArm: findBone(root, "right", "foreArm"),
    leftUpLeg:    findBone(root, "left",  "upperLeg"),
    rightUpLeg:   findBone(root, "right", "upperLeg"),
    leftLeg:      findBone(root, "left",  "lowerLeg"),
    rightLeg:     findBone(root, "right", "lowerLeg"),
  };

  // Ensure world matrices are up to date before sampling directions.
  root.updateMatrixWorld(true);

  // Correct T-pose on upper arms so the bind ("rest") pose is arms-at-sides.
  if (rig.leftArm)  correctArmTpose(rig.leftArm,  true);
  if (rig.rightArm) correctArmTpose(rig.rightArm, false);

  // Snap bind quaternions AFTER any corrections.
  const bindQ = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of Object.values(rig)) {
    if (b) bindQ.set(b, b.quaternion.clone());
  }
  return { rig, bindQ };
}

// ── Procedural pose ──────────────────────────────────────────────────────────
// Returns additive Euler (x,y,z) rotations per bone for a given state + phase.
// Phase is in radians; the caller advances phase = phase + dt * stepRate.
interface PoseTargets {
  spine?: THREE.Euler;
  head?: THREE.Euler;
  leftArm?: THREE.Euler;
  rightArm?: THREE.Euler;
  leftForeArm?: THREE.Euler;
  rightForeArm?: THREE.Euler;
  leftUpLeg?: THREE.Euler;
  rightUpLeg?: THREE.Euler;
  leftLeg?: THREE.Euler;
  rightLeg?: THREE.Euler;
}

function poseFor(state: string, phase: number, intensity: number): PoseTargets {
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  if (state === "jump" || state === "fall") {
    // Arms up + slight, legs tucked.
    return {
      leftArm:  new THREE.Euler(0, 0,  1.1 * intensity),
      rightArm: new THREE.Euler(0, 0, -1.1 * intensity),
      leftUpLeg:  new THREE.Euler( 0.5 * intensity, 0, 0),
      rightUpLeg: new THREE.Euler( 0.5 * intensity, 0, 0),
      leftLeg:    new THREE.Euler(-0.9 * intensity, 0, 0),
      rightLeg:   new THREE.Euler(-0.9 * intensity, 0, 0),
      spine: new THREE.Euler(0.15 * intensity, 0, 0),
    };
  }

  if (state === "walk" || state === "run") {
    // Opposite-side arms/legs swing. Stronger swing for run.
    const swing = (state === "run" ? 1.1 : 0.7) * intensity;
    const armSwing = (state === "run" ? 1.3 : 0.9) * intensity;
    const bob = (state === "run" ? 0.10 : 0.06) * intensity;
    return {
      // Arms swing opposite to legs
      leftArm:  new THREE.Euler( s * armSwing, 0, 0),
      rightArm: new THREE.Euler(-s * armSwing, 0, 0),
      leftForeArm:  new THREE.Euler(Math.max(0, -s * 0.4) * intensity, 0, 0),
      rightForeArm: new THREE.Euler(Math.max(0,  s * 0.4) * intensity, 0, 0),
      // Legs
      leftUpLeg:  new THREE.Euler(-s * swing, 0, 0),
      rightUpLeg: new THREE.Euler( s * swing, 0, 0),
      leftLeg:    new THREE.Euler(Math.max(0,  s * swing * 0.9), 0, 0),
      rightLeg:   new THREE.Euler(Math.max(0, -s * swing * 0.9), 0, 0),
      // Subtle torso counter-rotation + bob
      spine: new THREE.Euler(bob * 0.5, -s * 0.08 * intensity, 0),
      head:  new THREE.Euler(0,  s * 0.05 * intensity, 0),
    };
  }

  // idle — gentle breathing
  const breath = 0.04 * intensity;
  return {
    spine: new THREE.Euler(c * breath, 0, 0),
    head:  new THREE.Euler(c * breath * 0.5, 0, 0),
    leftArm:  new THREE.Euler(0, 0,  0.06 + c * 0.02),
    rightArm: new THREE.Euler(0, 0, -0.06 - c * 0.02),
  };
}

// ── Placeholder ──────────────────────────────────────────────────────────────
function AvatarPlaceholder({ player, error = false }: { player: RenderPlayer; error?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.9, 0]} frustumCulled={false}>
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshStandardMaterial color={error ? "#ff4444" : "#888888"} />
      </mesh>
      <mesh position={[0, 1.75, 0]} frustumCulled={false}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color={error ? "#ff4444" : "#888888"} />
      </mesh>
      <Html position={[0, LABEL_HEIGHT, 0]} center distanceFactor={8} zIndexRange={[100, 0]} sprite>
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none select-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}

// ── Live procedural avatar ───────────────────────────────────────────────────
function AvatarMesh({ player }: { player: RenderPlayer }) {
  const outerRef = useRef<THREE.Group>(null);

  // Clone base group once per instance.
  const { clone, rig, bindQ } = useMemo(() => {
    if (!_library) return { clone: null, rig: null as RigBones | null, bindQ: new Map() };
    const c = (SkeletonUtils as any).clone(_library.baseGroup) as THREE.Group;
    c.traverse((child) => {
      const sm = child as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.frustumCulled = false;
        sm.castShadow = false;
      }
    });
    const built = buildRig(c);
    return { clone: c, rig: built.rig, bindQ: built.bindQ };
  }, []);

  // Per-frame state.
  const phaseRef = useRef(0);
  const lastPosRef = useRef<{ x: number; z: number } | null>(null);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const targetQ = useMemo(() => new THREE.Quaternion(), []);
  const addQ = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.066);
    const g = outerRef.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;

    if (!rig || !clone) return;

    // Estimate planar speed from position delta — drives stride frequency.
    const prev = lastPosRef.current;
    const cur = { x: player.position.x, z: player.position.z };
    let speed = 0;
    if (prev) {
      const dx = cur.x - prev.x;
      const dz = cur.z - prev.z;
      speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 1e-4);
    }
    lastPosRef.current = cur;

    let state = player.animation ?? "idle";
    if (state !== "jump" && state !== "fall") {
      // Disambiguate idle/walk/run from measured speed; trust state if it
      // already says walk/run (server may set it explicitly).
      if (state !== "walk" && state !== "run") {
        if (speed > 6) state = "run";
        else if (speed > 0.4) state = "walk";
        else state = "idle";
      }
    }

    // Phase rate: idle slow, walk medium scaled by speed, run fast.
    let rate = 1.2;
    if (state === "walk") rate = 3.0 + Math.min(speed, 6) * 0.5;
    else if (state === "run") rate = 6.5 + Math.min(speed, 12) * 0.4;
    else if (state === "jump" || state === "fall") rate = 0;

    phaseRef.current += dt * rate;
    const intensity = state === "idle" ? 1 : Math.min(1, 0.4 + speed * 0.15);

    const pose = poseFor(state, phaseRef.current, intensity);
    const blend = 1 - Math.pow(0.001, dt); // ~exp slerp, frame-rate independent

    const apply = (bone: THREE.Bone | null, e: THREE.Euler | undefined) => {
      if (!bone) return;
      const bq = bindQ.get(bone);
      if (!bq) return;
      if (!e) {
        // Settle back to bind pose.
        bone.quaternion.slerp(bq, blend);
        return;
      }
      addQ.setFromEuler(e);
      targetQ.copy(bq).multiply(addQ);
      tmpQ.copy(bone.quaternion).slerp(targetQ, blend);
      bone.quaternion.copy(tmpQ);
    };

    apply(rig.spine, pose.spine);
    apply(rig.head, pose.head);
    apply(rig.leftArm, pose.leftArm);
    apply(rig.rightArm, pose.rightArm);
    apply(rig.leftForeArm, pose.leftForeArm);
    apply(rig.rightForeArm, pose.rightForeArm);
    apply(rig.leftUpLeg, pose.leftUpLeg);
    apply(rig.rightUpLeg, pose.rightUpLeg);
    apply(rig.leftLeg, pose.leftLeg);
    apply(rig.rightLeg, pose.rightLeg);
  });

  // Log rig once for debugging.
  useEffect(() => {
    if (!rig) return;
    const found: string[] = [];
    const missing: string[] = [];
    (Object.entries(rig) as [string, THREE.Bone | null][]).forEach(([k, b]) => {
      (b ? found : missing).push(b ? `${k}=${b.name}` : k);
    });
    console.log(`[avatar/rig] found: ${found.join(", ")}`);
    if (missing.length) console.warn(`[avatar/rig] missing: ${missing.join(", ")}`);
  }, [rig]);

  if (!clone) return <AvatarPlaceholder player={player} />;
  const s = _library?.displayScale ?? 1;

  return (
    <group ref={outerRef}>
      <group scale={[s, s, s]}>
        <primitive object={clone} />
      </group>
      <Html position={[0, LABEL_HEIGHT, 0]} center distanceFactor={8} zIndexRange={[100, 0]} sprite>
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none select-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export default function Avatar({
  player,
  isLocal = false,
}: {
  player: RenderPlayer;
  isLocal?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    _loadState === "ready" ? "ready" : "loading",
  );

  useEffect(() => {
    if (_loadState === "ready") { setStatus("ready"); return; }
    ensureLibraryLoaded().then((ok) => setStatus(ok ? "ready" : "error"));
  }, []);

  if (status === "error") return <AvatarPlaceholder player={player} error />;
  if (status !== "ready") return <AvatarPlaceholder player={player} />;
  return <AvatarMesh player={player} />;
}
