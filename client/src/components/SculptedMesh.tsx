/**
 * SculptedMesh — R3F component that applies parametric vertex displacement
 * to primitive geometries (cube, sphere, cylinder, plane).
 *
 * The displacement is computed from a `SculptDef` stored in the object's
 * `properties.sculpt` field and applied once via useMemo (not every frame),
 * so it is cheap to render at runtime.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { SculptDef } from "./SculptPanel";

// ─── noise helpers ───────────────────────────────────────────────────────────

function fract(x: number): number { return x - Math.floor(x); }

/** Fast smooth pseudo-random noise in [-1, 1] based on sin hashing. */
function snoise(x: number, y: number, z: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return fract(v) * 2 - 1;
}

/** 3D value noise with trilinear interpolation. */
function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y); const iz = Math.floor(z);
  const fx = x - ix;       const fy = y - iy;       const fz = z - iz;
  // Smooth step
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const a = snoise(ix,   iy,   iz);
  const b = snoise(ix+1, iy,   iz);
  const c = snoise(ix,   iy+1, iz);
  const d = snoise(ix+1, iy+1, iz);
  const e = snoise(ix,   iy,   iz+1);
  const f = snoise(ix+1, iy,   iz+1);
  const g = snoise(ix,   iy+1, iz+1);
  const h = snoise(ix+1, iy+1, iz+1);

  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  const ef = e + (f - e) * ux;
  const gh = g + (h - g) * ux;
  const abcd = ab + (cd - ab) * uy;
  const efgh = ef + (gh - ef) * uy;
  return abcd + (efgh - abcd) * uz;
}

// ─── geometry builder ────────────────────────────────────────────────────────

function buildSculptedGeometry(
  primitiveType: string,
  sculpt: SculptDef,
): THREE.BufferGeometry {
  // High-subdivision base geometries so displacement looks smooth
  let base: THREE.BufferGeometry;
  switch (primitiveType) {
    case "sphere":   base = new THREE.SphereGeometry(0.5, 64, 64); break;
    case "cylinder": base = new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 16); break;
    case "plane":    base = new THREE.PlaneGeometry(1, 1, 64, 64); break;
    case "cube":
    default:         base = new THREE.BoxGeometry(1, 1, 1, 16, 16, 16);
  }

  const geo = base.clone();
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;

  const allZero =
    sculpt.noiseStrength === 0 &&
    sculpt.inflate === 0 &&
    sculpt.pushX === 0 && sculpt.pushY === 0 && sculpt.pushZ === 0 &&
    sculpt.waveAmplitude === 0 &&
    sculpt.smooth === 0;
  if (allZero) return geo;

  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pz = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    // Noise along normal direction
    const noise = valueNoise3(px * sculpt.noiseScale, py * sculpt.noiseScale, pz * sculpt.noiseScale);
    const noiseDisp = noise * sculpt.noiseStrength * 0.25;

    // Wave ripple in Y (useful for water-like surface)
    const wave = Math.sin((px + pz) * sculpt.waveFrequency * Math.PI * 2) * sculpt.waveAmplitude * 0.15;

    // Inflate along normal
    const inflateDisp = sculpt.inflate * 0.2;

    // Total displacement along vertex normal
    const normalDisp = noiseDisp + wave + inflateDisp;

    // Smooth: lerp position toward center of bounding (simple shrink toward origin)
    const smoothFactor = sculpt.smooth * 0.5;

    posAttr.setXYZ(
      i,
      px * (1 - smoothFactor) + nx * normalDisp + sculpt.pushX * 0.3,
      py * (1 - smoothFactor) + ny * normalDisp + sculpt.pushY * 0.3,
      pz * (1 - smoothFactor) + nz * normalDisp + sculpt.pushZ * 0.3,
    );
  }

  geo.computeVertexNormals();
  return geo;
}

// ─── component ───────────────────────────────────────────────────────────────

interface Props {
  primitiveType: string;
  sculpt: SculptDef;
  color: string;
  transparent?: boolean;
  opacity?: number;
  selected?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  onClick?: (e: any) => void;
  forwardedRef?: React.Ref<THREE.Mesh>;
}

export default function SculptedMesh({
  primitiveType, sculpt, color,
  transparent = false, opacity = 1, selected = false,
  position, rotation, scale, onClick, forwardedRef,
}: Props) {
  const geo = useMemo(
    () => buildSculptedGeometry(primitiveType, sculpt),
    [primitiveType, sculpt.noiseStrength, sculpt.noiseScale, sculpt.inflate,
      sculpt.pushX, sculpt.pushY, sculpt.pushZ,
      sculpt.waveAmplitude, sculpt.waveFrequency, sculpt.smooth],
  );

  return (
    <mesh
      ref={forwardedRef as any}
      geometry={geo}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
      onClick={onClick}
    >
      <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[geo, 20]} />
          <lineBasicMaterial color="#a855f7" transparent opacity={0.7} depthTest={false} />
        </lineSegments>
      )}
    </mesh>
  );
}
