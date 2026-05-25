import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { RenderObject } from "@shared/render-types";
import * as THREE from "three";

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
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
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
  }, [scene, modelScale]);
  return (
    <group position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <primitive object={cloned} />
    </group>
  );
}

/**
 * Renders a single object as a Three.js mesh.
 * Uses RenderObject from server state (no GameRuntime dependency).
 */
export default function Primitive({ obj }: { obj: RenderObject }) {
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
      <Suspense
        fallback={
          <mesh position={position} rotation={rotation} scale={scale}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#888888" wireframe />
          </mesh>
        }
      >
        <ModelMesh
          url={modelUrl}
          position={position}
          rotation={rotation}
          scale={scale}
          modelScale={obj.modelScale}
        />
      </Suspense>
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
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      {geometry}
      <meshStandardMaterial color={color} transparent={isTransparent} opacity={opacity} />
    </mesh>
  );
}
