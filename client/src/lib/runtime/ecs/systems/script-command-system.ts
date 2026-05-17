/**
 * ScriptCommandSystem — drains commands emitted by the OOP facade and applies
 * them to ECS components. This is the ONLY place script-issued mutations
 * become real on the server. Validators on the CommandBus already enforced
 * authority; here we just apply.
 */
import { defineSystem } from "../system";
import { CommandGroups } from "../../commands/router";
import { Transform, Velocity, Visual, Physics, AutoBehavior } from "../components";
import { translateError } from "../../trace/error-translator";
import type { Vec3 } from "../../types";

// Command payload types
interface SetPositionPayload { position: Vec3 }
interface SetRotationPayload { rotation: Vec3 }
interface SetScalePayload { scale: Vec3 }
interface SetVelocityPayload { velocity: Vec3 }
interface SetColorPayload { color: string }
interface SetVisiblePayload { visible: boolean }
interface SetTransparencyPayload { transparency: number }
interface SetAnchoredPayload { anchored: boolean }
interface SetCanCollidePayload { canCollide: boolean }
interface TweenPayload { properties: Record<string, number>; duration: number; easing?: string }
interface SetAutoRotateYPayload { speed: number | undefined }
type SetAutoBobPayload = { amplitude?: number; speed?: number } | undefined
type SetAutoSpinPayload = { x?: number; y?: number; z?: number } | undefined

export const ScriptCommandSystem = defineSystem({
  id: "script-commands",
  side: "server",
  run({ world, commands, trace }) {
    for (const cmd of commands.drain(CommandGroups.Script)) {
      try {
        trace.withCommand(cmd, () => {
          if (cmd.entity === undefined) return;
          const eid = cmd.entity as unknown as ReturnType<typeof world.create>;
          
          switch (cmd.kind) {
            // Transform commands
            case "transform.setPosition": {
              const t = world.get(eid, Transform);
              if (!t) throw new Error(`object ${cmd.entity} has no transform component`);
              t.position = { ...(cmd.payload as SetPositionPayload).position };
              world.set(eid, Transform, t);
              break;
            }
            case "transform.setRotation": {
              const t = world.get(eid, Transform);
              if (!t) throw new Error(`object ${cmd.entity} has no transform component`);
              t.rotation = { ...(cmd.payload as SetRotationPayload).rotation };
              world.set(eid, Transform, t);
              break;
            }
            case "transform.setScale": {
              const t = world.get(eid, Transform);
              if (!t) throw new Error(`object ${cmd.entity} has no transform component`);
              t.scale = { ...(cmd.payload as SetScalePayload).scale };
              world.set(eid, Transform, t);
              break;
            }
            
            // Physics commands
            case "physics.setVelocity": {
              const v = world.get(eid, Velocity);
              if (!v) {
                world.set(eid, Velocity, { ...(cmd.payload as SetVelocityPayload).velocity });
              } else {
                const payload = (cmd.payload as SetVelocityPayload).velocity;
                v.x = payload.x;
                v.y = payload.y;
                v.z = payload.z;
                world.set(eid, Velocity, v);
              }
              break;
            }
            case "physics.setAnchored": {
              const p = world.get(eid, Physics);
              if (!p) throw new Error(`object ${cmd.entity} has no physics component`);
              p.anchored = (cmd.payload as SetAnchoredPayload).anchored;
              world.set(eid, Physics, p);
              break;
            }
            case "physics.setCanCollide": {
              const p = world.get(eid, Physics);
              if (!p) throw new Error(`object ${cmd.entity} has no physics component`);
              p.canCollide = (cmd.payload as SetCanCollidePayload).canCollide;
              world.set(eid, Physics, p);
              break;
            }
            
            // Visual commands
            case "visual.setColor": {
              const vis = world.get(eid, Visual);
              if (!vis) throw new Error(`object ${cmd.entity} has no visual component`);
              vis.color = (cmd.payload as SetColorPayload).color;
              world.set(eid, Visual, vis);
              break;
            }
            case "visual.setVisible": {
              const vis = world.get(eid, Visual);
              if (!vis) throw new Error(`object ${cmd.entity} has no visual component`);
              vis.visible = (cmd.payload as SetVisiblePayload).visible;
              world.set(eid, Visual, vis);
              break;
            }
            case "visual.setTransparency": {
              const vis = world.get(eid, Visual);
              if (!vis) throw new Error(`object ${cmd.entity} has no visual component`);
              vis.transparency = (cmd.payload as SetTransparencyPayload).transparency;
              world.set(eid, Visual, vis);
              break;
            }
            
            // Animation commands
            case "animation.setAutoRotateY": {
              let auto = world.get(eid, AutoBehavior);
              if (!auto) auto = {};
              auto.autoRotateY = (cmd.payload as SetAutoRotateYPayload).speed;
              world.set(eid, AutoBehavior, auto);
              break;
            }
            case "animation.setAutoBob": {
              let auto = world.get(eid, AutoBehavior);
              if (!auto) auto = {};
              const payload = cmd.payload as SetAutoBobPayload;
              if (payload) {
                auto.autoBob = {
                  amplitude: payload.amplitude ?? 0.5,
                  speed: payload.speed ?? 1,
                };
              } else {
                auto.autoBob = undefined;
              }
              world.set(eid, AutoBehavior, auto);
              break;
            }
            case "animation.setAutoSpin": {
              let auto = world.get(eid, AutoBehavior);
              if (!auto) auto = {};
              const payload = cmd.payload as SetAutoSpinPayload;
              if (payload) {
                auto.autoSpin = { ...payload };
              } else {
                auto.autoSpin = undefined;
              }
              world.set(eid, AutoBehavior, auto);
              break;
            }
            
            // Tween (simplified - real implementation would use a tween system)
            case "animation.tween": {
              // For now, just log that we received it
              // Full tween support requires a dedicated TweenSystem
              trace.log(`tween command received for entity ${cmd.entity}`);
              break;
            }
            
            default:
              // Unknown kinds are ignored to keep forward-compat; trace it.
              trace.log(`ignored unknown command "${cmd.kind}"`);
          }
        });
      } catch (err) {
        throw translateError(err, cmd.origin);
      }
    }
  },
});
