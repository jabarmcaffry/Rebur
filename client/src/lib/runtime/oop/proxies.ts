/**
 * OOP façade proxies. These wrap an entity id and translate
 * `obj.position = { x, y, z }` style writes into Command Events that the
 * server-authoritative pipeline drains next tick.
 *
 * The shape MUST match the existing GameAPI's RuntimeObject surface so
 * creator scripts keep working unchanged.
 */
import type { CommandBus } from "../commands/bus";
import { defineCommand } from "../commands/command";
import type { CommandOrigin } from "../commands/command";
import type { Vec3 } from "../types";
import { CommandGroups } from "../commands/router";

export const SetPositionCmd = defineCommand<"transform.setPosition", { position: Vec3 }>(
  "transform.setPosition",
  CommandGroups.Script,
);
export const SetRotationCmd = defineCommand<"transform.setRotation", { rotation: Vec3 }>(
  "transform.setRotation",
  CommandGroups.Script,
);

export interface ObjectProxyDeps {
  bus: CommandBus;
  /** Reads the latest committed state for this entity. */
  read: (entity: number) => { position: Vec3; rotation: Vec3 } | undefined;
  /** Optional issuer (player id) — server uses this for authority + rate caps. */
  issuedBy?: string;
  /** Origin captured at proxy construction (script, line, apiPath base). */
  origin?: CommandOrigin;
}

/**
 * Builds a creator-facing object proxy whose writes become commands.
 * Pending writes within the same tick are reflected via a per-tick overlay
 * so that script `read-after-write` keeps working.
 */
export function createObjectProxy(entity: number, deps: ObjectProxyDeps) {
  const overlay: { position?: Vec3; rotation?: Vec3 } = {};
  const readPos = (): Vec3 => overlay.position ?? deps.read(entity)?.position ?? { x: 0, y: 0, z: 0 };
  const readRot = (): Vec3 => overlay.rotation ?? deps.read(entity)?.rotation ?? { x: 0, y: 0, z: 0 };

  const positionProxy = new Proxy({} as Vec3, {
    get(_t, k) {
      return readPos()[k as keyof Vec3];
    },
    set(_t, k, v) {
      const next = { ...readPos(), [k as keyof Vec3]: Number(v) };
      overlay.position = next;
      deps.bus.enqueue(
        SetPositionCmd.create(
          { position: next },
          {
            entity,
            issuedBy: deps.issuedBy,
            origin: { ...deps.origin, apiPath: "Object.position" },
          },
        ),
      );
      return true;
    },
  });

  const rotationProxy = new Proxy({} as Vec3, {
    get(_t, k) {
      return readRot()[k as keyof Vec3];
    },
    set(_t, k, v) {
      const next = { ...readRot(), [k as keyof Vec3]: Number(v) };
      overlay.rotation = next;
      deps.bus.enqueue(
        SetRotationCmd.create(
          { rotation: next },
          {
            entity,
            issuedBy: deps.issuedBy,
            origin: { ...deps.origin, apiPath: "Object.rotation" },
          },
        ),
      );
      return true;
    },
  });

  return {
    get position() {
      return positionProxy;
    },
    set position(v: Vec3) {
      overlay.position = { ...v };
      deps.bus.enqueue(
        SetPositionCmd.create(
          { position: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.position" } },
        ),
      );
    },
    get rotation() {
      return rotationProxy;
    },
    set rotation(v: Vec3) {
      overlay.rotation = { ...v };
      deps.bus.enqueue(
        SetRotationCmd.create(
          { rotation: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.rotation" } },
        ),
      );
    },
    /** Internal — clear per-tick overlay after server commit. */
    _clearOverlay() {
      overlay.position = undefined;
      overlay.rotation = undefined;
    },
  };
}
