/**
 * Avatar.tsx — .rebur pipeline (procedural animations)
 *
 *  1. Load Avatar.fbx (mesh + skeleton only — no animation FBX files)
 *  2. Compile to a ReburAsset via buildReburAsset() (mesh + skeleton, no clips)
 *     • Normalises skin weights to ≤4 per vertex
 *     • Serialises geometry + skeleton to plain JSON
 *  3. Cache the compiled JSON in IndexedDB (no size limit; key = REBUR_CACHE_KEY)
 *     so the FBX is only parsed once; subsequent page loads skip straight to 4.
 *  4. Instantiate via instantiateReburAsset() → SkinnedMesh
 *  5. Build procedural THREE.AnimationClip objects targeting the exact bone names
 *     in the rig (no external FBX animations required).
 *
 * Bone rig (17 bones):
 *   wiest · hip · chest · neck · head
 *   upperleg.L · lowerleg.L · upperleg.R · lowerleg.R
 *   KTF.L · upperarm.L · lowerarm.L · hand.L
 *   KTF.R · upperarm.R · lowerarm.R · hand.R
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";
import { buildReburAsset, instantiateReburAsset, parseReburFile } from "@/lib/rebur";
import type { ReburAsset } from "@/lib/rebur";

// Avatar.fbx is the single source of truth — all animations are procedural.
import avatarFbxUrl from "./Avatar.fbx?url";

// ── Cache config ──────────────────────────────────────────────────────────────
const REBUR_CACHE_KEY = "rebur:avatar:v8";
const IDB_DB_NAME     = "rebur-cache";
const IDB_STORE       = "assets";
const LABEL_HEIGHT    = 2.4;
const FADE_TIME       = 0.2;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
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
  } catch { return undefined; }
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
  } catch (e) { console.warn("[rebur] IndexedDB write failed:", e); }
}

// ── Procedural animations ─────────────────────────────────────────────────────
// All animations are built from THREE.QuaternionKeyframeTrack targeting the
// exact bone names in the user's Avatar.fbx rig.

/** Convert Euler angles (radians) to a flat [x,y,z,w] quaternion array. */
function qe(rx: number, ry: number, rz: number): number[] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  return [q.x, q.y, q.z, q.w];
}
const I = qe(0, 0, 0); // identity / rest pose

/**
 * Build one QuaternionKeyframeTrack.
 * @param bone   Bone name exactly as it appears in the skeleton
 * @param times  Array of keyframe times (seconds)
 * @param quats  Array of [x,y,z,w] per keyframe
 */
function qt(
  bone: string,
  times: number[],
  quats: number[][],
): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    times,
    quats.flat(),
  );
}

/**
 * Create all procedural animation clips for the humanoid rig.
 * Only bones that actually exist in the skeleton are targeted — missing
 * names are silently skipped so the function is safe with any rig variant.
 */
function createProceduralAnimations(skeleton: THREE.Skeleton): THREE.AnimationClip[] {
  const boneNames = new Set(skeleton.bones.map((b) => b.name));
  const has = (n: string) => boneNames.has(n);

  // ── IDLE (2 s loop) ───────────────────────────────────────────────────────
  // Gentle breathing (chest), soft head bob, arms relaxed at sides.
  const idleTracks: THREE.KeyframeTrack[] = [];

  if (has("chest")) {
    idleTracks.push(qt("chest", [0, 1, 2], [
      qe(0,     0, 0),
      qe(0.03,  0, 0),   // slight forward tilt on breath-in
      qe(0,     0, 0),
    ]));
  }
  if (has("head")) {
    idleTracks.push(qt("head", [0, 0.5, 1, 1.5, 2], [
      qe(0,  0,     0),
      qe(0,  0.03,  0),   // look very slightly left
      qe(0,  0,     0),
      qe(0, -0.03,  0),   // look very slightly right
      qe(0,  0,     0),
    ]));
  }
  // Arms hang naturally — barely perceptible sway
  if (has("upperarm.L")) {
    idleTracks.push(qt("upperarm.L", [0, 1, 2], [
      qe(0, 0,  0.02),
      qe(0, 0, -0.02),
      qe(0, 0,  0.02),
    ]));
  }
  if (has("upperarm.R")) {
    idleTracks.push(qt("upperarm.R", [0, 1, 2], [
      qe(0, 0, -0.02),
      qe(0, 0,  0.02),
      qe(0, 0, -0.02),
    ]));
  }
  const idleClip = new THREE.AnimationClip("idle", 2, idleTracks);

  // ── WALK (1 s loop) ───────────────────────────────────────────────────────
  // Standard bipedal stride.  Left leg leads at t=0, right leg leads at t=0.5.
  // Arms counter-swing against the legs.
  const walkTracks: THREE.KeyframeTrack[] = [];
  const WS = Math.PI / 7;   // ~25° leg swing
  const WK = Math.PI / 5;   // ~36° knee bend
  const WA = Math.PI / 10;  // ~18° arm swing

  // Left leg — forward at t=0, back at t=0.5
  if (has("upperleg.L")) {
    walkTracks.push(qt("upperleg.L", [0, 0.5, 1], [
      qe(-WS, 0, 0),
      qe( WS, 0, 0),
      qe(-WS, 0, 0),
    ]));
  }
  if (has("lowerleg.L")) {
    walkTracks.push(qt("lowerleg.L", [0, 0.25, 0.5, 0.75, 1], [
      qe(0,   0, 0),   // straight (leading)
      qe(WK,  0, 0),   // bent (heel-strike pull-through)
      qe(0,   0, 0),   // straight (planted)
      qe(WK,  0, 0),   // bent (toe-off swing)
      qe(0,   0, 0),
    ]));
  }

  // Right leg — back at t=0, forward at t=0.5 (opposite phase)
  if (has("upperleg.R")) {
    walkTracks.push(qt("upperleg.R", [0, 0.5, 1], [
      qe( WS, 0, 0),
      qe(-WS, 0, 0),
      qe( WS, 0, 0),
    ]));
  }
  if (has("lowerleg.R")) {
    walkTracks.push(qt("lowerleg.R", [0, 0.25, 0.5, 0.75, 1], [
      qe(WK,  0, 0),
      qe(0,   0, 0),
      qe(WK,  0, 0),
      qe(0,   0, 0),
      qe(WK,  0, 0),
    ]));
  }

  // Arms counter-swing (left arm back when left leg forward)
  if (has("upperarm.L")) {
    walkTracks.push(qt("upperarm.L", [0, 0.5, 1], [
      qe( WA, 0, 0),
      qe(-WA, 0, 0),
      qe( WA, 0, 0),
    ]));
  }
  if (has("upperarm.R")) {
    walkTracks.push(qt("upperarm.R", [0, 0.5, 1], [
      qe(-WA, 0, 0),
      qe( WA, 0, 0),
      qe(-WA, 0, 0),
    ]));
  }

  // Waist slight counter-rotation
  if (has("wiest")) {
    walkTracks.push(qt("wiest", [0, 0.5, 1], [
      qe(0,  0.04, 0),
      qe(0, -0.04, 0),
      qe(0,  0.04, 0),
    ]));
  }

  // Head stays level
  if (has("head")) {
    walkTracks.push(qt("head", [0, 1], [I, I]));
  }
  const walkClip = new THREE.AnimationClip("walk", 1, walkTracks);

  // ── RUN (0.55 s loop) ─────────────────────────────────────────────────────
  // Same pattern as walk, larger angles, slightly forward torso lean.
  const runTracks: THREE.KeyframeTrack[] = [];
  const RS = Math.PI / 4.5;  // ~40° leg swing
  const RK = Math.PI / 3.2;  // ~56° knee bend
  const RA = Math.PI / 5;    // ~36° arm swing

  if (has("upperleg.L")) {
    runTracks.push(qt("upperleg.L", [0, 0.275, 0.55], [
      qe(-RS, 0, 0),
      qe( RS, 0, 0),
      qe(-RS, 0, 0),
    ]));
  }
  if (has("lowerleg.L")) {
    runTracks.push(qt("lowerleg.L", [0, 0.14, 0.275, 0.41, 0.55], [
      qe(0,   0, 0),
      qe(RK,  0, 0),
      qe(0,   0, 0),
      qe(RK,  0, 0),
      qe(0,   0, 0),
    ]));
  }
  if (has("upperleg.R")) {
    runTracks.push(qt("upperleg.R", [0, 0.275, 0.55], [
      qe( RS, 0, 0),
      qe(-RS, 0, 0),
      qe( RS, 0, 0),
    ]));
  }
  if (has("lowerleg.R")) {
    runTracks.push(qt("lowerleg.R", [0, 0.14, 0.275, 0.41, 0.55], [
      qe(RK,  0, 0),
      qe(0,   0, 0),
      qe(RK,  0, 0),
      qe(0,   0, 0),
      qe(RK,  0, 0),
    ]));
  }
  if (has("upperarm.L")) {
    runTracks.push(qt("upperarm.L", [0, 0.275, 0.55], [
      qe( RA, 0, 0),
      qe(-RA, 0, 0),
      qe( RA, 0, 0),
    ]));
  }
  if (has("upperarm.R")) {
    runTracks.push(qt("upperarm.R", [0, 0.275, 0.55], [
      qe(-RA, 0, 0),
      qe( RA, 0, 0),
      qe(-RA, 0, 0),
    ]));
  }
  // Slight forward torso lean while running
  if (has("chest")) {
    runTracks.push(qt("chest", [0, 0.55], [
      qe(0.12, 0, 0),
      qe(0.12, 0, 0),
    ]));
  }
  if (has("wiest")) {
    runTracks.push(qt("wiest", [0, 0.275, 0.55], [
      qe(0.06,  0.06, 0),
      qe(0.06, -0.06, 0),
      qe(0.06,  0.06, 0),
    ]));
  }
  const runClip = new THREE.AnimationClip("run", 0.55, runTracks);

  // ── JUMP (1.4 s one-shot) ─────────────────────────────────────────────────
  // 0.00  crouch — legs bent, arms back
  // 0.20  launch — legs extend, arms swing up
  // 0.55  airborne peak — legs pull up, arms out
  // 1.00  descend — legs extend forward for landing
  // 1.40  land — slight absorb crouch, return to rest
  const jumpTracks: THREE.KeyframeTrack[] = [];
  const JT = [0, 0.2, 0.55, 1.0, 1.4];

  if (has("upperleg.L")) {
    jumpTracks.push(qt("upperleg.L", JT, [
      qe(-0.4,  0, 0),   // crouch
      qe( 0.1,  0, 0),   // launch extension
      qe(-0.5,  0, 0),   // tuck up
      qe(-0.2,  0, 0),   // extend for landing
      qe( 0,    0, 0),   // rest
    ]));
  }
  if (has("upperleg.R")) {
    jumpTracks.push(qt("upperleg.R", JT, [
      qe(-0.4,  0, 0),
      qe( 0.1,  0, 0),
      qe(-0.5,  0, 0),
      qe(-0.2,  0, 0),
      qe( 0,    0, 0),
    ]));
  }
  if (has("lowerleg.L")) {
    jumpTracks.push(qt("lowerleg.L", JT, [
      qe(0.6,  0, 0),   // bent in crouch
      qe(0,    0, 0),   // extend on launch
      qe(0.7,  0, 0),   // tuck
      qe(0.2,  0, 0),   // prep for landing
      qe(0.3,  0, 0),   // land absorb
    ]));
  }
  if (has("lowerleg.R")) {
    jumpTracks.push(qt("lowerleg.R", JT, [
      qe(0.6,  0, 0),
      qe(0,    0, 0),
      qe(0.7,  0, 0),
      qe(0.2,  0, 0),
      qe(0.3,  0, 0),
    ]));
  }
  if (has("upperarm.L")) {
    jumpTracks.push(qt("upperarm.L", JT, [
      qe( 0.3,  0, 0),   // arms back in crouch
      qe(-0.8,  0, 0),   // arms swing up on launch
      qe(-0.4,  0, 0),   // arms out in air
      qe(-0.2,  0, 0),   // prep landing
      qe( 0,    0, 0),   // rest
    ]));
  }
  if (has("upperarm.R")) {
    jumpTracks.push(qt("upperarm.R", JT, [
      qe( 0.3,  0, 0),
      qe(-0.8,  0, 0),
      qe(-0.4,  0, 0),
      qe(-0.2,  0, 0),
      qe( 0,    0, 0),
    ]));
  }
  if (has("chest")) {
    jumpTracks.push(qt("chest", JT, [
      qe( 0.1,  0, 0),   // slight lean in crouch
      qe(-0.05, 0, 0),   // back on launch
      qe( 0,    0, 0),
      qe( 0.05, 0, 0),
      qe( 0,    0, 0),
    ]));
  }
  const jumpClip = new THREE.AnimationClip("jump", 1.4, jumpTracks);

  const clips = [idleClip, walkClip, runClip, jumpClip];
  console.log(`[rebur] Created ${clips.length} procedural animation clips`);
  return clips;
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
      console.log("[rebur] Avatar mesh loaded from IndexedDB cache ✓");
      return true;
    }
  } catch (e) {
    console.warn("[rebur] IDB cache read failed, re-compiling:", e);
  }

  // ── 2. Load Avatar.fbx and compile mesh+skeleton only ────────────────────
  try {
    const loader = new FBXLoader();
    console.log("[rebur] Loading Avatar.fbx…");

    const baseFbx = await loader.loadAsync(avatarFbxUrl);
    console.log("[rebur] FBX loaded, compiling .rebur asset (mesh + skeleton only)…");

    // No animation sources — all animations are procedural
    const asset = buildReburAsset("avatar", baseFbx as THREE.Group, []);

    console.log(
      `[rebur] Compiled: ${asset.skeleton.bones.length} bones, modelScale=${asset.modelScale}`,
    );

    // ── 3. Store in IndexedDB ────────────────────────────────────────────────
    await idbSet(REBUR_CACHE_KEY, JSON.stringify(asset));
    console.log("[rebur] Avatar mesh cached to IndexedDB ✓");

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

// ── The real skinned avatar ───────────────────────────────────────────────────
function AvatarMesh({ player }: { player: RenderPlayer }) {
  const groupRef    = useRef<THREE.Group>(null);
  const mixerRef    = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef  = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim = useRef<string>("idle");

  // Instantiate once from the cached .rebur asset
  const instanceRef = useRef<ReturnType<typeof instantiateReburAsset> | null>(null);
  if (!instanceRef.current && _asset) {
    try {
      instanceRef.current = instantiateReburAsset(_asset);
    } catch (e) {
      console.error("[rebur] instantiateReburAsset failed:", e);
    }
  }

  // Build AnimationMixer and procedural clips once
  useEffect(() => {
    const inst = instanceRef.current;
    if (!inst) return;

    const clips  = createProceduralAnimations(inst.skeleton);
    const mixer  = new THREE.AnimationMixer(inst.mesh);
    mixerRef.current    = mixer;
    actionsRef.current  = {};
    currentAnim.current = "idle";

    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.setLoop(
        clip.name === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = clip.name === "jump";
      actionsRef.current[clip.name] = action;
    }

    // Start idle immediately
    const idle = actionsRef.current["idle"];
    if (idle) idle.play();

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(inst.mesh);
    };
  }, []);

  // Animation state machine — reacts to server-sent animation name
  useEffect(() => {
    let target = player.animation ?? "idle";
    if (target === "fall" || target === "ragdoll") target = "idle";
    if (!actionsRef.current[target]) target = "idle";
    if (!actionsRef.current[target]) {
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
        The inner group restores the scale that FBXLoader originally applied
        (captured in modelScale during buildReburAsset).  The outer groupRef
        handles world-space position/rotation only, so the Html label stays
        at the correct world height regardless of model units.
      */}
      <group scale={[inst.modelScale, inst.modelScale, inst.modelScale]}>
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    _state === "ready" ? "ready" : "loading",
  );

  useEffect(() => {
    if (_state === "ready") { setStatus("ready"); return; }
    ensureAvatarLoaded().then((ok) => {
      setStatus(ok ? "ready" : "error");
    });
  }, []);

  if (status === "error") return <AvatarPlaceholder player={player} error />;
  if (status !== "ready") return <AvatarPlaceholder player={player} />;
  return <AvatarMesh player={player} />;
}
