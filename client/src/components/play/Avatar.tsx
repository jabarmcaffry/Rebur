/**
 * Avatar.tsx — Direct FBX loading (no rebur serialisation pipeline)
 *
 *  1. Load Avatar.fbx once (mesh + skeleton + skin weights)
 *  2. Load Idle / Walking / Running / Jumping.fbx once (animation clips only)
 *  3. For each avatar instance, SkeletonUtils.clone() the base group so every
 *     player gets their own independent skeleton without re-parsing the FBX.
 *  4. Attach an AnimationMixer to the cloned group and play clips from the
 *     shared animation library.
 *
 * This avoids every class of deformation bug caused by manually reconstructing
 * skeletons from serialised bone transforms / boneInverses.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

// FBX asset URLs — Vite resolves these to hashed public paths
import avatarFbxUrl  from "./Avatar.fbx?url";
import idleFbxUrl    from "./Idle.fbx?url";
import walkFbxUrl    from "./Walking.fbx?url";
import runFbxUrl     from "./Running.fbx?url";
import jumpFbxUrl    from "./Jumping.fbx?url";

const LABEL_HEIGHT = 2.4;
const FADE_TIME    = 0.2;

// Target character height in world units.  The base group is scaled so the
// avatar's bounding box height matches this value exactly.
const TARGET_HEIGHT = 1.8;

// ── Shared load state (FBX files parsed once, shared across all instances) ────
interface AvatarLibrary {
  /** The original FBX group — clone this per instance, never use it directly */
  baseGroup: THREE.Group;
  /** Named animation clips extracted from the animation FBX files */
  clips: Record<string, THREE.AnimationClip>;
  /**
   * Uniform scale to apply to each clone so the avatar matches TARGET_HEIGHT.
   * Computed once from the bounding box of the base group.
   */
  displayScale: number;
}

type LoadState = "idle" | "loading" | "ready" | "error";
let _loadState: LoadState = "idle";
let _library: AvatarLibrary | null = null;
let _waiters: Array<(ok: boolean) => void> = [];

function notifyWaiters(ok: boolean) {
  _waiters.forEach((fn) => fn(ok));
  _waiters = [];
}

/**
 * Returns true if a bone name is an end / leaf bone that should never drive
 * mesh deformation.  End bones are purely structural (they mark the tip of a
 * bone chain) and carry no skinned vertices — animating them pulls any
 * accidentally-weighted vertices to wild positions.
 *
 * Matches names that end with (case-insensitive):
 *   _end  .end  End   (e.g. handL_end, head_end, lowerlegR_end, Toe_End)
 */
function isEndBone(boneName: string): boolean {
  return /_end$/i.test(boneName) || /\.end$/i.test(boneName) || /End$/i.test(boneName);
}

/**
 * Remap animation clip track names so they reference bones that actually exist
 * in the target skeleton.  Animation FBX exports from some tools prefix bone
 * names with an armature name (e.g. "Armature|mixamorig:Hips.position") while
 * the base mesh may use just "mixamorig:Hips.position".  We strip any prefix
 * up to and including the first "|" so clips can drive any standard skeleton.
 *
 * End/leaf bones (_end suffix) are always dropped regardless of whether they
 * exist in the skeleton — they have no geometry influence and should never
 * be driven by animation tracks.
 */
function remapClip(
  clip: THREE.AnimationClip,
  boneNames: Set<string>,
): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.tracks = cloned.tracks
    .map((track) => {
      // Track name format: "BoneName.property"
      const dotIdx  = track.name.lastIndexOf(".");
      const rawBone = dotIdx >= 0 ? track.name.slice(0, dotIdx) : track.name;
      const prop    = dotIdx >= 0 ? track.name.slice(dotIdx)    : "";

      // Always drop end/leaf bone tracks — they deform vertices if driven
      if (isEndBone(rawBone)) return null;

      // Already matches — keep as-is
      if (boneNames.has(rawBone)) return track;

      // Strip "ArmatureName|" prefix (Blender / Mixamo exports)
      const pipeIdx = rawBone.indexOf("|");
      if (pipeIdx >= 0) {
        const stripped = rawBone.slice(pipeIdx + 1);
        // Also drop if the stripped name is an end bone
        if (isEndBone(stripped)) return null;
        if (boneNames.has(stripped)) {
          const clonedTrack = track.clone();
          clonedTrack.name  = stripped + prop;
          return clonedTrack;
        }
      }

      // No matching bone — drop this track
      return null;
    })
    .filter((t): t is THREE.KeyframeTrack => t !== null);

  return cloned;
}

async function ensureLibraryLoaded(): Promise<boolean> {
  if (_loadState === "ready")   return true;
  if (_loadState === "error")   return false;
  if (_loadState === "loading") {
    return new Promise((resolve) => _waiters.push(resolve));
  }

  _loadState = "loading";

  try {
    const loader = new FBXLoader();

    console.log("[avatar] Loading FBX files…");
    const [baseFbx, idleFbx, walkFbx, runFbx, jumpFbx] = await Promise.all([
      loader.loadAsync(avatarFbxUrl),
      loader.loadAsync(idleFbxUrl),
      loader.loadAsync(walkFbxUrl),
      loader.loadAsync(runFbxUrl),
      loader.loadAsync(jumpFbxUrl),
    ]);
    console.log("[avatar] All FBX files loaded ✓");

    // Collect all bone names from the base skeleton for remapping + logging
    const boneNames = new Set<string>();
    baseFbx.traverse((child) => {
      if ((child as THREE.Bone).isBone) boneNames.add(child.name);
    });
    console.log(`[avatar] Base skeleton: ${boneNames.size} bones`);
    console.log(`[avatar] Bone names: ${[...boneNames].join(", ")}`);

    // Disable frustum culling on every SkinnedMesh in the base group
    // (bind-pose bounding box is too small once animations run)
    baseFbx.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        (child as THREE.SkinnedMesh).frustumCulled = false;
      }
    });

    // Extract and remap one clip per animation source
    const animSources: Array<{ name: string; fbx: THREE.Group }> = [
      { name: "idle", fbx: idleFbx },
      { name: "walk", fbx: walkFbx },
      { name: "run",  fbx: runFbx  },
      { name: "jump", fbx: jumpFbx },
    ];

    const clips: Record<string, THREE.AnimationClip> = {};
    for (const { name, fbx } of animSources) {
      if (!fbx.animations || fbx.animations.length === 0) {
        console.warn(`[avatar] "${name}" FBX has no animations — skipping`);
        continue;
      }
      const raw    = fbx.animations[0];
      const remapped = remapClip(raw, boneNames);
      remapped.name  = name;

      if (remapped.tracks.length === 0) {
        console.warn(`[avatar] "${name}" has 0 matching tracks after remap — skipping`);
        continue;
      }

      console.log(`[avatar] "${name}": ${remapped.tracks.length} tracks, ${remapped.duration.toFixed(2)}s`);
      clips[name] = remapped;
    }

    // ── Compute display scale from geometry vertices only ────────────────
    // We deliberately avoid setFromObject(baseFbx) because that traverses
    // the full scene graph including end/leaf bones, which stick out past
    // the actual mesh surface and inflate the measured height.
    // Instead we collect bounding boxes from SkinnedMesh geometries only —
    // these are computed from real vertex positions in the mesh's local
    // space, then expanded into a single world-space box.
    const box = new THREE.Box3();
    baseFbx.updateWorldMatrix(true, true);
    baseFbx.traverse((child) => {
      const sm = child as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.geometry.computeBoundingBox();
      const geoBB = sm.geometry.boundingBox;
      if (!geoBB) return;
      const worldBB = geoBB.clone().applyMatrix4(sm.matrixWorld);
      box.union(worldBB);
    });

    const size = new THREE.Vector3();
    box.getSize(size);
    const meshHeight = size.y;
    const displayScale = meshHeight > 0 ? TARGET_HEIGHT / meshHeight : 1;
    console.log(`[avatar] Geometry height=${meshHeight.toFixed(3)}, displayScale=${displayScale.toFixed(5)}`);

    _library    = { baseGroup: baseFbx, clips, displayScale };
    _loadState  = "ready";
    notifyWaiters(true);
    return true;
  } catch (err) {
    console.error("[avatar] Failed to load FBX files:", err);
    _loadState = "error";
    notifyWaiters(false);
    return false;
  }
}

// ── Placeholder shown while loading ──────────────────────────────────────────
function AvatarPlaceholder({
  player,
  error = false,
}: {
  player: RenderPlayer;
  error?: boolean;
}) {
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
        <meshStandardMaterial color={error ? "#ff4444" : "#4488ff"} />
      </mesh>
      <mesh position={[0, 1.75, 0]} frustumCulled={false}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color={error ? "#ff4444" : "#4488ff"} />
      </mesh>
      <Html
        position={[0, LABEL_HEIGHT, 0]}
        center
        distanceFactor={8}
        zIndexRange={[100, 0]}
        sprite
      >
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none select-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}

// ── Upper-arm spread helpers ──────────────────────────────────────────────────
// After mixer.update() the bone quaternions are fully set by the animation.
// We then multiply a small outward-rotation offset onto each upper-arm bone so
// the arms sit slightly away from the body, preventing mesh self-intersection.
// The offset is applied every frame — it is not cumulative because the mixer
// resets the quaternion on the next mixer.update() call.

// How many radians to spread each upper arm outward from the body.
const ARM_SPREAD_RAD = THREE.MathUtils.degToRad(15);

/**
 * Find a bone whose name *contains* any of the given substrings (case-insensitive).
 * Skips bones whose name contains any of the `exclude` substrings so we don't
 * accidentally grab the ForeArm or Hand bones.
 */
function findBoneByPattern(
  root: THREE.Object3D,
  include: string[],
  exclude: string[] = [],
): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (found) return;
    if (!(child as THREE.Bone).isBone) return;
    const lower = child.name.toLowerCase();
    const hit   = include.some((s) => lower.includes(s.toLowerCase()));
    const skip  = exclude.some((s) => lower.includes(s.toLowerCase()));
    if (hit && !skip) found = child as THREE.Bone;
  });
  return found;
}

// ── The live skinned avatar ───────────────────────────────────────────────────
function AvatarMesh({ player }: { player: RenderPlayer }) {
  const outerRef    = useRef<THREE.Group>(null);
  const mixerRef    = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef  = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim = useRef<string>("");

  // Upper-arm bone refs — populated once after the clone is built
  const leftArmBoneRef  = useRef<THREE.Bone | null>(null);
  const rightArmBoneRef = useRef<THREE.Bone | null>(null);

  // Pre-computed offset quaternions: rotate outward around the bone's local Z axis.
  // Left arm rotates +Z (spreads down/away on the left), right arm rotates -Z.
  const leftOffsetQ  = useRef(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ARM_SPREAD_RAD),
  );
  const rightOffsetQ = useRef(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), ARM_SPREAD_RAD),
  );

  // Clone base group once per instance so each avatar has its own skeleton
  const cloneRef = useRef<THREE.Group | null>(null);
  if (!cloneRef.current && _library) {
    // SkeletonUtils.clone deep-copies bones + skin weights correctly
    cloneRef.current = (SkeletonUtils as any).clone(_library.baseGroup) as THREE.Group;

    // Ensure frustum culling is off on the clone's skinned meshes too
    cloneRef.current.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        (child as THREE.SkinnedMesh).frustumCulled = false;
        (child as THREE.SkinnedMesh).castShadow    = false;
      }
    });

    // Locate upper-arm bones.
    // Patterns cover the most common naming styles:
    //   upperarmL / upperarmR  (this rig)
    //   LeftArm / RightArm     (Mixamo)
    //   upper_arm_l / upper_arm_r
    //   arm_l / arm_r
    // We exclude "lower" and "fore" so forearm bones are never matched.
    leftArmBoneRef.current = findBoneByPattern(
      cloneRef.current,
      ["upperarml", "upper_arm_l", "upperarm.l", "leftarm", "left_arm", "arm_l"],
      ["lower", "fore", "hand"],
    );
    rightArmBoneRef.current = findBoneByPattern(
      cloneRef.current,
      ["upperarmr", "upper_arm_r", "upperarm.r", "rightarm", "right_arm", "arm_r"],
      ["lower", "fore", "hand"],
    );

    console.log(
      `[avatar] Arm bones → left: ${leftArmBoneRef.current?.name ?? "not found"}, ` +
      `right: ${rightArmBoneRef.current?.name ?? "not found"}`,
    );
  }

  // Set up AnimationMixer once the clone exists
  useEffect(() => {
    const clone = cloneRef.current;
    const lib   = _library;
    if (!clone || !lib) return;

    const mixer = new THREE.AnimationMixer(clone);
    mixerRef.current   = mixer;
    actionsRef.current = {};
    currentAnim.current = "";

    for (const [name, clip] of Object.entries(lib.clips)) {
      const action = mixer.clipAction(clip, clone);
      action.setLoop(
        name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = name === "jump";
      actionsRef.current[name] = action;
    }

    // Start idle (or first available clip)
    const startClip = actionsRef.current["idle"] ?? Object.values(actionsRef.current)[0];
    if (startClip) {
      startClip.play();
      currentAnim.current = startClip.getClip().name;
    }

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clone);
    };
  }, []);

  // Animation state machine — respond to player.animation changes
  useEffect(() => {
    let target = player.animation ?? "idle";
    if (target === "fall" || target === "ragdoll") target = "idle";
    if (!actionsRef.current[target]) target = "idle";
    if (!actionsRef.current[target]) {
      const first = Object.keys(actionsRef.current)[0];
      if (!first) return;
      target = first;
    }
    if (target === currentAnim.current) return;

    const next = actionsRef.current[target];
    const prev = actionsRef.current[currentAnim.current];

    if (next && prev && prev !== next) {
      next.reset().fadeIn(FADE_TIME).play();
      prev.fadeOut(FADE_TIME);
    } else if (next) {
      next.reset().play();
    }

    currentAnim.current = target;
  }, [player.animation]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.066);
    mixerRef.current?.update(dt);

    // After mixer.update() the bones are at their animation-driven rotation.
    // Multiply the pre-computed outward-spread quaternion onto each upper arm
    // so the arms sit a fixed angle away from the torso regardless of animation.
    if (leftArmBoneRef.current) {
      leftArmBoneRef.current.quaternion.multiply(leftOffsetQ.current);
    }
    if (rightArmBoneRef.current) {
      rightArmBoneRef.current.quaternion.multiply(rightOffsetQ.current);
    }

    const g = outerRef.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });

  const clone = cloneRef.current;
  if (!clone) return <AvatarPlaceholder player={player} />;

  const s = _library?.displayScale ?? 1;

  return (
    <group ref={outerRef}>
      {/* Scale the clone so the avatar is exactly TARGET_HEIGHT units tall */}
      <group scale={[s, s, s]}>
        <primitive object={clone} />
      </group>
      <Html
        position={[0, LABEL_HEIGHT, 0]}
        center
        distanceFactor={8}
        zIndexRange={[100, 0]}
        sprite
      >
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none select-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function Avatar({
  player,
  isLocal = false,
}: {
  player:   RenderPlayer;
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
