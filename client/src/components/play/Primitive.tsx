import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { GameRuntime, type RuntimeObject } from "@/lib/runtime";

import * as THREE from "three";

function ModelMesh({
  url, position, rotation, scale, onClick,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick?: (e: any) => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    // Normalise to 1-unit longest axis so scale=1 is a reasonable size
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const ns = 1 / maxDim;
    c.scale.setScalar(ns);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    c.position.set(-centre.x * ns, -centre.y * ns, -centre.z * ns);
    return c;
  }, [scene]);
  return (
    <group position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <primitive object={cloned} />
    </group>
  );
}

/**
 * Renders a single runtime object as a Three.js mesh. One file per scene
 * concept keeps PlayMode.tsx a thin shell.
 */
export default function Primitive({ obj, runtime }: { obj: RuntimeObject; runtime: GameRuntime }) {
  if (!obj.visible) return null;
  if (obj.type === "folder") return null;
  // Skip objects that are being held in motor slots - they render inside the Avatar
  if (runtime.isObjectHeld(obj.id)) return null;
  const opacity = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;
  const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];

  if (obj.type === "light") {
    return (
      <group position={position}>
        <pointLight color={obj.color} intensity={1.2} distance={20} />
      </group>
    );
  }

  // GLTF model
  if (obj.type === "model") {
    const modelUrl = obj.modelUrl ?? (obj as any).properties?.fileUrl as string | undefined;
    const handleClick = (e: any) => {
      e?.stopPropagation?.();
      runtime.emitClick(obj.id);
    };
    if (!modelUrl) {
      return (
        <mesh position={position} rotation={rotation} scale={scale} onClick={handleClick}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={obj.color ?? "#888888"} wireframe />
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
          onClick={handleClick}
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

  const handleClick = (e: any) => {
    e.stopPropagation();
    runtime.emitClick(obj.id);
  };

  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow onClick={handleClick}>
      {geometry}
      <meshStandardMaterial color={obj.color} transparent={isTransparent} opacity={opacity} />
    </mesh>
  );
}
