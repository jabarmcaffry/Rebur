---
name: .rebur format
description: Custom 3D character asset format that packages mesh, skeleton, and animations into a single JSON file.
---

## Rule
The `.rebur` format lives in `client/src/lib/rebur/` and consists of:
- `types.ts` — ReburAsset interface (version, format, name, geometryJson, skeleton, animations)
- `serializer.ts` — `buildReburAsset(name, baseGroup, animSources[])` → ReburAsset; `exportReburAsset(asset, filename)` → browser download
- `loader.ts` — `instantiateReburAsset(asset)` → {mesh, skeleton, clips, rootBone}; `parseReburFile(data)` → ReburAsset; `importFbxFile()` → THREE.Group
- `index.ts` — re-exports all

**Why:** Provides a self-contained, engine-native format so users don't depend on FBX. Animation clips come from separate FBX files retargeted onto the base mesh by bone-name matching via THREE.AnimationMixer.

**How to apply:**
- Avatar.tsx calls `buildReburAsset` on first mount, caches result in **IndexedDB** (`rebur-cache` DB, `assets` store).
- localStorage is too small (5MB limit) for compiled .rebur JSON (30-100MB); always use IndexedDB.
- Bump `REBUR_CACHE_KEY` in `Avatar.tsx` (e.g. `v3` → `v4`) whenever Avatar.fbx or any animation FBX changes.
- `downloadAvatarRebur()` is exported from Avatar.tsx for the Editor's "Export Avatar .rebur" button.
- geometryJson = `geo.toJSON()`, animations[i].clipJson = `THREE.AnimationClip.toJSON(clip)`.
- Reconstruct: `new THREE.BufferGeometryLoader().parse(geometryJson)`, `THREE.AnimationClip.parse(clipJson)`.

## Root-motion track filter (serializer.ts)
Animation FBX files from game engines often include a `root` root-motion bone track that doesn't exist in Avatar.fbx's skeleton. serializer.ts filters these: only include tracks whose bone name exists in the base skeleton's bone set. Without this, Three.js logs `No target node found for track: root.position/quaternion/scale` for every animation.

## loader.ts gotchas
- `skinning: true` was removed from `MeshStandardMaterial` in Three.js r152+ — remove it or warnings appear.
- `mesh.castShadow = false` / `mesh.receiveShadow = false` reduce GPU load.
- `rootBone` is added to `mesh` via `mesh.add(rootBone)` in `instantiateReburAsset` — do NOT add it again as a separate R3F `<primitive>` in Avatar.tsx (detaches it from mesh scene graph → breaks skinning).

## WebGL context loss in Replit preview (Replit-specific)
Replit's sandbox uses a software WebGL renderer with limited VRAM. SkinnedMesh upload crashes it. Mitigations:
- Editor Canvas is unmounted when PlayMode is active (`!playing` guard in Editor.tsx scene TabsContent).
- PlayMode Canvas: `powerPreference: "low-power"`, no shadows, reduced grid size.
- Runtime context-loss fallback: if context not restored in 3s, `webglContextLost` state switches PlayMode to SVGScene.
- **Real browsers with GPU hardware work correctly** — this is only a Replit preview limitation.

## Animation names
Server sends: `idle`, `walk`, `run`, `jump`, `fall` (Avatar.tsx maps `fall` → `idle`). Clips named to match in `buildReburAsset`. Jump uses `LoopOnce + clampWhenFinished`.
