import * as THREE from "three";
import { REBUR_VERSION, type ReburAsset, type ReburBone, type ReburAnimation } from "./types";

/**
 * Build a ReburAsset from:
 *  - a loaded base FBX Group (supplies the SkinnedMesh + Skeleton)
 *  - an array of { name, group } where group is a loaded animation FBX
 *    (only the first AnimationClip from each is used, renamed to `name`)
 */
export function buildReburAsset(
  assetName: string,
  baseGroup: THREE.Group,
  animSources: Array<{ name: string; group: THREE.Group }>,
): ReburAsset {
  // ── Capture the FBXLoader scale (0.01 for cm, 1.0 for m, etc.) ───────────
  // FBXLoader sets a uniform scale on the root group based on the FBX file's
  // unit info.  We must restore this scale at render time so the skinning
  // math (bone-inverse matrices recomputed fresh on bind) is consistent.
  const modelScale = baseGroup.scale.x;
  console.log(`[rebur] FBX root group scale: ${modelScale}`);

  // ── Find the primary SkinnedMesh ──────────────────────────────────────────
  let skinnedMesh: THREE.SkinnedMesh | null = null;
  baseGroup.traverse((child) => {
    if (!skinnedMesh && (child as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMesh = child as THREE.SkinnedMesh;
    }
  });

  if (!skinnedMesh) {
    throw new Error("[rebur] No SkinnedMesh found in base model");
  }

  const geo = (skinnedMesh as THREE.SkinnedMesh).geometry;
  const skeleton = (skinnedMesh as THREE.SkinnedMesh).skeleton;

  if (!skeleton || skeleton.bones.length === 0) {
    throw new Error("[rebur] SkinnedMesh has no skeleton / bones");
  }

  console.log(`[rebur] Found SkinnedMesh with ${skeleton.bones.length} bones, geo vertices: ${geo.attributes.position?.count ?? "?"}`);
  console.log(`[rebur] Bone names (first 5): ${skeleton.bones.slice(0, 5).map(b => b.name).join(", ")}`);

  // ── Serialize geometry ────────────────────────────────────────────────────
  const geometryJson = geo.toJSON() as Record<string, unknown>;

  // ── Serialize skeleton ────────────────────────────────────────────────────
  const bones: ReburBone[] = skeleton.bones.map((bone) => {
    const parentIndex = skeleton.bones.findIndex((b) => b === bone.parent);
    return {
      name: bone.name,
      parentIndex,
      position: [bone.position.x, bone.position.y, bone.position.z],
      quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
      scale: [bone.scale.x, bone.scale.y, bone.scale.z],
    };
  });

  const boneInverses = skeleton.boneInverses.map((m) => [...m.elements] as number[]);

  // ── Collect valid bone names from the base skeleton ──────────────────────
  const boneNames = new Set(skeleton.bones.map((b) => b.name));

  // ── Serialize animations from separate FBX files ──────────────────────────
  const animations: ReburAnimation[] = [];
  for (const { name, group } of animSources) {
    const srcClips = group.animations;
    if (!srcClips || srcClips.length === 0) {
      console.warn(`[rebur] Animation "${name}" FBX has no clips — skipping`);
      continue;
    }
    const clip = srcClips[0].clone();
    clip.name = name;

    // Log the first few track names so we can verify they match the skeleton
    console.log(`[rebur] Anim "${name}" — sample tracks: ${clip.tracks.slice(0, 3).map(t => t.name).join(", ")}`);

    // Filter out tracks whose target bone doesn't exist in the base skeleton.
    // Common culprit: "root" root-motion tracks from game-engine FBX exports.
    const beforeCount = clip.tracks.length;
    clip.tracks = clip.tracks.filter((track) => {
      // Track name format: "BoneName.property" or "BoneName.property[index]"
      const dot = track.name.indexOf(".");
      const boneName = dot >= 0 ? track.name.slice(0, dot) : track.name;
      return boneNames.has(boneName);
    });

    console.log(`[rebur] Anim "${name}": ${beforeCount} tracks → ${clip.tracks.length} after bone-name filter`);

    if (clip.tracks.length === 0) {
      console.warn(`[rebur] Animation "${name}" has no matching tracks for the base skeleton — skipping`);
      continue;
    }

    animations.push({
      name,
      duration: clip.duration,
      clipJson: THREE.AnimationClip.toJSON(clip) as Record<string, unknown>,
    });
  }

  return {
    version: REBUR_VERSION,
    format: "rebur",
    name: assetName,
    modelScale,
    geometryJson,
    skeleton: { bones, boneInverses },
    animations,
  };
}

/** Trigger a browser download of the asset as a .rebur file. */
export function exportReburAsset(asset: ReburAsset, filename?: string): void {
  const json = JSON.stringify(asset, null, 2);
  const blob = new Blob([json], { type: "application/x-rebur" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `${asset.name}.rebur`;
  a.click();
  URL.revokeObjectURL(url);
}
