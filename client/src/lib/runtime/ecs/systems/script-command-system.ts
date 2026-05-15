/**
 * ScriptCommandSystem — drains commands emitted by the OOP façade and applies
 * them to ECS components. This is the ONLY place script-issued mutations
 * become real on the server. Validators on the CommandBus already enforced
 * authority; here we just apply.
 */
import { defineSystem } from "../system";
import { CommandGroups } from "../../commands/router";
import { Transform } from "../components";
import { translateError } from "../../trace/error-translator";

interface SetPositionPayload { position: { x: number; y: number; z: number } }
interface SetRotationPayload { rotation: { x: number; y: number; z: number } }

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
            // future: spawn / destroy / setProp / tween …
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
