/**
 * Avatar.tsx
 *
 * Loads Avatar.fbx (mesh + skeleton) and the four animation FBX files
 * using a non-blocking approach: THREE.FBXLoader.loadAsync() runs in
 * useEffect so the Canvas renders immediately with a capsule placeholder,
 * then the real model swaps in once all files are ready.
 *
 * This avoids the WebGL context loss that `useLoader` / Suspense caused
 * by blocking the whole Canvas render tree during a heavy async load.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

const AVATAR_SCALE = 0.022;
const LABEL_HEIGHT = 2.4;
const FADE_TIME    = 0.2;

// Shared cache — load once, reuse per instance
let _cachedBase:  THREE.Group | null = null;
let _cachedClips: Record<string, THREE.AnimationClip> | null = null;
let _loadPromise: Promise<void> | null = null;

async function loadAvatarAssets(): Promise<void> {
  if (_cachedClips) return; // already loaded
  if (_loadPromise) return _loadPromise;

  const loader = new FBXLoader();
  _loadPromise = (async () => {
    try {
      const [base, idle, walk, run, jump] = await Promise.all([
        loader.loadAsync("/Avatar.fbx"),
        loader.loadAsync("/Idle.fbx"),
        loader.loadAsync("/Walking.fbx"),
        loader.loadAsync("/Running.fbx"),
        loader.loadAsync("/Jump.fbx"),
      ]);

      base.scale.setScalar(AVATAR_SCALE);
      base.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
        }
      });
      _cachedBase = base;

      const map: Record<string, THREE.AnimationClip> = {};
      for (const { key, fbx } of [
        { key: "idle", fbx: idle },
        { key: "walk", fbx: walk },
        { key: "run",  fbx: run  },
        { key: "jump", fbx: jump },
      ] as const) {
        if ((fbx as THREE.Group & { animations: THREE.AnimationClip[] }).animations?.length) {
          const clip = (fbx as THREE.Group & { animations: THREE.AnimationClip[] }).animations[0].clone();
          clip.name = key;
          map[key]  = clip;
        }
      }
      _cachedClips = map;
    } catch (err) {
      console.warn("[Avatar] FBX load failed:", err);
      _loadPromise = null; // allow retry
    }
  })();

  return _loadPromise;
}

// ── Capsule placeholder shown while FBX loads ─────────────────────────────────
function AvatarPlaceholder({ player }: { player: RenderPlayer }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 4, 8]} />
        <meshStandardMaterial color="#4a90d9" />
      </mesh>
      <Html position={[0, LABEL_HEIGHT, 0]} center distanceFactor={8} zIndexRange={[100, 0]} sprite>
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none select-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}

// ── Fully loaded FBX avatar ───────────────────────────────────────────────────
function AvatarFBX({ player }: { player: RenderPlayer }) {
  const groupRef    = useRef<THREE.Group>(null);
  const mixerRef    = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef  = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim = useRef<string>("");

  // Clone the cached base once per instance
  const sceneRef = useRef<THREE.Group | null>(null);
  if (!sceneRef.current && _cachedBase) {
    sceneRef.current = SkeletonUtils.clone(_cachedBase) as THREE.Group;
  }

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !_cachedClips) return;

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current   = mixer;
    actionsRef.current = {};
    currentAnim.current = "";

    for (const [name, clip] of Object.entries(_cachedClips)) {
      const action = mixer.clipAction(clip);
      action.setLoop(name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = name === "jump";
      actionsRef.current[name] = action;
    }

    const idle = actionsRef.current["idle"];
    if (idle) { idle.play(); currentAnim.current = "idle"; }

    return () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); };
  }, []);

  // Animation state machine
  useEffect(() => {
    let target = player.animation || "idle";
    if (target === "fall" || target === "ragdoll") target = "idle";
    if (!actionsRef.current[target]) target = "idle";
    if (target === currentAnim.current) return;

    const next = actionsRef.current[target];
    const prev = actionsRef.current[currentAnim.current];
    if (next && prev && prev !== next) { next.reset().fadeIn(FADE_TIME).play(); prev.fadeOut(FADE_TIME); }
    else if (next) { next.reset().play(); }
    currentAnim.current = target;
  }, [player.animation]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.066);
    mixerRef.current?.update(dt);
    const g = groupRef.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });

  const scene = sceneRef.current;
  if (!scene) return <AvatarPlaceholder player={player} />;

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      <Html position={[0, LABEL_HEIGHT, 0]} center distanceFactor={8} zIndexRange={[100, 0]} sprite>
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
  const [ready, setReady] = useState(!!(_cachedClips && _cachedBase));

  useEffect(() => {
    if (ready) return;
    loadAvatarAssets().then(() => {
      if (_cachedClips && _cachedBase) setReady(true);
    });
  }, [ready]);

  if (!ready) return <AvatarPlaceholder player={player} />;
  return <AvatarFBX player={player} />;
}
