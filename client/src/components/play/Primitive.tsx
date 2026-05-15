import { GameRuntime, type RuntimeObject } from "@/lib/runtime";

/**
 * Renders a single runtime object as a Three.js mesh. One file per scene
 * concept keeps PlayMode.tsx a thin shell.
 */
export default function Primitive({ obj, runtime }: { obj: RuntimeObject; runtime: GameRuntime }) {
  if (!obj.visible) return null;
  if (obj.type === "folder" || obj.type === "model") return null;
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
