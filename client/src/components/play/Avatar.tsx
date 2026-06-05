import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useFBX } from "@react-three/drei";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

const AVATAR_SCALE = 0.022;
const LABEL_HEIGHT = 2.4;

function findClip(
  clips: THREE.AnimationClip[],
  keywords: string[],
): THREE.AnimationClip | undefined {
  for (const kw of keywords) {
    const found = clips.find((c) =>
      c.name.toLowerCase().includes(kw.toLowerCase()),
    );
    if (found) return found;
  }
  return undefined;
}

export default function Avatar({
  player,
  isLocal = false,
}: {
  player: RenderPlayer;
  isLocal?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnimRef = useRef<string>("");

  const fbx = useFBX("/Aavatar_all_animations_unity.fbx");

  const scene = useMemo(() => {
    const clone = fbx.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true;
        (child as THREE.Mesh).receiveShadow = true;
      }
    });
    return clone;
  }, [fbx]);

  const clips: THREE.AnimationClip[] = fbx.animations ?? [];

  useEffect(() => {
    if (!scene) return;

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;

    const idleClip = findClip(clips, ["idle", "stand"]);
    const walkClip = findClip(clips, ["walk"]);
    const runClip = findClip(clips, ["run"]);
    const jumpClip = findClip(clips, ["jump"]);

    const map: Record<string, THREE.AnimationClip | undefined> = {
      idle: idleClip ?? clips[0],
      walk: walkClip ?? idleClip ?? clips[0],
      run: runClip ?? walkClip ?? idleClip ?? clips[0],
      jump: jumpClip ?? idleClip ?? clips[0],
    };

    actionsRef.current = {};
    for (const [key, clip] of Object.entries(map)) {
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(
        key === "jump" ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = key === "jump";
      actionsRef.current[key] = action;
    }

    currentAnimRef.current = "";

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [scene, clips]);

  useEffect(() => {
    const rawAnim = player.animation || "idle";
    let target = rawAnim;
    if (rawAnim === "fall" || rawAnim === "ragdoll") target = "idle";

    if (target === currentAnimRef.current) return;

    const actions = actionsRef.current;
    const next = actions[target] ?? actions["idle"];
    if (!next) return;

    const prev = actions[currentAnimRef.current];
    if (prev && prev !== next) {
      next.reset().fadeIn(0.2).play();
      prev.fadeOut(0.2);
    } else {
      next.reset().play();
    }
    currentAnimRef.current = target;
  }, [player.animation]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.066);
    mixerRef.current?.update(delta);

    if (!groupRef.current) return;
    groupRef.current.position.set(
      player.position.x,
      player.position.y,
      player.position.z,
    );
    groupRef.current.rotation.y = player.rotation.y;
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={AVATAR_SCALE} />

      <Html
        position={[0, LABEL_HEIGHT, 0]}
        center
        distanceFactor={8}
        zIndexRange={[100, 0]}
        sprite
      >
        <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none">
          {player.name}
        </div>
      </Html>
    </group>
  );
}
