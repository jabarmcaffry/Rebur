/**
 * Command Events — the lightweight intent layer between the OOP API and ECS.
 *
 * Creators never construct these directly. Their OOP calls (obj.position.x = 5,
 * player:moveTo, etc.) are translated by `oop/proxies.ts` into commands that
 * the server validates, routes, and applies inside ECS systems.
 */

export interface CommandOrigin {
  /** Script name as seen by the creator. */
  script?: string;
  /** 1-based line in the creator's script (after compile.ts source-map). */
  line?: number;
  /** OOP-style call chain, e.g. "Object.position.set" — used by the trace map. */
  apiPath?: string;
}

export interface Command<TKind extends string = string, TPayload = unknown> {
  /** Unique id, monotonic per process. */
  id: number;
  kind: TKind;
  /** Target entity (ECS), if any. */
  entity?: number;
  /** Player who issued the command — undefined means server-internal. */
  issuedBy?: string;
  payload: TPayload;
  origin: CommandOrigin;
  /** "group" decides which router bucket drains it. Defaults to kind's prefix. */
  group?: string;
}

export interface CommandDef<TKind extends string, TPayload> {
  readonly kind: TKind;
  readonly group: string;
  create(
    payload: TPayload,
    opts?: { entity?: number; issuedBy?: string; origin?: CommandOrigin },
  ): Command<TKind, TPayload>;
}

let _nextId = 1;
export function defineCommand<TKind extends string, TPayload>(
  kind: TKind,
  group: string,
): CommandDef<TKind, TPayload> {
  return {
    kind,
    group,
    create(payload, opts) {
      return {
        id: _nextId++,
        kind,
        entity: opts?.entity,
        issuedBy: opts?.issuedBy,
        payload,
        origin: opts?.origin ?? {},
        group,
      };
    },
  };
}
