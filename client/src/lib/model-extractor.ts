/**
 * model-extractor.ts — Three.js scene → Rebur Scene Format
 *
 * Called once after a GLTF or FBX file loads.  Traverses the Three.js scene
 * graph and extracts all structured data into the Rebur Scene Format so the
 * engine owns it: hierarchy, materials, mesh metadata, lights, cameras, and
 * animation clip info.
 *
 * Geometry vertex buffers are NOT serialised (too large); Three.js keeps them
 * and still drives rendering.  We extract bounding info, counts, and material
 * properties — everything needed for LOD, streaming, editing, and future sync.
 */

import * as THREE from "three";
import type {
  ReburScene,
  ReburNode,
  ReburMesh,
  ReburMaterial,
  ReburLight,
  ReburCamera,
  ReburAnimationClip,
  ReburVec3,
  ReburVec4,
  ReburBBox,
  ReburNodeKind,
} from "@shared/rebur-scene";

// ─── ID generator ────────────────────────────────────────────────────────────

let _seq = 0;
function uid(prefix: string): string {
  return `${prefix}_${++_seq}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toVec3(v: THREE.Vector3): ReburVec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function toQuat(q: THREE.Quaternion): ReburVec4 {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function toHex(c: THREE.Color): string {
  return `#${c.getHexString()}`;
}

function bboxFromMesh(mesh: THREE.Mesh): ReburBBox {
  const box = new THREE.Box3().setFromObject(mesh);
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

function radiusFromBbox(bbox: ReburBBox): number {
  const dx = bbox.max.x - bbox.min.x;
  const dy = bbox.max.y - bbox.min.y;
  const dz = bbox.max.z - bbox.min.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
}

// ─── Material extraction ──────────────────────────────────────────────────────

function extractMaterial(mat: THREE.Material): ReburMaterial {
  const id = uid("mat");
  const base: ReburMaterial = {
    id,
    name: mat.name || id,
    baseColor: "#cccccc",
    metallic: 0,
    roughness: 0.5,
    emissiveColor: "#000000",
    emissiveIntensity: 1,
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaMode: mat.transparent ? "BLEND" : "OPAQUE",
    doubleSided: mat.side === THREE.DoubleSide || mat.side === THREE.BackSide,
    wireframe: (mat as any).wireframe ?? false,
  };

  if (
    mat instanceof THREE.MeshStandardMaterial ||
    mat instanceof THREE.MeshPhysicalMaterial
  ) {
    base.baseColor = toHex(mat.color);
    base.metallic = mat.metalness;
    base.roughness = mat.roughness;
    base.emissiveColor = toHex(mat.emissive);
    base.emissiveIntensity = mat.emissiveIntensity;
    // Textures: extract the image src when it's a data-URL or object URL
    if (mat.map?.image?.src) base.baseColorTextureUrl = mat.map.image.src;
    if (mat.normalMap?.image?.src) base.normalTextureUrl = mat.normalMap.image.src;
    if (mat.metalnessMap?.image?.src) base.metallicRoughnessTextureUrl = mat.metalnessMap.image.src;
    if (mat.emissiveMap?.image?.src) base.emissiveTextureUrl = mat.emissiveMap.image.src;
  } else if (mat instanceof THREE.MeshPhongMaterial) {
    base.baseColor = toHex(mat.color);
    base.emissiveColor = toHex(mat.emissive);
    base.roughness = 1 - mat.shininess / 1000;
  } else if (mat instanceof THREE.MeshBasicMaterial) {
    base.baseColor = toHex(mat.color);
    base.metallic = 0;
    base.roughness = 1;
  } else if (mat instanceof THREE.MeshLambertMaterial) {
    base.baseColor = toHex(mat.color);
    base.emissiveColor = toHex(mat.emissive);
    base.metallic = 0;
    base.roughness = 1;
  }

  return base;
}

// ─── Mesh metadata extraction ─────────────────────────────────────────────────

function extractMeshMeta(
  mesh: THREE.Mesh,
  matIdMap: Map<THREE.Material, string>
): ReburMesh {
  const id = uid("mesh");
  const geo = mesh.geometry;

  const bbox = bboxFromMesh(mesh);
  const br = radiusFromBbox(bbox);

  const mats = Array.isArray(mesh.material)
    ? (mesh.material as THREE.Material[])
    : [mesh.material as THREE.Material];
  const materialIds = mats.map((m) => matIdMap.get(m) ?? "").filter(Boolean);

  return {
    id,
    name: mesh.name || id,
    materialIds,
    boundingBox: bbox,
    boundingRadius: br,
    vertexCount: geo.attributes.position?.count ?? 0,
    triangleCount: geo.index
      ? geo.index.count / 3
      : (geo.attributes.position?.count ?? 0) / 3,
    hasNormals: !!geo.attributes.normal,
    hasUVs: !!geo.attributes.uv,
    hasTangents: !!geo.attributes.tangent,
    hasSkinWeights: !!geo.attributes.skinWeight,
  };
}

// ─── Light extraction ─────────────────────────────────────────────────────────

function extractLight(light: THREE.Light): ReburLight {
  const id = uid("light");
  let kind: ReburLight["kind"] = "point";
  let range: number | undefined;
  let spotInner: number | undefined;
  let spotOuter: number | undefined;

  if (light instanceof THREE.PointLight) {
    kind = "point";
    range = light.distance || undefined;
  } else if (light instanceof THREE.DirectionalLight) {
    kind = "directional";
  } else if (light instanceof THREE.SpotLight) {
    kind = "spot";
    range = light.distance || undefined;
    spotInner = light.penumbra;
    spotOuter = light.angle;
  } else if (light instanceof THREE.AmbientLight) {
    kind = "ambient";
  }

  return {
    id,
    name: light.name || id,
    kind,
    color: toHex(light.color),
    intensity: light.intensity,
    range,
    spotInnerAngle: spotInner,
    spotOuterAngle: spotOuter,
    castShadow: light.castShadow,
  };
}

// ─── Camera extraction ────────────────────────────────────────────────────────

function extractCamera(cam: THREE.Camera): ReburCamera {
  const id = uid("cam");
  if (cam instanceof THREE.PerspectiveCamera) {
    return {
      id,
      name: cam.name || id,
      kind: "perspective",
      fov: cam.fov,
      near: cam.near,
      far: cam.far,
    };
  }
  if (cam instanceof THREE.OrthographicCamera) {
    return {
      id,
      name: cam.name || id,
      kind: "orthographic",
      near: cam.near,
      far: cam.far,
    };
  }
  return { id, name: cam.name || id, kind: "perspective", near: 0.1, far: 1000 };
}

// ─── Node kind ───────────────────────────────────────────────────────────────

function nodeKind(obj: THREE.Object3D): ReburNodeKind {
  if ((obj as any).isSkinnedMesh) return "skinned-mesh";
  if ((obj as any).isMesh) return "mesh";
  if ((obj as any).isLight) return "light";
  if ((obj as any).isCamera) return "camera";
  if ((obj as any).isBone) return "bone";
  if (obj.children.length === 0 && !(obj as any).isGroup) return "empty";
  return "group";
}

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * Extract a full Rebur Scene from a Three.js group (as returned by GLTFLoader
 * or FBXLoader).  Safe to call on the shared cached scene — does NOT mutate it.
 *
 * @param scene        The Three.js root group.
 * @param sourceFormat "gltf" | "glb" | "fbx"
 * @param sourceFileUrl Original upload URL (kept as a source reference).
 * @param animations   THREE.AnimationClip[] from the loader.
 */
export function extractReburScene(
  scene: THREE.Group,
  sourceFormat: "gltf" | "glb" | "fbx",
  sourceFileUrl: string,
  animations: THREE.AnimationClip[] = []
): ReburScene {
  // ── Pass 1: collect all unique materials ──────────────────────────────────
  const matByObj = new Map<THREE.Material, ReburMaterial>();
  const materials: Record<string, ReburMaterial> = {};
  const matIdMap = new Map<THREE.Material, string>();

  scene.traverse((obj: THREE.Object3D) => {
    if (!(obj as any).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material)
      ? (mesh.material as THREE.Material[])
      : [mesh.material as THREE.Material];
    mats.forEach((m) => {
      if (!m || matByObj.has(m)) return;
      const rm = extractMaterial(m);
      matByObj.set(m, rm);
      matIdMap.set(m, rm.id);
      materials[rm.id] = rm;
    });
  });

  // ── Pass 2: assign node IDs ───────────────────────────────────────────────
  const obj3dId = new Map<THREE.Object3D, string>();
  scene.traverse((obj: THREE.Object3D) => {
    obj3dId.set(obj, uid("node"));
  });

  // ── Pass 3: extract nodes + meshes + lights + cameras ───────────────────
  const nodes: Record<string, ReburNode> = {};
  const meshes: Record<string, ReburMesh> = {};
  const lights: Record<string, ReburLight> = {};
  const cameras: Record<string, ReburCamera> = {};
  let hasSkeletons = false;

  scene.traverse((obj: THREE.Object3D) => {
    const id = obj3dId.get(obj)!;
    const parentId = obj.parent ? (obj3dId.get(obj.parent) ?? null) : null;
    const childIds = obj.children
      .map((c) => obj3dId.get(c)!)
      .filter(Boolean);

    const kind = nodeKind(obj);
    if (kind === "skinned-mesh" || (obj as any).isBone) hasSkeletons = true;

    const meshIds: string[] = [];
    let lightId: string | undefined;
    let cameraId: string | undefined;

    if ((obj as any).isMesh) {
      try {
        const rm = extractMeshMeta(obj as THREE.Mesh, matIdMap);
        meshes[rm.id] = rm;
        meshIds.push(rm.id);
      } catch {
        // Skip degenerate geometry
      }
    } else if ((obj as any).isLight) {
      const rl = extractLight(obj as THREE.Light);
      lights[rl.id] = rl;
      lightId = rl.id;
    } else if ((obj as any).isCamera) {
      const rc = extractCamera(obj as THREE.Camera);
      cameras[rc.id] = rc;
      cameraId = rc.id;
    }

    nodes[id] = {
      id,
      name: obj.name || kind,
      parentId,
      childIds,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      quaternion: toQuat(obj.quaternion),
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      kind,
      meshIds,
      lightId,
      cameraId,
      visible: obj.visible,
    };
  });

  // Root node IDs = scene's direct children
  const rootNodeIds = scene.children
    .map((c) => obj3dId.get(c)!)
    .filter(Boolean);

  // ── Scene bounding box ───────────────────────────────────────────────────
  const sceneBbox = new THREE.Box3().setFromObject(scene);
  const boundingBox: ReburBBox = {
    min: { x: sceneBbox.min.x, y: sceneBbox.min.y, z: sceneBbox.min.z },
    max: { x: sceneBbox.max.x, y: sceneBbox.max.y, z: sceneBbox.max.z },
  };
  const boundingRadius = radiusFromBbox(boundingBox);

  // ── Animation metadata ───────────────────────────────────────────────────
  const animClips: ReburAnimationClip[] = animations.map((clip) => ({
    name: clip.name || "Untitled",
    duration: clip.duration,
    trackCount: clip.tracks.length,
  }));

  return {
    version: 1,
    sourceFormat,
    sourceFileUrl,
    extractedAt: Date.now(),

    rootNodeIds,
    nodes,

    meshes,
    materials,
    lights,
    cameras,

    animations: animClips,

    boundingBox,
    boundingRadius: Math.max(boundingRadius, 0.1),

    nodeCount: Object.keys(nodes).length,
    meshCount: Object.keys(meshes).length,
    materialCount: Object.keys(materials).length,
    animationCount: animClips.length,
    hasSkeletons,
  };
}

// ─── Per-URL cache (module-level, lives for the session) ─────────────────────

const _cache = new Map<string, ReburScene>();

export function cacheReburScene(url: string, scene: ReburScene): void {
  _cache.set(url, scene);
}

export function getCachedReburScene(url: string): ReburScene | null {
  return _cache.get(url) ?? null;
}
