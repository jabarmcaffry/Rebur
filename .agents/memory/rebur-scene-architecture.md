---
name: Rebur Scene Format architecture
description: How imported 3D assets (FBX/GLTF/GLB) are converted into the Rebur Scene Format, plus LOD/streaming design for all object types.
---

## Rule
FBX, GLTF, and GLB files are treated as source assets, not editable files.
When imported, their data is extracted into the **Rebur Scene Format** (`shared/rebur-scene.ts`).
Rebur owns the extracted data; the source file URL is kept only as a reference.

## Extraction pipeline
```
FILE (FBX/GLTF/GLB)
  └─ loaded by Three.js (GLTFLoader or FBXLoader)
  └─ passed to extractReburScene() in client/src/lib/model-extractor.ts
  └─ returns ReburScene (cached in model-extractor's _cache Map)
  └─ stored in gltf-loader.ts ModelState.reburScene
  └─ propagated to Editor (reburScenes state) and Play mode (Primitive.tsx)
```

## What is extracted (metadata only — no vertex buffers)
- **Nodes** — full scene hierarchy (parent/child, transforms, kind, visible)
- **Materials** — PBR properties (baseColor, metallic, roughness, emissive, opacity, textures)
- **Meshes** — bounding box, bounding radius, vertex/triangle counts, feature flags (normals/UVs/tangents/skinWeights)
- **Lights** — kind, color, intensity, range, shadow
- **Cameras** — perspective/ortho, fov, near/far
- **Animations** — clip names, durations, track counts (keyframes NOT serialised; Three.js AnimationClip drives playback)
- **Scene-level bounding box + radius** — used for streaming and LOD

## LOD system (Primitive.tsx) — applies to ALL object types
Effective distance = distanceToPlayer / worldBoundingRadius

worldBoundingRadius:
- models: max(scale) × 0.866 (half-diagonal of normalised unit box)
- primitives: max(scale) × 0.5
- lights: always rendered (cheap)

LOD tiers:
- Tier 0 (near): dist < max(10, worldR×8) → full quality
- Tier 1 (medium): dist < max(28, worldR×20) → reduced segment count for primitives
- Tier 2 (far): → bbox wireframe proxy for models, 8-seg for primitives

This means a large building stays full-quality further than a tiny prop.

## Streaming (PlayMode.tsx)
Objects beyond 200 units are culled (render null).
distanceToPlayer is computed per-object and passed to <Primitive>.
BBoxProxy is also used for tier-2 models before even loading the asset.

## Key files
- `shared/rebur-scene.ts` — ReburScene, ReburNode, ReburMaterial, ReburMesh, ReburLight, ReburCamera, ReburAnimationClip types
- `client/src/lib/model-extractor.ts` — extractReburScene(), cacheReburScene(), getCachedReburScene()
- `client/src/lib/gltf-loader.ts` — ModelState now includes reburScene; hooks call extractor after load
- `client/src/components/play/Primitive.tsx` — unified LOD+streaming for ALL object types
- `client/src/pages/Editor.tsx` — reburScenes state (was modelParts), GltfLoader uses onSceneExtracted callback

## Editor hierarchy
When a model object is expanded in the hierarchy, shows rootNodeIds from its ReburScene.
Each node row shows: kind icon (Box/Sun/Eye/Layers) + node name + metadata (verts, child count, etc).
selectedPartKey = "objectId:nodeId" to identify selected sub-nodes.

**Why:** Once data is in Rebur format, streaming, LOD, multiplayer sync, and material editing all work uniformly on the same data structure regardless of source format.
