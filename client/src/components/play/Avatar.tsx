import { useEffect, useMemo, useRef } from "react";
import { Html, useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RenderPlayer } from "@shared/render-types";

// Preload so the first player doesn't stutter
useGLTF.preload("/Avatar_all_animations.glb");

// Map engine animation states → possible GLB clip names (first match wins)
const ANIM_MAP: Record<string, string[]> = {
  idle:    ["idle", "Idle", "IDLE", "Stand", "stand", "T-Pose", "TPose"],
  walk:    ["walk", "Walk", "WALK", "Walking", "walking"],
  run:     ["run",  "Run",  "RUN",  "Running", "running", "Sprint", "sprint"],
  jump:    ["jump", "Jump", "JUMP", "Jumping", "jumping"],
  fall:    ["fall", "Fall", "FALL", "Falling",  "falling", "InAir"],
  ragdoll: ["ragdoll", "Ragdoll", "Death", "death", "Die"],
};

function resolveAnim(names: string[], want: string): string | null {
  const aliases = ANIM_MAP[want] ?? [want];
  for (const alias of aliases) {
    const hit = names.find(n => n.toLowerCase() === alias.toLowerCase());
    if (hit) return hit;
  }
  // Partial match fallback
  const partial = names.find(n => n.toLowerCase().includes(want.toLowerCase()));
  return partial ?? names[0] ?? null;
}

export default function Avatar({
  player,
  isLocal = false,
}: {
  player: RenderPlayer;
  isLocal?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Shared GLTF loaded once; clone per instance so skeletons are independent
  const { scene: origScene, animations } = useGLTF("/Avatar_all_animations.glb");
  const cloned = useMemo(() => cloneSkeleton(origScene), [origScene]);

  const { actions, names } = useAnimations(animations, groupRef);
  const lastAnim = useRef<string>("");

  // Play initial animation after actions are ready
  useEffect(() => {
    if (!actions || names.length === 0) return;
    const first = resolveAnim(names, player.animation || "idle");
    if (first && actions[first]) {
      actions[first]!.reset().play();
      lastAnim.current = player.animation || "idle";
    }
  }, [actions, names]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition on animation change
  useEffect(() => {
    if (!actions || names.length === 0) return;
    const want = player.animation || "idle";
    if (want === lastAnim.current) return;
    lastAnim.current = want;

    const next = resolveAnim(names, want);
    if (!next) return;

    // Fade out everything, fade in new clip
    Object.values(actions).forEach(a => a?.fadeOut(0.25));
    const action = actions[next];
    if (action) action.reset().fadeIn(0.25).play();
  }, [player.animation, actions, names]);

  return (
    <group
      ref={groupRef}
      position={[player.position.x, player.position.y, player.position.z]}
      rotation={[0, player.rotation.y ?? 0, 0]}
    >
      <primitive object={cloned} />

      {/* Username tag */}
      <Html
        position={[0, 2.2, 0]}
        center
        distanceFactor={8}
        zIndexRange={[100, 0]}
        sprite
      >
        <div style={{
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.72)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          fontFamily: "sans-serif",
        }}>
          {player.name}
        </div>
      </Html>
    </group>
  );
}
