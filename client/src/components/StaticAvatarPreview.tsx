import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

function createTaperedCylinder(topRad: number, bottomRad: number, height: number) {
  const geo = new THREE.CylinderGeometry(topRad, bottomRad, height, 24, 16);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    const t = (y + height / 2) / height;
    const curve = 1 + Math.sin(t * Math.PI) * 0.03;
    pos[i] *= curve;
    pos[i + 2] *= curve;
  }
  geo.computeVertexNormals();
  return geo;
}

const torsoGeo = new RoundedBoxGeometry(1.6, 2.38, 1.0, 6, 0.4);
const neckGeo = new THREE.CylinderGeometry(0.16, 0.17, 0.52, 20);
const headGeo = new THREE.SphereGeometry(0.66, 32, 32);
const upperArmGeo = createTaperedCylinder(0.27, 0.24, 1.22);
const lowerArmGeo = createTaperedCylinder(0.21, 0.18, 1.10);
const thighGeo = createTaperedCylinder(0.35, 0.30, 1.42);
const calfGeo = createTaperedCylinder(0.26, 0.22, 1.22);
const handGeo = new THREE.SphereGeometry(0.17, 16, 16);

const TORSO_H = 2.38;
const TORSO_CENTER_Y = 3.20;
const TORSO_TOP_Y = TORSO_CENTER_Y + TORSO_H / 2;
const NECK_H = 0.52;
const NECK_EMBED = 0.16;
const NECK_TOP_Y = TORSO_TOP_Y + NECK_H - NECK_EMBED;
const SHOULDER_Y = TORSO_TOP_Y - 0.08;
const ARM_OFFSET_X = 0.94;
const HIP_Y = (TORSO_CENTER_Y - TORSO_H / 2) + 0.18;
const LEG_OFFSET_X = 0.44;
const THIGH_LEN = 1.42;
const CALF_LEN = 1.22;
const FEET_Y_LOCAL = HIP_Y - THIGH_LEN - CALF_LEN;
const SCALE = 0.35;

function AvatarMesh({ skinColor, shirtColor, pantsColor }: { skinColor: string; shirtColor: string; pantsColor: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.5;
    }
  });

  const skin = skinColor;
  const shirt = shirtColor;
  const pants = pantsColor;

  return (
    <group ref={groupRef} scale={[SCALE, SCALE, SCALE]}>
      <group position={[0, -FEET_Y_LOCAL, 0]}>
        {/* Torso */}
        <mesh geometry={torsoGeo} position={[0, TORSO_CENTER_Y, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={shirt} roughness={0.5} />
        </mesh>
        {/* Neck */}
        <mesh geometry={neckGeo} position={[0, TORSO_TOP_Y + NECK_H / 2 - NECK_EMBED, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={skin} roughness={0.45} />
        </mesh>
        {/* Head */}
        <mesh geometry={headGeo} position={[0, NECK_TOP_Y + 0.48, 0.02]} castShadow receiveShadow>
          <meshStandardMaterial color={skin} roughness={0.45} />
        </mesh>

        {/* Left arm */}
        <group position={[-ARM_OFFSET_X, SHOULDER_Y, 0]}>
          <mesh geometry={upperArmGeo} position={[0, -1.22 / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={skin} roughness={0.45} />
          </mesh>
          <group position={[0, -1.22, 0]}>
            <mesh geometry={lowerArmGeo} position={[0, -1.10 / 2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={skin} roughness={0.45} />
            </mesh>
            <mesh geometry={handGeo} position={[0, -1.10 - 0.12, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={skin} roughness={0.45} />
            </mesh>
          </group>
        </group>

        {/* Right arm */}
        <group position={[ARM_OFFSET_X, SHOULDER_Y, 0]}>
          <mesh geometry={upperArmGeo} position={[0, -1.22 / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={skin} roughness={0.45} />
          </mesh>
          <group position={[0, -1.22, 0]}>
            <mesh geometry={lowerArmGeo} position={[0, -1.10 / 2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={skin} roughness={0.45} />
            </mesh>
            <mesh geometry={handGeo} position={[0, -1.10 - 0.12, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={skin} roughness={0.45} />
            </mesh>
          </group>
        </group>

        {/* Left leg */}
        <group position={[-LEG_OFFSET_X, HIP_Y, 0]}>
          <mesh geometry={thighGeo} position={[0, -THIGH_LEN / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={pants} roughness={0.5} />
          </mesh>
          <group position={[0, -THIGH_LEN, 0]}>
            <mesh geometry={calfGeo} position={[0, -CALF_LEN / 2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={pants} roughness={0.5} />
            </mesh>
          </group>
        </group>

        {/* Right leg */}
        <group position={[LEG_OFFSET_X, HIP_Y, 0]}>
          <mesh geometry={thighGeo} position={[0, -THIGH_LEN / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={pants} roughness={0.5} />
          </mesh>
          <group position={[0, -THIGH_LEN, 0]}>
            <mesh geometry={calfGeo} position={[0, -CALF_LEN / 2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={pants} roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export default function StaticAvatarPreview({ skinColor, shirtColor, pantsColor }: {
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
}) {
  return (
    <Canvas camera={{ position: [0, 0.5, 3.5], fov: 45 }} shadows>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1} castShadow />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />
      <AvatarMesh skinColor={skinColor} shirtColor={shirtColor} pantsColor={pantsColor} />
    </Canvas>
  );
}
