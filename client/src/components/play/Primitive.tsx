import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTFModel } from "@/lib/gltf-loader";
import type { RenderObject } from "@shared/render-types";
import * as THREE from "three";

/**
 * Build an edge-wireframe overlay matching the actual mesh topology of a scene.
 * Returns a THREE.Group of LineSegments (one per mesh), coloured with `color`.
 * Using EdgesGeometry means only the real silhouette/crease edges are drawn —
 * not every triangle — which gives a clean outline matching the model's shape.
 */
function buildEdgeWireframe(scene: THREE.Group, color = '#a855f7'): THREE.Group {
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
    } catch {
      // skip degenerate geometry
    }
  });
  return group;
}

/**
 * Clones a Three.js scene, normalises its scale so the longest axis = 1 unit
 * (multiplied by modelScale), deep-clones materials, and returns
 * { clone, edgeWireframe }.
 */
function buildClone(
  scene: THREE.Group,
  modelScale: number,
): { clone: THREE.Group; edgeWireframe: THREE.Group } {
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

  const ew = buildEdgeWireframe(c, '#a855f7');
  ew.renderOrder = 1;

  return { clone: c, edgeWireframe: ew };
}

function ModelMesh({
  url, position, rotation, scale, onClick, modelScale = 1, selected = false,
  playingClip,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick?: (e: any) => void;
  modelScale?: number;
  selected?: boolean;
  /** Name of the GLTF animation clip to auto-play (undefined = first clip, null = none). */
  playingClip?: string | null;
}) {
  const { scene, animations, loading, error } = useGLTFModel(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  const { clone, edgeWireframe } = useMemo(
    () => (scene ? buildClone(scene, modelScale) : { clone: null as any, edgeWireframe: null as any }),
    [scene, modelScale],
  );

  // Create / recreate the AnimationMixer when the clone changes
  useEffect(() => {
    if (!clone || !animations?.length) return;
    const mixer = new THREE.AnimationMixer(clone);
    mixerRef.current = mixer;

    // Determine which clip to play
    let clip: THREE.AnimationClip | undefined;
    if (playingClip === null) {
      clip = undefined; // explicit "no clip"
    } else if (playingClip) {
      clip = animations.find(a => a.name === playingClip) ?? animations[0];
    } else {
      clip = animations[0]; // default: first clip
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

  // Step the mixer every frame
  useFrame((_state, delta) => {
    mixerRef.current?.update(delta);
  });

  if (loading) {
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    );
  }

  if (error || !clone) {
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ef4444" wireframe />
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

/**
 * Renders a single RenderObject from server state.
 * Supports primitives, lights, 3-D models (GLB/GLTF with animation), and audio sources.
 */
export default function Primitive({ obj, onClick, selected = false }: {
  obj: RenderObject;
  onClick?: (e: any) => void;
  selected?: boolean;
}) {
  if (!obj.visible) return null;
  if (obj.type === "folder") return null;

  const opacity = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;

  const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
  const color = obj.color;

  if (obj.type === "light") {
    return (
      <group position={position}>
        <pointLight color={color} intensity={1.2} distance={20} />
      </group>
    );
  }

  if (obj.type === "audio") {
    return null;
  }

  if (obj.type === "model") {
    const modelUrl = obj.modelUrl;
    if (!modelUrl) {
      return (
        <mesh position={position} rotation={rotation} scale={scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color ?? "#888888"} wireframe />
        </mesh>
      );
    }
    // playingClip from properties — scripts can set obj.properties.playingClip
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

  let geometry: JSX.Element;
  switch (obj.primitiveType) {
    case "sphere":
      geometry = <sphereGeometry args={[0.5, 32, 32]} />;
      break;
    case "cylinder":
      geometry = <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      break;
    case "plane":
      geometry = <planeGeometry args={[1, 1]} />;
      break;
    case "cube":
    default:
      geometry = <boxGeometry args={[1, 1, 1]} />;
  }

  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow onClick={onClick}>
      {geometry}
      <meshStandardMaterial color={color} transparent={isTransparent} opacity={opacity} />
      {selected && (
        <mesh>
          {geometry}
          <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.6} />
        </mesh>
      )}
    </mesh>
  );
}
