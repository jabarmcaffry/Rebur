---
name: SkinnedMesh frustum culling
description: Why SkinnedMesh disappears silently and how to prevent it.
---

Always set `mesh.frustumCulled = false` on every `THREE.SkinnedMesh`.

**Why:** Three.js computes the bounding box in bind pose (rest position) and uses it for frustum culling. Animated poses move vertices outside that box, so the GPU skips the draw call entirely — the avatar simply vanishes with no error. This is the single most common cause of "invisible skinned mesh" bugs.

**How to apply:** Set it immediately after constructing the SkinnedMesh, before calling `bind()`:
```typescript
const mesh = new THREE.SkinnedMesh(geometry, material);
mesh.frustumCulled = false;  // ← must be here
mesh.normalizeSkinWeights();
mesh.add(rootBone);
mesh.bind(skeleton);
```

In this codebase: `client/src/lib/rebur/loader.ts`, inside `instantiateReburAsset`.
