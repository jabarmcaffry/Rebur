import * as THREE from "three";
import type { ReburAsset, ReburBone } from "./types";
import { REBUR_VERSION } from "./types";

export interface ReburLoaded {
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  clips: THREE.AnimationClip[];
  /** Root bone to add to the scene alongside the mesh */
  rootBone: THREE.Bone;
  /**
   * The uniform scale factor that FBXLoader originally applied to the root
   * group (captured during buildReburAsset).  Apply this as the wrapper
   * group scale in the scene so the skinning math is correct.
   * Defaults to 0.01 for legacy assets that predate this field.
   */
  modelScale: number;
}

function buildSkeleton(boneData: ReburBone[], inverseArrays: number[][]): {
  bones: THREE.Bone[];
  boneInverses: THREE.Matrix4[];
  rootBone: THREE.Bone;
} {
  const bones = boneData.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(...b.position);
    bone.quaternion.set(...b.quaternion);
    bone.scale.set(...b.scale);
    return bone;
  });

  boneData.forEach((bd, i) => {
    if (bd.parentIndex >= 0) {
      bones[bd.parentIndex].add(bones[i]);
    }
  });

  const boneInverses = inverseArrays.map((elems) => {
    const m = new THREE.Matrix4();
    m.elements = elems as unknown as [
      number,number,number,number,
      number,number,number,number,
      number,number,number,number,
      number,number,number,number,
    ];
    return m;
  });

  const rootBone = bones.find((_, i) => boneData[i].parentIndex < 0) ?? bones[0];
  return { bones, boneInverses, rootBone };
}

/**
 * Reconstruct THREE.js objects from a ReburAsset.
 * Returns a SkinnedMesh ready to add to the scene.
 */
export function instantiateReburAsset(asset: ReburAsset): ReburLoaded {
  if (asset.format !== "rebur") throw new Error("[rebur] Not a .rebur asset");
  if (asset.version !== REBUR_VERSION) {
    console.warn(`[rebur] Version mismatch: expected ${REBUR_VERSION}, got ${asset.version}`);
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  const loader = new THREE.BufferGeometryLoader();
  const geometry = loader.parse(asset.geometryJson as any);

  // ── Skeleton ──────────────────────────────────────────────────────────────
  const { bones, boneInverses, rootBone } = buildSkeleton(
    asset.skeleton.bones,
    asset.skeleton.boneInverses,
  );
  const skeleton = new THREE.Skeleton(bones, boneInverses);

  // ── Material ──────────────────────────────────────────────────────────────
  // Note: `skinning` was removed from MeshStandardMaterial in Three.js r152+;
  // SkinnedMesh handles GPU skinning automatically.
  const material = new THREE.MeshStandardMaterial({
    color: 0xddccbb,
    roughness: 0.6,
    metalness: 0.0,
  });

  // ── Skinned Mesh ──────────────────────────────────────────────────────────
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Skinned meshes must have frustum culling disabled — their bounding box is
  // computed in bind pose and rarely encloses the animated range, causing the
  // GPU to skip the draw call entirely even when the avatar is fully on screen.
  mesh.frustumCulled = false;
  mesh.normalizeSkinWeights();

  mesh.add(rootBone);
  mesh.bind(skeleton);

  // ── Animation Clips ───────────────────────────────────────────────────────
  const clips: THREE.AnimationClip[] = asset.animations.map((a) =>
    THREE.AnimationClip.parse(a.clipJson as any),
  );

  const modelScale = typeof asset.modelScale === "number" ? asset.modelScale : 0.01;
  console.log(`[rebur] instantiateReburAsset: restoring modelScale=${modelScale}`);

  return { mesh, skeleton, clips, rootBone, modelScale };
}

/**
 * Parse a .rebur file from an ArrayBuffer or string.
 */
export function parseReburFile(data: ArrayBuffer | string): ReburAsset {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  const json = JSON.parse(text) as ReburAsset;
  if (json.format !== "rebur") throw new Error("[rebur] File is not a .rebur asset");
  return json;
}

/**
 * Open a file-picker dialog and load the selected .rebur file.
 * Returns the parsed asset.
 */
export function importReburFile(): Promise<ReburAsset> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".rebur,application/x-rebur";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const asset = parseReburFile(e.target!.result as string);
          resolve(asset);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * Import any FBX via file-picker, return the THREE.Group so the caller
 * can pass it to buildReburAsset. Requires the FBXLoader to already be
 * available (lazy-loaded so we don't pull it into main bundle).
 */
export async function importFbxFile(): Promise<THREE.Group> {
  const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".fbx";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const loader = new FBXLoader();
          const group = loader.parse(e.target!.result as ArrayBuffer, "");
          resolve(group as unknown as THREE.Group);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}
