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

// ── Texture cache — keyed by URL ─────────────────────────────────────────
const _texCache = new Map<string, THREE.Texture>();
function loadTexture(url: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const key = `${url}|${repeatX}|${repeatY}`;
  let tex = _texCache.get(key);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    _texCache.set(key, tex);
  }
  return tex;
}

/**
 * Renders a single RenderObject from server state.
 * Supports primitives, lights, 3-D models (GLB/GLTF), audio sources, and
 * the extended primitive palette (wedge, cone, torus, ring, ramp, plane).
 */
export default function Primitive({ obj, onClick }: { obj: RenderObject; onClick?: (e: any) => void }) {
  if (!obj.visible) return null;
  if (obj.type === "folder") return null;
  if (obj.type === "particleEmitter") return null;
  if (obj.type === "terrain") return null; // rendered by TerrainLayer (server streams data)

  const opacity = 1 - (obj.transparency ?? 0);
  if (opacity <= 0.01) return null;
  const isTransparent = (obj.transparency ?? 0) > 0;

  const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
  const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
  const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
  const color = obj.color;

  if (obj.type === "light") {
    const props: any = obj.properties ?? {};
    const kind = props.lightType ?? "point";
    const intensity = +(props.intensity ?? 1.2);
    const distance = +(props.distance ?? 20);
    if (kind === "spot") {
      return (
        <group position={position} rotation={rotation}>
          <spotLight color={color} intensity={intensity} distance={distance} angle={props.angle ?? 0.5} penumbra={props.penumbra ?? 0.3} />
        </group>
      );
    }
    if (kind === "directional") {
      return (
        <group position={position} rotation={rotation}>
          <directionalLight color={color} intensity={intensity} />
        </group>
      );
    }
    return (
      <group position={position}>
        <pointLight color={color} intensity={intensity} distance={distance} />
      </group>
    );
  }

  if (obj.type === "audio") return null;

  if (obj.type === "model") {
    const modelUrl = (obj as any).modelUrl;
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
        modelScale={(obj as any).modelScale ?? 1}
      />
    );
  }

  let geometry: JSX.Element;
  switch (obj.primitiveType) {
    case "sphere":      geometry = <sphereGeometry args={[0.5, 32, 32]} />; break;
    case "cylinder":    geometry = <cylinderGeometry args={[0.5, 0.5, 1, 32]} />; break;
    case "cone":        geometry = <coneGeometry args={[0.5, 1, 32]} />; break;
    case "torus":       geometry = <torusGeometry args={[0.35, 0.15, 16, 48]} />; break;
    case "ring":        geometry = <torusGeometry args={[0.4, 0.05, 12, 48]} />; break;
    case "plane":       geometry = <planeGeometry args={[1, 1]} />; break;
    case "wedge":
    case "ramp":        geometry = <bufferGeometry attach="geometry" {...wedgeGeometry()} />; break;
    case "cube":
    default:            geometry = <boxGeometry args={[1, 1, 1]} />;
  }

  // Material — texture/PBR overrides
  const props: any = (obj as any).properties ?? {};
  const texUrl: string | undefined = props.textureUrl ?? (obj as any).textureUrl;
  const repeatX = +(props.textureRepeatX ?? 1);
  const repeatY = +(props.textureRepeatY ?? 1);
  const map = texUrl ? loadTexture(texUrl, repeatX, repeatY) : undefined;

  return (
    <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
      {geometry}
      <meshStandardMaterial
        color={color}
        map={map}
        transparent={isTransparent}
        opacity={opacity}
        roughness={+(props.roughness ?? 0.7)}
        metalness={+(props.metallic ?? 0)}
        emissive={props.emissive ?? "#000000"}
      />
    </mesh>
  );
}

// ── Wedge geometry builder (right-triangular prism) ──────────────────────
function wedgeGeometry() {
  const verts = new Float32Array([
    // 6 unique verts: 0 back-bottom-left, 1 back-bottom-right, 2 front-bottom-left,
    // 3 front-bottom-right, 4 back-top-left, 5 back-top-right
    -0.5, -0.5,  0.5,   // 0
     0.5, -0.5,  0.5,   // 1
    -0.5, -0.5, -0.5,   // 2
     0.5, -0.5, -0.5,   // 3
    -0.5,  0.5,  0.5,   // 4
     0.5,  0.5,  0.5,   // 5
  ]);
  const idx = new Uint16Array([
    0,1,5, 0,5,4,          // back face (rect)
    2,3,1, 2,1,0,          // bottom
    2,0,4,                 // left tri
    3,5,1,                 // right tri (mirror)
    4,5,3, 4,3,2,          // slope (top)
  ]);
  return {
    attributes: {
      position: new THREE.BufferAttribute(verts, 3),
    },
    index: new THREE.BufferAttribute(idx, 1),
  };
}
