import { Suspense, useMemo, Component, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { RenderObject } from "@shared/render-types";
import * as THREE from "three";

// Configure DRACO decoder so compressed GLBs load correctly
useGLTF.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

/** Error boundary that catches model-load failures and shows a placeholder box */
class ModelErrorBoundary extends Component<
  { children: ReactNode; position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[Primitive] model load error:", err.message); }
  render() {
    if (this.state.hasError) {
      const { position, rotation, scale } = this.props;
      return (
        <mesh position={position} rotation={rotation} scale={scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
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
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    // Ensure materials are preserved on clone
    c.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: THREE.Material) => m.clone());
        } else {
          child.material = child.material.clone();
        }
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
      <ModelErrorBoundary position={position} rotation={rotation} scale={scale}>
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
      </ModelErrorBoundary>
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
