/**
 * Avatar.tsx
 *
 * Loads the base character mesh from Aavatar_all_animations_unity.fbx
 * and retargets animations from the separate per-state FBX files:
 *   /Idle.fbx · /Walking.fbx · /Running.fbx · /Jump.fbx
 *
 * All five FBX files are loaded once and cached by React Three Fiber's
 * useLoader.  Each avatar instance gets its own SkeletonUtils-cloned scene
 * so animations run independently per player.
 *
 * On first mount the combined data is serialised into a .rebur asset and
 * cached at module level.  Call downloadAvatarRebur() to export it.
 */

import { useEffect, useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";
import { buildReburAsset, exportReburAsset } from "@/lib/rebur";
import type { ReburAsset } from "@/lib/rebur";

// ── Constants ──────────────────────────────────────────────────────────────────
const AVATAR_SCALE = 0.022;
const LABEL_HEIGHT  = 2.4;
const FADE_TIME     = 0.2;

// ── Module-level .rebur cache ─────────────────────────────────────────────────
// Built once after all FBX files are loaded, then kept in memory.
let _reburAsset: ReburAsset | null = null;

/** Returns the compiled .rebur asset (null until Avatar first mounts). */
export function getAvatarReburAsset(): ReburAsset | null {
  return _reburAsset;
}

/** Download the compiled avatar as a .rebur file. */
export function downloadAvatarRebur(): void {
  if (_reburAsset) {
    exportReburAsset(_reburAsset, "avatar.rebur");
  } else {
    console.warn("[rebur] Avatar asset not yet compiled — open Play mode first.");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type LoadedFbx = THREE.Group & { animations: THREE.AnimationClip[] };

function compileClips(
  idleFbx: LoadedFbx,
  walkFbx:  LoadedFbx,
  runFbx:   LoadedFbx,
  jumpFbx:  LoadedFbx,
): Record<string, THREE.AnimationClip> {
  const sources = [
    { key: "idle", fbx: idleFbx },
    { key: "walk", fbx: walkFbx },
    { key: "run",  fbx: runFbx  },
    { key: "jump", fbx: jumpFbx },
  ] as const;

  const map: Record<string, THREE.AnimationClip> = {};
  for (const { key, fbx } of sources) {
    if (fbx.animations?.length) {
      const clip = fbx.animations[0].clone();
      clip.name  = key;
      map[key]   = clip;
    }
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Avatar({
  player,
  isLocal = false,
}: {
  player:   RenderPlayer;
  isLocal?: boolean;
}) {
  const groupRef      = useRef<THREE.Group>(null);
  const mixerRef      = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef    = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim   = useRef<string>("");

  // ── Load all FBX files (cached by useLoader) ─────────────────────────────
  const baseFbx = useLoader(FBXLoader, "/Aavatar_all_animations_unity.fbx") as LoadedFbx;
  const idleFbx = useLoader(FBXLoader, "/Idle.fbx")    as LoadedFbx;
  const walkFbx = useLoader(FBXLoader, "/Walking.fbx") as LoadedFbx;
  const runFbx  = useLoader(FBXLoader, "/Running.fbx") as LoadedFbx;
  const jumpFbx = useLoader(FBXLoader, "/Jump.fbx")    as LoadedFbx;

  // ── Per-instance scene clone (SkeletonUtils keeps skeleton intact) ────────
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(baseFbx) as THREE.Group;
    clone.scale.setScalar(AVATAR_SCALE);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow    = true;
        (child as THREE.Mesh).receiveShadow = true;
      }
    });
    return clone;
  }, [baseFbx]);

  // ── Named animation clips from the separate animation FBXes ──────────────
  const clips = useMemo(() => {
    const map = compileClips(idleFbx, walkFbx, runFbx, jumpFbx);

    // Build and cache the .rebur asset on first call
    if (!_reburAsset) {
      try {
        _reburAsset = buildReburAsset("avatar", baseFbx as unknown as THREE.Group, [
          { name: "idle", group: idleFbx as unknown as THREE.Group },
          { name: "walk", group: walkFbx as unknown as THREE.Group },
          { name: "run",  group: runFbx  as unknown as THREE.Group },
          { name: "jump", group: jumpFbx as unknown as THREE.Group },
        ]);
        console.log("[rebur] Avatar .rebur compiled ✓");
      } catch (e) {
        console.warn("[rebur] Could not compile .rebur asset:", e);
      }
    }

    return map;
  }, [baseFbx, idleFbx, walkFbx, runFbx, jumpFbx]);

  // ── AnimationMixer setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!scene) return;

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current  = mixer;
    actionsRef.current = {};
    currentAnim.current = "";

    for (const [name, clip] of Object.entries(clips)) {
      const action = mixer.clipAction(clip);
      action.setLoop(
        name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = name === "jump";
      actionsRef.current[name] = action;
    }

    const idle = actionsRef.current["idle"];
    if (idle) {
      idle.play();
      currentAnim.current = "idle";
    }

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [scene, clips]);

  // ── Animation state machine ───────────────────────────────────────────────
  useEffect(() => {
    let target = player.animation || "idle";
    if (target === "fall" || target === "ragdoll") target = "idle";
    if (!actionsRef.current[target]) target = "idle";
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

  // ── Per-frame: advance mixer + sync position from server state ───────────
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.066);
    mixerRef.current?.update(dt);

    const g = groupRef.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />

      {/* Username label */}
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
