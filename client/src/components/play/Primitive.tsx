import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useModelFile } from "@/lib/gltf-loader";
import type { RenderObject } from "@shared/render-types";
import * as THREE from "three";

// ─── LOD helper ──────────────────────────────────────────────────────────────

/** Returns the LOD band (0=near, 1=mid, 2=far) for a given player distance. */
function lodBand(dist: number): 0 | 1 | 2 {
  if (dist < 35) return 0;
  if (dist < 90) return 1;
  return 2;
}

const SEGS: Record<0 | 1 | 2, { sphere: number; cyl: number }> = {
  0: { sphere: 32, cyl: 32 },
  1: { sphere: 16, cyl: 16 },
  2: { sphere:  8, cyl:  8 },
};

// ─── Edge wireframe builder (for GLTF/FBX models) ────────────────────────────

function buildEdgeWireframe(scene: THREE.Group, color = "#a855f7"): THREE.Group {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false });
  const group = new THREE.Group();
  scene.traverse((child: any) => {
    if (!child.isMesh) return;
    try {
      const edges = new THREE.EdgesGeometry(child.geometry, 20);
      const lines = new THREE.LineSegments(edges, mat);
      child.updateWorldMatrix(true, false);
      scene.updateWorldMatrix(true, false);
      const rel = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(child.matrixWorld);
      lines.applyMatrix4(rel);
      group.add(lines);
    } catch { /* skip degenerate geometry */ }
  });
  return group;
}

// ─── Clone + normalise a model scene ─────────────────────────────────────────

function buildClone(scene: THREE.Group, modelScale: number) {
  const c = scene.clone(true);
  c.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material = Array.isArray(child.material)
        ? child.material.map((m: THREE.Material) => m.clone())
        : child.material.clone();
    }
  });

  const box = new THREE.Box3().setFromObject(c);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const ns = (1 / maxDim) * modelScale;
  c.scale.setScalar(ns);

  const centre = new THREE.Vector3();
  box.getCenter(centre);
  c.position.set(-centre.x * ns, -centre.y * ns, -centre.z * ns);

  const ew = buildEdgeWireframe(c, "#a855f7");
  ew.renderOrder = 1;

  return { clone: c, edgeWireframe: ew };
}

// ─── ModelMesh ────────────────────────────────────────────────────────────────

function ModelMesh({
  url, position, rotation, scale, onClick, modelScale = 1, selected = false, playingClip,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick?: (e: any) => void;
  modelScale?: number;
  selected?: boolean;
  playingClip?: string | null;
}) {
  const { scene, animations, loading, error } = useModelFile(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  const { clone, edgeWireframe } = useMemo(
    () => (scene ? buildClone(scene, modelScale) : { clone: null as any, edgeWireframe: null as any }),
    [scene, modelScale],
  );

  useEffect(() => {
    if (!clone || !animations?.length) return;
    const mixer = new THREE.AnimationMixer(clone);
    mixerRef.current = mixer;

    let clip: THREE.AnimationClip | undefined;
    if (playingClip === null) {
      clip = undefined;
    } else if (playingClip) {
      clip = animations.find(a => a.name === playingClip) ?? animations[0];
    } else {
      clip = animations[0];
    }

    if (clip) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      currentActionRef.current = action;
    }

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      currentActionRef.current = null;
    };
  }, [clone, animations, playingClip]);

  useFrame((_state, delta) => { mixerRef.current?.update(delta); });

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
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#777777" wireframe />
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

// ─── PrimitiveShape — a single primitive with LOD and a clean EdgesGeometry wireframe ─

function PrimitiveShape({
  obj, onClick, selected, distanceToPlayer, opacity, isTransparent,
}: {
  obj: RenderObject;
  onClick?: (e: any) => void;
  selected: boolean;
  distanceToPlayer: number;
  opacity: number;
  isTransparent: boolean;
}) {
  const band = lodBand(distanceToPlayer);
  const { sphere: sphereSegs, cyl: cylSegs } = SEGS[band];

  const { baseGeo, edgesGeo } = useMemo(() => {
    let base: THREE.BufferGeometry;
    switch (obj.primitiveType) {
      case "sphere":   base = new THREE.SphereGeometry(0.5, sphereSegs, sphereSegs); break;
      case "cylinder": base = new THREE.CylinderGeometry(0.5, 0.5, 1, cylSegs); break;
      case "plane":    base = new THREE.PlaneGeometry(1, 1); break;
      default:         base = new THREE.BoxGeometry(1, 1, 1);
    }
    const edges = new THREE.EdgesGeometry(base, 15);
    return { baseGeo: base, edgesGeo: edges };
  }, [obj.primitiveType, sphereSegs, cylSegs]);

  // Dispose geometry when it changes (LOD band crossed)
  useEffect(() => {
    return () => { baseGeo.dispose(); edgesGeo.dispose(); };
  }, [baseGeo, edgesGeo]);

  const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale: [number, number, number]    = [obj.scale.x,    obj.scale.y,    obj.scale.z];

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

// ─── Main Primitive dispatcher ────────────────────────────────────────────────

/**
 * Renders a single RenderObject from server state.
 * Supports primitives (with LOD + clean EdgesGeometry wireframe),
 * lights, 3-D models (GLB/GLTF/FBX with animation), and audio sources.
 *
 * `distanceToPlayer` drives LOD tier:
 *   < 35 units  → full quality (32-seg spheres / cylinders)
 *   < 90 units  → medium (16-seg)
 *   ≥ 90 units  → low   (8-seg)
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
  if (!obj.visible) return null;
  if (obj.type === "folder") return null;

  const opacity = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;

  const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale: [number, number, number]    = [obj.scale.x,    obj.scale.y,    obj.scale.z];
  const color = obj.color;

  if (obj.type === "light") {
    return (
      <group position={position}>
        <pointLight color={color} intensity={1.2} distance={20} />
      </group>
    );
  }

  if (obj.type === "audio") return null;

  if (obj.type === "model") {
    const modelUrl = obj.modelUrl;
    if (!modelUrl) {
      return (
        <mesh position={position} rotation={rotation} scale={scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color ?? "#666666"} wireframe />
        </mesh>
      );
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
      />
    );
  }

  return (
    <PrimitiveShape
      obj={obj}
      onClick={onClick}
      selected={selected}
      distanceToPlayer={distanceToPlayer}
      opacity={opacity}
      isTransparent={isTransparent}
    />
  );
}
