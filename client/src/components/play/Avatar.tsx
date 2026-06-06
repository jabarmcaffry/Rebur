/**
 * Avatar.tsx — Full .rebur pipeline
 *
 *  1. Load Avatar.fbx (mesh + skeleton) + Idle / Walking / Running / Jump.fbx
 *  2. Compile to a ReburAsset via buildReburAsset()
 *     • Normalises skin weights to ≤4 per vertex
 *     • Filters out root-motion tracks that don't exist in Avatar.fbx's skeleton
 *     • Serialises geometry + skeleton + clips to plain JSON
 *  3. Cache the compiled JSON in IndexedDB (no size limit; key = REBUR_CACHE_KEY)
 *     so FBX files are only parsed once; subsequent page loads skip straight to 4.
 *  4. Instantiate via instantiateReburAsset() → SkinnedMesh + AnimationMixer
 *
 * A blue capsule placeholder is shown while the asset is loading/compiling.
 * Cache key is intentionally versioned — bump REBUR_CACHE_KEY whenever Avatar.fbx
 * or any animation file changes so old compiled data is discarded.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";
import { buildReburAsset, instantiateReburAsset, parseReburFile } from "@/lib/rebur";
import type { ReburAsset } from "@/lib/rebur";

// ── Cache config ──────────────────────────────────────────────────────────────
// Bump the version suffix any time Avatar.fbx or an animation file is updated.
const REBUR_CACHE_KEY = "rebur:avatar:v5";
const IDB_DB_NAME     = "rebur-cache";
const IDB_STORE       = "assets";
const LABEL_HEIGHT    = 2.4;
const FADE_TIME       = 0.2;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[rebur] IndexedDB write failed:", e);
  }
}

// ── Module-level shared compile state (single compile for all Avatar instances)
type LoadState = "idle" | "loading" | "ready" | "error";
let _state: LoadState = "idle";
let _asset: ReburAsset | null = null;
let _listeners: Array<(ok: boolean) => void> = [];

function notifyListeners(ok: boolean) {
  _listeners.forEach((fn) => fn(ok));
  _listeners = [];
}

async function ensureAvatarLoaded(): Promise<boolean> {
  if (_state === "ready") return true;
  if (_state === "error") return false;

  if (_state === "loading") {
    return new Promise((resolve) => _listeners.push(resolve));
  }

  _state = "loading";

  // ── 1. Try IndexedDB cache ────────────────────────────────────────────────
  try {
    const cached = await idbGet(REBUR_CACHE_KEY);
    if (cached) {
      const asset = parseReburFile(cached);
      _asset = asset;
      _state = "ready";
      notifyListeners(true);
      console.log("[rebur] Avatar loaded from IndexedDB cache ✓");
      return true;
    }
  } catch (e) {
    console.warn("[rebur] IDB cache read failed, re-compiling:", e);
  }

  // ── 2. Load FBX files and compile ────────────────────────────────────────
  try {
    const loader = new FBXLoader();
    console.log("[rebur] Loading FBX files…");

    const [baseFbx, idleFbx, walkFbx, runFbx, jumpFbx] = await Promise.all([
      loader.loadAsync("/Avatar.fbx"),
      loader.loadAsync("/Idle.fbx"),
      loader.loadAsync("/Walking.fbx"),
      loader.loadAsync("/Running.fbx"),
      loader.loadAsync("/Jump.fbx"),
    ]);

    console.log("[rebur] FBX files loaded, compiling .rebur asset…");

    const asset = buildReburAsset("avatar", baseFbx as THREE.Group, [
      { name: "idle", group: idleFbx  as THREE.Group },
      { name: "walk", group: walkFbx  as THREE.Group },
      { name: "run",  group: runFbx   as THREE.Group },
      { name: "jump", group: jumpFbx  as THREE.Group },
    ]);

    console.log(
      `[rebur] Compiled: ${asset.animations.length} animations`,
      asset.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(", "),
    );

    // ── 3. Store in IndexedDB ────────────────────────────────────────────
    await idbSet(REBUR_CACHE_KEY, JSON.stringify(asset));
    console.log("[rebur] Avatar cached to IndexedDB ✓");

    _asset = asset;
    _state = "ready";
    notifyListeners(true);
    return true;
  } catch (err) {
    console.error("[rebur] Avatar compile failed:", err);
    _state = "error";
    notifyListeners(false);
    return false;
  }
}

// ── Placeholder shown while loading (name label only, no capsule) ─────────────
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

// ── The real skinned avatar (rendered via .rebur instantiation) ───────────────
function AvatarMesh({ player }: { player: RenderPlayer }) {
  const groupRef    = useRef<THREE.Group>(null);
  const mixerRef    = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef  = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim = useRef<string>("idle");

  // Instantiate once — creates a normalised SkinnedMesh from the .rebur asset
  const instanceRef = useRef<ReturnType<typeof instantiateReburAsset> | null>(null);
  if (!instanceRef.current && _asset) {
    try {
      instanceRef.current = instantiateReburAsset(_asset);
    } catch (e) {
      console.error("[rebur] instantiateReburAsset failed:", e);
    }
  }

  // Set up AnimationMixer once the mesh is ready
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;

    const mixer = new THREE.AnimationMixer(inst.mesh);
    mixerRef.current    = mixer;
    actionsRef.current  = {};
    currentAnim.current = "idle";

    for (const clip of inst.clips) {
      const action = mixer.clipAction(clip);
      action.setLoop(
        clip.name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = clip.name === "jump";
      actionsRef.current[clip.name] = action;
    }

    // Start idle
    const idle = actionsRef.current["idle"];
    if (idle) {
      idle.play();
    } else {
      // Fall back to first available clip
      const first = inst.clips[0];
      if (first) { mixer.clipAction(first).play(); currentAnim.current = first.name; }
    }

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(inst.mesh);
    };
  }, []);

  // Animation state machine — react to server-sent animation name
  useEffect(() => {
    // Map server names → our clip names
    let target = player.animation ?? "idle";
    if (target === "fall" || target === "ragdoll") target = "idle";
    // Ensure the clip exists
    if (!actionsRef.current[target]) target = "idle";
    if (!actionsRef.current[target]) {
      // Still missing — try any available clip
      const fallback = Object.keys(actionsRef.current)[0];
      if (!fallback) return;
      target = fallback;
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
    const g = groupRef.current;
    if (!g) return;
    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;
  });

  const inst = instanceRef.current;
  if (!inst) return <AvatarPlaceholder player={player} />;

  return (
    <group ref={groupRef}>
      {/*
        FBX assets from Mixamo/standard exporters use centimetre units.
        Three.js FBXLoader compensates by setting scale 0.01 on the root
        group — but we stripped that group when we serialised the asset.
        The boneInverses were computed in the original 0.01-scaled world
        space, so we must restore that scale on the mesh wrapper or the
        skinning math will produce a 100× oversized, deformed avatar.
        The outer groupRef keeps world-space position/rotation; the inner
        group applies the cm→m scale so the Html label stays correctly
        positioned at world scale.
      */}
      <group scale={[0.01, 0.01, 0.01]}>
        <primitive object={inst.mesh} />
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

// ── Public Avatar component ───────────────────────────────────────────────────
export default function Avatar({
  player,
  isLocal = false,
}: {
  player:   RenderPlayer;
  isLocal?: boolean;
}) {
  const [ready, setReady] = useState(_state === "ready");

  useEffect(() => {
    if (_state === "ready") {
      setReady(true);
      return;
    }
    ensureAvatarLoaded().then((ok) => {
      if (ok) setReady(true);
    });
  }, []);

  if (!ready) return <AvatarPlaceholder player={player} />;
  return <AvatarMesh player={player} />;
}
