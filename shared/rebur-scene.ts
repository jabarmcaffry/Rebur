/**
 * rebur-scene.ts — Rebur Scene Format
 *
 * This is the canonical data format Rebur owns after importing any 3-D asset
 * (FBX, GLTF, GLB).  The original file is kept only as a source reference;
 * everything the engine needs — hierarchy, materials, bounds, lights, cameras,
 * animation metadata — lives here and is fully editable.
 *
 * Design principles
 * -----------------
 * • Geometry vertex data is NOT serialised here (too large, still rendered via
 *   Three.js from the source URL).  We own the *metadata* about the geometry.
 * • Materials are first-class editable objects (not locked to the file's values).
 * • Bounding information is always extracted so streaming / LOD can work on any
 *   object type without loading the full geometry.
 * • Animation clip metadata is extracted; Three.js AnimationMixer still drives
 *   playback using the clips from the original load.
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export interface ReburVec3 { x: number; y: number; z: number }
export interface ReburVec4 { x: number; y: number; z: number; w: number }
export interface ReburBBox  { min: ReburVec3; max: ReburVec3 }

// ─── Scene Node ───────────────────────────────────────────────────────────────

export type ReburNodeKind =
  | "group"
  | "mesh"
  | "skinned-mesh"
  | "light"
  | "camera"
  | "bone"
  | "empty";

export interface ReburNode {
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];

  // Local transform (relative to parent)
  position: ReburVec3;
  rotation: ReburVec3;    // Euler XYZ, radians
  quaternion: ReburVec4;
  scale: ReburVec3;

  kind: ReburNodeKind;
  meshIds: string[];          // geometry attached to this node
  lightId?: string;
  cameraId?: string;
  visible: boolean;
}

// ─── Material ─────────────────────────────────────────────────────────────────

export interface ReburMaterial {
  id: string;
  name: string;

  // PBR core (all editable in Rebur)
  baseColor: string;                       // hex #rrggbb
  baseColorTextureUrl?: string;
  metallic: number;                        // 0–1
  roughness: number;                       // 0–1
  metallicRoughnessTextureUrl?: string;
  normalTextureUrl?: string;

  // Emissive
  emissiveColor: string;                   // hex, #000000 = none
  emissiveIntensity: number;
  emissiveTextureUrl?: string;

  // Blending
  transparent: boolean;
  opacity: number;                         // 0–1
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff?: number;

  // Geometry
  doubleSided: boolean;
  wireframe: boolean;
}

// ─── Mesh (geometry metadata — no vertex buffers) ────────────────────────────

export interface ReburMesh {
  id: string;
  name: string;
  materialIds: string[];         // one per submesh/group

  // Bounds (world-space after model normalisation)
  boundingBox: ReburBBox;
  boundingRadius: number;        // sphere radius from centroid

  // Geometry stats
  vertexCount: number;
  triangleCount: number;
  hasNormals: boolean;
  hasUVs: boolean;
  hasTangents: boolean;
  hasSkinWeights: boolean;
}

// ─── Light ────────────────────────────────────────────────────────────────────

export interface ReburLight {
  id: string;
  name: string;
  kind: "point" | "directional" | "spot" | "ambient";
  color: string;                 // hex
  intensity: number;
  range?: number;                // point / spot
  spotInnerAngle?: number;       // radians
  spotOuterAngle?: number;       // radians
  castShadow: boolean;
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export interface ReburCamera {
  id: string;
  name: string;
  kind: "perspective" | "orthographic";
  fov?: number;                  // degrees, perspective only
  near: number;
  far: number;
}

// ─── Animation ───────────────────────────────────────────────────────────────

export interface ReburAnimationClip {
  name: string;
  duration: number;              // seconds
  trackCount: number;            // number of bone/node channels
  // Note: full keyframe data is not serialised here; Three.js AnimationClip
  // objects are kept in memory and used directly by AnimationMixer.
}

// ─── Rebur Scene (top level) ─────────────────────────────────────────────────

export interface ReburScene {
  version: 1;
  sourceFormat: "gltf" | "glb" | "fbx";
  sourceFileUrl: string;
  extractedAt: number;            // Date.now()

  // Hierarchy
  rootNodeIds: string[];
  nodes: Record<string, ReburNode>;

  // Assets
  meshes: Record<string, ReburMesh>;
  materials: Record<string, ReburMaterial>;
  lights: Record<string, ReburLight>;
  cameras: Record<string, ReburCamera>;

  // Animations (metadata only)
  animations: ReburAnimationClip[];

  // Scene-level bounds (used for streaming radius + LOD)
  boundingBox: ReburBBox;
  boundingRadius: number;         // sphere enclosing the whole model (normalised)

  // Summary counters
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  animationCount: number;
  hasSkeletons: boolean;
}
