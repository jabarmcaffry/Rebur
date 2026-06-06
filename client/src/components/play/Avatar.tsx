/**
 * Avatar.tsx
 *
 * Procedural avatar — capsule torso, sphere head, animated arms and legs.
 * Driven entirely by RenderPlayer state from the server so it works in
 * every WebGL environment without loading any external FBX/GLB files.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RenderPlayer } from "@shared/render-types";

const SKIN  = "#f5c5a3";
const HAIR  = "#3b2314";
const SHIRT = "#2563eb";
const PANTS = "#1e293b";
const SHOE  = "#1a1a1a";

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function Avatar({
  player,
  isLocal = false,
}: {
  player:   RenderPlayer;
  isLocal?: boolean;
}) {
  const groupRef   = useRef<THREE.Group>(null);
  const lArmRef    = useRef<THREE.Group>(null);
  const rArmRef    = useRef<THREE.Group>(null);
  const lLegRef    = useRef<THREE.Group>(null);
  const rLegRef    = useRef<THREE.Group>(null);
  const phaseRef   = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.066);
    const g  = groupRef.current;
    if (!g) return;

    g.position.set(player.position.x, player.position.y, player.position.z);
    g.rotation.y = player.rotation.y;

    const spd = Math.hypot(
      player.velocity?.x ?? 0,
      player.velocity?.z ?? 0,
    );

    const anim = player.animation ?? "idle";
    const freq = anim === "run" ? 8 : anim === "walk" ? 4 : 0.8;
    const amp  = anim === "idle" ? 0.08 : 0.55;

    phaseRef.current += dt * freq;
    const sw = Math.sin(phaseRef.current) * amp;

    if (lArmRef.current) lArmRef.current.rotation.x =  sw;
    if (rArmRef.current) rArmRef.current.rotation.x = -sw;
    if (lLegRef.current) lLegRef.current.rotation.x = -sw;
    if (rLegRef.current) rLegRef.current.rotation.x =  sw;
  });

  const shirtColor = player.colors?.shirt ?? SHIRT;
  const skinColor  = player.colors?.skin  ?? SKIN;
  const pantsColor = player.colors?.pants ?? PANTS;

  return (
    <group ref={groupRef}>
      {/* ── Torso ────────────────────────────────────────────────────── */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.55, 4, 8]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>

      {/* ── Head ─────────────────────────────────────────────────────── */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* ── Hair cap ─────────────────────────────────────────────────── */}
      <mesh position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.225, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color={HAIR} />
      </mesh>

      {/* ── Eyes ─────────────────────────────────────────────────────── */}
      <mesh position={[-0.08, 1.65, 0.2]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0.08, 1.65, 0.2]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>

      {/* ── Left arm ─────────────────────────────────────────────────── */}
      <group ref={lArmRef} position={[-0.36, 1.1, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.35, 4, 8]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        {/* hand */}
        <mesh position={[0, -0.48, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>

      {/* ── Right arm ────────────────────────────────────────────────── */}
      <group ref={rArmRef} position={[0.36, 1.1, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.35, 4, 8]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        {/* hand */}
        <mesh position={[0, -0.48, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>

      {/* ── Left leg ─────────────────────────────────────────────────── */}
      <group ref={lLegRef} position={[-0.15, 0.52, 0]}>
        <mesh position={[0, -0.27, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.4, 4, 8]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        {/* shoe */}
        <mesh position={[0, -0.56, 0.05]}>
          <boxGeometry args={[0.18, 0.1, 0.26]} />
          <meshStandardMaterial color={SHOE} />
        </mesh>
      </group>

      {/* ── Right leg ────────────────────────────────────────────────── */}
      <group ref={rLegRef} position={[0.15, 0.52, 0]}>
        <mesh position={[0, -0.27, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.4, 4, 8]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        {/* shoe */}
        <mesh position={[0, -0.56, 0.05]}>
          <boxGeometry args={[0.18, 0.1, 0.26]} />
          <meshStandardMaterial color={SHOE} />
        </mesh>
      </group>

      {/* ── Username label ───────────────────────────────────────────── */}
      <Html
        position={[0, 2.1, 0]}
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
