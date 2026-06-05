---
name: SkeletonUtils import
description: How to correctly import SkeletonUtils from Three.js examples — named export does not exist.
---

## Rule
Use `import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js"` then call `SkeletonUtils.clone(group)`.

**Why:** The module exports individual functions (`clone`, `retarget`, `retargetClip`) directly — there is no wrapper object named `SkeletonUtils`. Using `import { SkeletonUtils }` throws a SyntaxError at runtime: "does not provide an export named 'SkeletonUtils'".

**How to apply:** Any time you need skeleton-aware cloning of a THREE.Group (e.g. cloning a loaded FBX for multiple avatar instances), use `SkeletonUtils.clone(source)` instead of `source.clone(true)` — the latter breaks skeleton binding.
