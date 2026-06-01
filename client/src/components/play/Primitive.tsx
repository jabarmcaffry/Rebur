/**
 * Primitive.tsx — Unified scene-object renderer for Rebur Play mode.
 *
 * Handles every object type — primitives, models (GLTF/GLB/FBX), lights,
 * audio markers — with a consistent LOD + streaming strategy:
 *
 *   LOD tiers (based on effective distance = dist / worldBoundingRadius)
 *   ─────────────────────────────────────────────────────────────────────
 *   Tier 0 (near)   : full quality — 32-seg spheres, PBR model, real light
 *   Tier 1 (medium) : reduced quality — 16-seg spheres, model still rendered
 *   Tier 2 (far)    : proxy — 8-seg spheres, models replaced by bbox wireframe
 *
 *   Min absolute distances prevent tiny objects from going proxy too aggressively:
 *     near  = max(10,  worldRadius × 8)
 *     medium= max(28,  worldRadius × 20)
 *
 *   Beyond streaming radius (passed from PlayMode as null → skip rendering)
 *   the component renders null.
 *
 * All geometry is built imperatively so EdgesGeometry overlays are shape-accurate
 * (no duplicate mesh wireframe).
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useModelFile } from "@/lib/gltf-loader";
import type { RenderObject } from "@shared/render-types";
import type { ReburScene } from "@shared/rebur-scene";
import * as THREE from "three";

// ─── LOD computation ─────────────────────────────────────────────────────────

/**
 * Compute approximate world-space bounding radius for any object.
 * Models are normalised to ~1 unit; their effective radius scales with scale.
 * Primitives use half their max-axis scale.
 */
function worldBoundingRadius(obj: RenderObject, rs?: ReburScene | null): number {
  const sx = obj.scale.x, sy = obj.scale.y, sz = obj.scale.z;
  const maxScale = Math.max(sx, sy, sz, 0.01);
  if (obj.type === "model") {
    // Normalised model fits in a unit cube; half-diagonal = √3/2 ≈ 0.866
    const modelR = rs ? rs.boundingRadius : 0.866;
    return maxScale * modelR;
  }
  return maxScale * 0.5;
}

type LodTier = 0 | 1 | 2;

function lodTier(dist: number, worldRadius: number): LodTier {
  const near   = Math.max(10,  worldRadius *  8);
  const medium = Math.max(28,  worldRadius * 20);
  if (dist < near)   return 0;
  if (dist < medium) return 1;
  return 2;
}

const SEG: Record<LodTier, { sphere: number; cyl: number }> = {
  0: { sphere: 32, cyl: 32 },
  1: { sphere: 16, cyl: 16 },
  2: { sphere:  8, cyl:  8 },
};

// ─── Bounding-box proxy (far LOD for all model objects) ───────────────────────

function BBoxProxy({
  position, rotation, scale, selected,
}: {
  position: [number,number,number];
  rotation: [number,number,number];
  scale: [number,number,number];
  selected: boolean;
}) {
  const { geo, edgesGeo } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    return { geo: g, edgesGeo: new THREE.EdgesGeometry(g) };
  }, []);

  useEffect(() => () => { geo.dispose(); edgesGeo.dispose(); }, [geo, edgesGeo]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Faint fill so the shape reads from afar */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          color="#5a5a8a"
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* Wireframe outline — purple when selected, dim gray otherwise */}
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial
          color={selected ? "#a855f7" : "#4a4a6a"}
          transparent
          opacity={selected ? 0.9 : 0.45}
          depthTest={false}
        />
      </lineSegments>
    </group>
  );
}

// ─── PrimitiveShape (box / sphere / cylinder / plane) ────────────────────────

function PrimitiveShape({
  obj, onClick, selected, tier, opacity, isTransparent,
}: {
  obj: RenderObject;
  onClick?: (e: any) => void;
  selected: boolean;
  tier: LodTier;
  opacity: number;
  isTransparent: boolean;
}) {
  const { sphere: sphereSegs, cyl: cylSegs } = SEG[tier];

  const { baseGeo, edgesGeo } = useMemo(() => {
    let base: THREE.BufferGeometry;
    switch (obj.primitiveType) {
      case "sphere":   base = new THREE.SphereGeometry(0.5, sphereSegs, sphereSegs); break;
      case "cylinder": base = new THREE.CylinderGeometry(0.5, 0.5, 1, cylSegs);     break;
      case "plane":    base = new THREE.PlaneGeometry(1, 1);                         break;
      default:         base = new THREE.BoxGeometry(1, 1, 1);
    }
    return { baseGeo: base, edgesGeo: new THREE.EdgesGeometry(base, 15) };
  }, [obj.primitiveType, sphereSegs, cylSegs]);

  useEffect(() => () => { baseGeo.dispose(); edgesGeo.dispose(); }, [baseGeo, edgesGeo]);

  const position: [number,number,number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number,number,number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale:    [number,number,number] = [obj.scale.x,    obj.scale.y,    obj.scale.z];

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
      onClick={onClick}
      geometry={baseGeo}
    >
      <meshStandardMaterial
        color={obj.color}
        transparent={isTransparent}
        opacity={opacity}
      />
      {selected && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      )}
    </mesh>
  );
}

// ─── ModelMesh ────────────────────────────────────────────────────────────────

function ModelMesh({
  url, position, rotation, scale, onClick, modelScale = 1, selected = false,
  playingClip, tier,
}: {
  url: string;
  position: [number,number,number];
  rotation: [number,number,number];
  scale: [number,number,number];
  onClick?: (e: any) => void;
  modelScale?: number;
  selected?: boolean;
  playingClip?: string | null;
  tier: LodTier;
}) {
  const { scene, animations, loading, error, reburScene } = useModelFile(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  // Clone + normalise the scene (position centred, fitted to unit box)
  const { clone, edgeWireframe } = useMemo(() => {
    if (!scene) return { clone: null as any, edgeWireframe: null as any };

    const c = scene.clone(true);
    c.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((m: THREE.Material) => m.clone())
          : child.material.clone();
      }
    });

    const box = new THREE.Box3().setFromObject(c);
    const sz  = new THREE.Vector3();
    box.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z, 0.001);
    const ns = (1 / maxDim) * modelScale;
    c.scale.setScalar(ns);

    const centre = new THREE.Vector3();
    box.getCenter(centre);
    c.position.set(-centre.x * ns, -centre.y * ns, -centre.z * ns);

    // Build edge wireframe from actual mesh topology (for selection highlight)
    const mat = new THREE.LineBasicMaterial({
      color: "#a855f7", transparent: true, opacity: 0.7, depthTest: false,
    });
    const wfGroup = new THREE.Group();
    c.traverse((child: any) => {
      if (!child.isMesh) return;
      try {
        const edges = new THREE.EdgesGeometry(child.geometry, 20);
        const lines = new THREE.LineSegments(edges, mat);
        child.updateWorldMatrix(true, false);
        c.updateWorldMatrix(true, false);
        const rel = new THREE.Matrix4()
          .copy(c.matrixWorld).invert()
          .multiply(child.matrixWorld);
        lines.applyMatrix4(rel);
        wfGroup.add(lines);
      } catch { /* skip degenerate geometry */ }
    });
    wfGroup.renderOrder = 1;

    return { clone: c, edgeWireframe: wfGroup };
  }, [scene, modelScale]);

  // AnimationMixer setup
  useEffect(() => {
    if (!clone || !animations?.length) return;
    const mixer = new THREE.AnimationMixer(clone);
    mixerRef.current = mixer;

    let clip: THREE.AnimationClip | undefined;
    if (playingClip) {
      clip = animations.find(a => a.name === playingClip) ?? animations[0];
    } else if (playingClip !== null) {
      clip = animations[0];
    }

    if (clip) {
      mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    }
    return () => { mixer.stopAllAction(); mixerRef.current = null; };
  }, [clone, animations, playingClip]);

  useFrame((_s, dt) => mixerRef.current?.update(dt));

  // Far LOD: skip full model, render bounding-box proxy
  if (tier === 2) {
    return (
      <BBoxProxy position={position} rotation={rotation} scale={scale} selected={selected} />
    );
  }

  if (loading) {
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#555555" wireframe />
      </mesh>
    );
  }

  if (error || !clone) {
    return (
      <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#666666" wireframe />
        {selected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1,1,1) as any]} />
            <lineBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
          </lineSegments>
        )}
      </mesh>
    );
  }

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <primitive object={clone} />
      {selected && edgeWireframe && <primitive object={edgeWireframe} />}
    </group>
  );
}

// ─── Main Primitive dispatcher ────────────────────────────────────────────────

/**
 * Renders a single RenderObject from server state.
 *
 * @param obj              The object to render (from server / runtime state).
 * @param onClick          Called when the object is clicked in 3D space.
 * @param selected         Whether to show selection highlight.
 * @param distanceToPlayer Distance from local player — drives LOD tier.
 *                         Streaming culling (> 200 units) is handled upstream in
 *                         PlayMode; this component focuses on quality tiers.
 */
export default function Primitive({
  obj,
  onClick,
  selected = false,
  distanceToPlayer = 0,
}: {
  obj: RenderObject;
  onClick?: (e: any) => void;
  selected?: boolean;
  distanceToPlayer?: number;
}) {
  if (!obj.visible)         return null;
  if (obj.type === "folder") return null;

  const opacity      = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;

  const position: [number,number,number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number,number,number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale:    [number,number,number] = [obj.scale.x,    obj.scale.y,    obj.scale.z];

  // ── Lights ─────────────────────────────────────────────────────────────────
  // Lights are cheap — always render regardless of distance.
  if (obj.type === "light") {
    return (
      <group position={position}>
        <pointLight color={obj.color} intensity={1.2} distance={20} />
      </group>
    );
  }

  // ── Audio markers ──────────────────────────────────────────────────────────
  if (obj.type === "audio") return null;

  // ── LOD tier for everything else ───────────────────────────────────────────
  // For models we read reburScene inside ModelMesh (after the hook fires).
  // Here we use a conservative default for tier computation.
  const worldR = worldBoundingRadius(obj, null);
  const tier   = lodTier(distanceToPlayer, worldR);

  // ── Models (GLTF / GLB / FBX) ─────────────────────────────────────────────
  if (obj.type === "model") {
    const modelUrl = obj.modelUrl;
    if (!modelUrl) {
      return (
        <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={obj.color ?? "#666666"} wireframe />
        </mesh>
      );
    }

    // Far LOD: proxy before even loading the model asset
    if (tier === 2) {
      return <BBoxProxy position={position} rotation={rotation} scale={scale} selected={selected} />;
    }

    const playingClip = (obj as any).properties?.playingClip as string | null | undefined;
    return (
      <ModelMesh
        url={modelUrl}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={onClick}
        modelScale={obj.modelScale ?? 1}
        selected={selected}
        playingClip={playingClip}
        tier={tier}
      />
    );
  }

  // ── Primitives (box / sphere / cylinder / plane) ───────────────────────────
  return (
    <PrimitiveShape
      obj={obj}
      onClick={onClick}
      selected={selected}
      tier={tier}
      opacity={opacity}
      isTransparent={isTransparent}
    />
  );
}
