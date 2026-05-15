/**
 * AnimationSystem — vertical slice porting the existing auto-properties logic
 * into the ECS pipeline. Behavior matches `animation/auto-properties.ts`
 * exactly so the legacy and new paths produce identical results.
 */
import { defineSystem } from "../system";
import { AutoBehavior, Transform } from "../components";

export const AnimationSystem = defineSystem({
  id: "animation",
  side: "server",
  run({ world, dt }) {
    for (const [eid, behavior, transform] of world.query(AutoBehavior, Transform)) {
      const t = transform;
      if (behavior.autoRotateY !== undefined) t.rotation.y += behavior.autoRotateY * dt;
      if (behavior.autoSpin) {
        if (behavior.autoSpin.x) t.rotation.x += behavior.autoSpin.x * dt;
        if (behavior.autoSpin.y) t.rotation.y += behavior.autoSpin.y * dt;
        if (behavior.autoSpin.z) t.rotation.z += behavior.autoSpin.z * dt;
      }
      if (behavior.autoBob) {
        if (behavior.autoBob.startY === undefined) behavior.autoBob.startY = t.position.y;
        behavior.autoBob._time = (behavior.autoBob._time || 0) + dt * behavior.autoBob.speed;
        t.position.y =
          behavior.autoBob.startY + Math.sin(behavior.autoBob._time) * behavior.autoBob.amplitude;
      }
      if (behavior.autoFollow?.target) {
        const tp = behavior.autoFollow.target.position;
        const off = behavior.autoFollow.offset ?? { x: 0, y: 0, z: 0 };
        const dx = tp.x + off.x - t.position.x;
        const dy = tp.y + off.y - t.position.y;
        const dz = tp.z + off.z - t.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 0.01) {
          const move = Math.min(behavior.autoFollow.speed * dt, dist);
          t.position.x += (dx / dist) * move;
          t.position.y += (dy / dist) * move;
          t.position.z += (dz / dist) * move;
        }
      }
      if (behavior.autoMove) {
        t.position.x += behavior.autoMove.direction.x * behavior.autoMove.speed * dt;
        t.position.y += behavior.autoMove.direction.y * behavior.autoMove.speed * dt;
        t.position.z += behavior.autoMove.direction.z * behavior.autoMove.speed * dt;
      }
      // Touch the entity to bump version (already implicit if components mutated; keep eid for future).
      void eid;
    }
  },
});
