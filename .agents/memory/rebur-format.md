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
- Avatar.tsx calls `buildReburAsset` on first mount and caches it at module level.
- `downloadAvatarRebur()` is exported from Avatar.tsx for the Editor's "Export Avatar .rebur" button.
- Editor.tsx `handleImportRebur` handles `.rebur` parse and `.fbx`→`.rebur` conversion+download.
- geometryJson = `geo.toJSON()`, animations[i].clipJson = `THREE.AnimationClip.toJSON(clip)`.
- Reconstruct: `new THREE.BufferGeometryLoader().parse(geometryJson)`, `THREE.AnimationClip.parse(clipJson)`.
