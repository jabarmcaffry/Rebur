import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { RenderPlayer } from "@shared/render-types";

// ---------- geometry helpers (ported from example.html) ----------
function createTaperedCylinder(
  topRad: number,
  bottomRad: number,
  height: number,
  radialSegs = 32,
  heightSegs = 28,
  bulge = 0.03,
) {
  const geo = new THREE.CylinderGeometry(topRad, bottomRad, height, radialSegs, heightSegs);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    const t = (y + height / 2) / height;
    const curve = 1 + Math.sin(t * Math.PI) * bulge;
    pos[i] *= curve;
    pos[i + 2] *= curve;
  }
  geo.computeVertexNormals();
  return geo;
}

function createSmoothNeck(height: number, topRad: number, bottomRad: number) {
  const geo = new THREE.CylinderGeometry(topRad, bottomRad, height, 32, 24);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    const t = (y + height / 2) / height;
    const curve = 1 + Math.sin(t * Math.PI) * 0.02;
    pos[i] *= curve;
    pos[i + 2] *= curve;
  }
  geo.computeVertexNormals();
  return geo;
}

function createSmoothHead() {
  const geo = new THREE.SphereGeometry(0.68, 40, 40);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    const z = pos[i + 2];
    if (y > 0) pos[i + 1] *= 1.08;
    if (y < -0.3) {
      const taper = 1 - (-0.3 - y) * 0.3;
      const t = Math.max(0.88, taper);
      pos[i] *= t;
      pos[i + 2] *= t;
    }
    if (z < 0) pos[i + 2] *= 0.94;
  }
  geo.computeVertexNormals();
  return geo;
}

// Module-level shared geometries.
const torsoGeo = new RoundedBoxGeometry(1.6, 2.38, 1.0, 8, 0.5);
const neckGeo = createSmoothNeck(0.52, 0.16, 0.17);
const headGeo = createSmoothHead();
const upperArmGeo = createTaperedCylinder(0.28, 0.25, 1.22, 28, 24, 0.04);
const lowerArmGeo = createTaperedCylinder(0.22, 0.19, 1.10, 26, 22, 0.03);
const thighGeo = createTaperedCylinder(0.36, 0.31, 1.42, 30, 26, 0.05);
const calfGeo = createTaperedCylinder(0.27, 0.23, 1.22, 28, 24, 0.03);

// Hand geometry - deformed sphere for a more natural look
function createHandGeometry() {
  const geo = new THREE.SphereGeometry(0.18, 24, 24);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] *= 0.75;
    pos[i + 1] *= 0.65;
    pos[i + 2] *= 1.15;
  }
  geo.computeVertexNormals();
  return geo;
}
const handGeo = createHandGeometry();

const HAND_OFFSET_Y = -1.10 - 0.12;
const HAND_SCALE = 1.0;

const HEX = (s: string | number | undefined, fallback: number) => {
  if (typeof s === "number") return s;
  if (typeof s === "string") {
    try { return new THREE.Color(s).getHex(); } catch { return fallback; }
  }
  return fallback;
};

// Layout constants (rig local space, before scaling).
const TORSO_H = 2.38;
const TORSO_CENTER_Y = 3.20;
const TORSO_TOP_Y = TORSO_CENTER_Y + TORSO_H / 2;
const NECK_H = 0.52;
const NECK_EMBED = 0.16;
const NECK_TOP_Y = TORSO_TOP_Y + NECK_H - NECK_EMBED;
const SHOULDER_Y = TORSO_TOP_Y - 0.08;
const ARM_OFFSET_X = 0.95;
const HIP_Y = (TORSO_CENTER_Y - TORSO_H / 2) + 0.18;
const LEG_OFFSET_X = 0.44;
const THIGH_LEN = 1.42;
const CALF_LEN = 1.22;
const FEET_Y_LOCAL = HIP_Y - THIGH_LEN - CALF_LEN;
const SCALE = 0.35;

export default function Avatar({ 
  player, 
  isLocal = false,
}: { 
  player: RenderPlayer; 
  isLocal?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const neckRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftElbowRef = useRef<THREE.Group>(null);
  const rightElbowRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);

  const animTime = useRef(0);
  const ragdollOffsets = useRef<Record<string, THREE.Euler>>({});
  const lastAnim = useRef<string>("idle");

  // Materials
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.42, metalness: 0.03 }), []);
  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: HEX(player.colors.shirt, 0x2b7a6e), roughness: 0.48, metalness: 0.03 }), []);
  const pantsMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5, metalness: 0.03 }), []);

  useEffect(() => () => { skinMat.dispose(); shirtMat.dispose(); pantsMat.dispose(); }, [skinMat, shirtMat, pantsMat]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.066);
    animTime.current += delta;
    const t = animTime.current;

    // Live recolor
    shirtMat.color.setHex(HEX(player.colors.shirt, 0x2b7a6e));
    skinMat.color.setHex(HEX(player.colors.skin, 0xffdbac));
    pantsMat.color.setHex(HEX(player.colors.pants, 0x2c3e50));

    // Pick animation from server state
    let anim = player.animation || "idle";
    if (anim !== lastAnim.current) {
      ragdollOffsets.current = {};
      lastAnim.current = anim;
    }

    // Reset joints
    const joints = [leftArmRef, rightArmRef, leftElbowRef, rightElbowRef, leftLegRef, rightLegRef, leftKneeRef, rightKneeRef];
    joints.forEach((r) => r.current?.rotation.set(0, 0, 0));
    if (headRef.current) headRef.current.rotation.set(0, 0, 0);
    if (bobRef.current) bobRef.current.position.y = 0;

    // Breathing
    const breath = Math.sin(t * 1.5) * 0.015;
    if (torsoRef.current) torsoRef.current.position.y = TORSO_CENTER_Y + breath;
    if (neckRef.current) neckRef.current.position.y = TORSO_TOP_Y + NECK_H / 2 - NECK_EMBED + breath * 0.6;
    if (headRef.current) headRef.current.position.y = NECK_TOP_Y + 0.48 + breath * 0.4;

    if (anim === "ragdoll") {
      const keys = ["leftArm", "rightArm", "leftElbow", "rightElbow", "leftLeg", "rightLeg", "leftKnee", "rightKnee"];
      const map: Record<string, THREE.Object3D | null | undefined> = {
        leftArm: leftArmRef.current, rightArm: rightArmRef.current,
        leftElbow: leftElbowRef.current, rightElbow: rightElbowRef.current,
        leftLeg: leftLegRef.current, rightLeg: rightLegRef.current,
        leftKnee: leftKneeRef.current, rightKnee: rightKneeRef.current,
      };
      keys.forEach((k) => {
        if (!ragdollOffsets.current[k]) {
          ragdollOffsets.current[k] = new THREE.Euler(
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 1.4,
            (Math.random() - 0.5) * 2.2,
          );
        }
        const e = ragdollOffsets.current[k];
        map[k]?.rotation.set(e.x, e.y, e.z);
      });
    } else if (anim === "walk" || anim === "run") {
      const ws = anim === "run" ? 7.2 : 5.2;
      const amp = anim === "run" ? 1.15 : 0.95;
      const legAmp = anim === "run" ? 0.85 : 0.68;
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * ws) * amp;
      if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(t * ws + Math.PI) * amp;
      if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * ws + Math.PI) * legAmp;
      if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(t * ws) * legAmp;
      if (leftElbowRef.current) leftElbowRef.current.rotation.x = -Math.max(0, Math.sin(t * ws + Math.PI)) * 0.6;
      if (rightElbowRef.current) rightElbowRef.current.rotation.x = -Math.max(0, Math.sin(t * ws)) * 0.6;
      if (leftKneeRef.current) leftKneeRef.current.rotation.x = Math.max(0, Math.sin(t * ws + Math.PI)) * 0.5;
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = Math.max(0, Math.sin(t * ws)) * 0.5;
      if (bobRef.current) bobRef.current.position.y = Math.abs(Math.sin(t * ws * 2)) * 0.065;
    } else if (anim === "jump") {
      if (leftArmRef.current) leftArmRef.current.rotation.x = -1.4;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -1.4;
      if (leftLegRef.current) leftLegRef.current.rotation.x = -0.3;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -0.3;
      if (leftKneeRef.current) leftKneeRef.current.rotation.x = 0.8;
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = 0.8;
    } else if (anim === "fall") {
      if (leftArmRef.current) { leftArmRef.current.rotation.x = -0.3; leftArmRef.current.rotation.z = 0.8; }
      if (rightArmRef.current) { rightArmRef.current.rotation.x = -0.3; rightArmRef.current.rotation.z = -0.8; }
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0.3;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0.3;
    } else {
      // Idle
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = Math.sin(t * 1.3) * 0.04;
        leftArmRef.current.rotation.x = Math.sin(t * 0.7) * 0.02;
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = -Math.sin(t * 1.3) * 0.04;
        rightArmRef.current.rotation.x = Math.sin(t * 0.7 + 1) * 0.02;
      }
      if (headRef.current) headRef.current.rotation.y = Math.sin(t * 0.6) * 0.05;
    }
  });

  const s = SCALE;

  return (
    <group
      ref={groupRef}
      position={[player.position.x, player.position.y, player.position.z]}
    >
      <group rotation={[0, player.rotation.y, 0]} scale={[s, s, s]}>
        <group position={[0, -FEET_Y_LOCAL, 0]}>
          <group ref={bobRef}>
            <mesh ref={torsoRef} geometry={torsoGeo} position={[0, TORSO_CENTER_Y, 0]} castShadow receiveShadow material={shirtMat} />
            <mesh ref={neckRef} geometry={neckGeo} position={[0, TORSO_TOP_Y + NECK_H / 2 - NECK_EMBED, 0]} castShadow receiveShadow material={skinMat} />
            <mesh ref={headRef} geometry={headGeo} position={[0, NECK_TOP_Y + 0.48, 0.02]} castShadow receiveShadow material={skinMat} />

            <group ref={leftArmRef} position={[-ARM_OFFSET_X, SHOULDER_Y, 0]}>
              <mesh geometry={upperArmGeo} position={[0, -1.22 / 2, 0]} castShadow receiveShadow material={skinMat} />
              <group ref={leftElbowRef} position={[0, -1.22, 0]}>
                <mesh geometry={lowerArmGeo} position={[0, -1.10 / 2, 0]} castShadow receiveShadow material={skinMat} />
                <group position={[0, HAND_OFFSET_Y, 0]}>
                  <mesh geometry={handGeo} scale={[HAND_SCALE, HAND_SCALE, HAND_SCALE]} castShadow receiveShadow material={skinMat} />
                </group>
              </group>
            </group>

            <group ref={rightArmRef} position={[ARM_OFFSET_X, SHOULDER_Y, 0]}>
              <mesh geometry={upperArmGeo} position={[0, -1.22 / 2, 0]} castShadow receiveShadow material={skinMat} />
              <group ref={rightElbowRef} position={[0, -1.22, 0]}>
                <mesh geometry={lowerArmGeo} position={[0, -1.10 / 2, 0]} castShadow receiveShadow material={skinMat} />
                <group position={[0, HAND_OFFSET_Y, 0]}>
                  <mesh geometry={handGeo} scale={[HAND_SCALE, HAND_SCALE, HAND_SCALE]} castShadow receiveShadow material={skinMat} />
                </group>
              </group>
            </group>

            <group ref={leftLegRef} position={[-LEG_OFFSET_X, HIP_Y, 0]}>
              <mesh geometry={thighGeo} position={[0, -THIGH_LEN / 2, 0]} castShadow receiveShadow material={pantsMat} />
              <group ref={leftKneeRef} position={[0, -THIGH_LEN, 0]}>
                <mesh geometry={calfGeo} position={[0, -CALF_LEN / 2, 0]} castShadow receiveShadow material={pantsMat} />
              </group>
            </group>

            <group ref={rightLegRef} position={[LEG_OFFSET_X, HIP_Y, 0]}>
              <mesh geometry={thighGeo} position={[0, -THIGH_LEN / 2, 0]} castShadow receiveShadow material={pantsMat} />
              <group ref={rightKneeRef} position={[0, -THIGH_LEN, 0]}>
                <mesh geometry={calfGeo} position={[0, -CALF_LEN / 2, 0]} castShadow receiveShadow material={pantsMat} />
              </group>
            </group>
          </group>
        </group>

        {/* Username label */}
        <Html position={[0, (NECK_TOP_Y + 1.4) - FEET_Y_LOCAL, 0]} center distanceFactor={8} zIndexRange={[100, 0]} sprite>
          <div className="px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium whitespace-nowrap pointer-events-none">
            {player.name}
          </div>
        </Html>
      </group>
    </group>
  );
}
