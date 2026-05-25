import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { GameRuntime, type RuntimeObject } from "@/lib/runtime";
import type { ServerObject } from "@/lib/multiplayer";
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
 * Renders a single runtime object as a Three.js mesh.
 *
 * posOverride — when supplied (from server worldState), the server's
 * authoritative position/rotation/color replaces the client runtime values.
 * This is how dynamic objects and script-driven objects stay in sync across
 * all clients without ever exposing script code to the browser.
 */
export default function Primitive({
  obj,
  runtime,
  posOverride = null,
}: {
  obj: RuntimeObject;
  runtime: GameRuntime;
  posOverride?: ServerObject | null;
}) {
  if (!obj.visible && !posOverride) return null;
  if (posOverride?.visible === false) return null;
  if (obj.type === "folder") return null;
  if (runtime.isObjectHeld(obj.id)) return null;

  const opacity = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;

  // Server-authoritative position wins over local runtime position
  const position: [number, number, number] = posOverride
    ? [posOverride.x, posOverride.y, posOverride.z]
    : [obj.position.x, obj.position.y, obj.position.z];

  const rotation: [number, number, number] = posOverride
    ? [posOverride.rotX, posOverride.rotY, posOverride.rotZ]
    : [obj.rotation.x, obj.rotation.y, obj.rotation.z];

  const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
  const color = posOverride?.color ?? obj.color;

  if (obj.type === "light") {
    return (
      <group position={position}>
        <pointLight color={color} intensity={1.2} distance={20} />
      </group>
    );
  }

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
      <meshStandardMaterial color={color} transparent={isTransparent} opacity={opacity} />
    </mesh>
  );
}
