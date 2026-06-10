import { useMemo } from "react";
import { useGLTFModel } from "@/lib/gltf-loader";
import type { RenderObject } from "@shared/render-types";
import * as THREE from "three";

/**
 * Clones a Three.js scene and normalises its scale so the longest axis = 1 unit,
 * then multiplies by modelScale. Deep-clones materials so the model renders with
 * its own colours rather than inheriting a shared material state.
 */
function buildClone(scene: THREE.Group, modelScale: number): THREE.Group {
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
  return c;
}

function ModelMesh({
  url, position, rotation, scale, onClick, modelScale = 1,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick?: (e: any) => void;
  modelScale?: number;
}) {
  const { scene, loading, error } = useGLTFModel(url);

  const cloned = useMemo(
    () => (scene ? buildClone(scene, modelScale) : null),
    [scene, modelScale],
  );

  if (loading) {
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    );
  }

  if (error || !cloned) {
    return (
      <mesh position={position} rotation={rotation} scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ef4444" wireframe />
      </mesh>
    );
  }

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <primitive object={cloned} />
    </group>
  );
}

/**
 * Renders a single RenderObject from server state.
 * Supports primitives, lights, 3-D models (GLB/GLTF), and audio sources.
 */
export default function Primitive({ obj, onClick }: { obj: RenderObject; onClick?: (e: any) => void }) {
  if (!obj.visible) return null;
  if (obj.type === "folder") return null;
  if (obj.type === "particleEmitter") return null; // rendered by ParticleEmitterLayer

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
    return (
      <ModelMesh
        url={modelUrl}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={onClick}
        modelScale={obj.modelScale ?? 1}
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
    <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
      {geometry}
      <meshStandardMaterial color={color} transparent={isTransparent} opacity={opacity} />
    </mesh>
  );
}
