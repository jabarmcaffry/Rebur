---
name: Animation system design
description: Roblox-style AnimationTrack system — how it's wired together and key design decisions.
---

The animation system was rewritten from a custom keyframe-player to a Roblox-style Animator/AnimationTrack pattern.

## Key files
- `client/src/lib/runtime/animation/keyframe-player.ts` — exports `Animator`, `AnimationTrack`, `getAnimator(obj)`, `stepAllAnimators(list, dt)`
- `client/src/lib/runtime/oop/runtime-object-proxy.ts` — imports `getAnimator`; adds `get animator()` getter to the ECS proxy object
- `client/src/lib/runtime/types.ts` — `RuntimeObject.animator: Animator` (typed via import())
- `client/src/lib/runtime/game-runtime.ts` — calls `stepAllAnimators(this.objectList, dt)` in `updateAutoProperties`

## Design decisions

**WeakMap registry** — Animators are stored in a module-level `WeakMap<object, Animator>`. The key is the ECS proxy object reference. This means:
- Animators are lazy-created on first `obj.animator` access
- They are automatically GC'd when their object is destroyed (no manual cleanup)
- `stepAllAnimators` skips objects with no animator (uses `_animators.has(obj)`)

**Absolute keyframes** — Keyframe values are absolute positions/rotations/scales, not deltas. At weight=1 (default) values are set directly. At weight<1 the animation blends between the current value and the keyframe value each frame.

**Why:** Absolute keyframes are simpler to reason about and match Roblox's CFrame-based animation model. Scripts define where an object should be at each point in time.

**applyJoints removed** — The old `applyJoints` export was deleted when keyframe-player.ts was rewritten. If joint functionality is needed in the future, implement it as a separate module.
