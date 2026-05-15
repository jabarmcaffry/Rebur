/**
 * ECS World — entity store + component tables.
 *
 * Internal only. Creators never see this; the OOP façade hides it and the
 * trace mapper rewrites errors back into OOP vocabulary.
 */

export type EntityId = number & { readonly __brand: "EntityId" };

export interface ComponentDef<T> {
  readonly id: string;
  readonly _t?: T; // phantom
}

export function defineComponent<T>(id: string): ComponentDef<T> {
  return { id };
}

export class World {
  private nextId = 1;
  /** componentId -> entityId -> data */
  private tables = new Map<string, Map<number, unknown>>();
  /** entityId -> set of componentIds it has */
  private entities = new Map<number, Set<string>>();
  /** monotonic version, bumped on every write — drives change detection */
  version = 0;

  create(): EntityId {
    const id = this.nextId++ as EntityId;
    this.entities.set(id, new Set());
    return id;
  }

  destroy(id: EntityId): void {
    const comps = this.entities.get(id);
    if (!comps) return;
    for (const cid of comps) this.tables.get(cid)?.delete(id);
    this.entities.delete(id);
    this.version++;
  }

  has<T>(id: EntityId, c: ComponentDef<T>): boolean {
    return this.tables.get(c.id)?.has(id) ?? false;
  }

  get<T>(id: EntityId, c: ComponentDef<T>): T | undefined {
    return this.tables.get(c.id)?.get(id) as T | undefined;
  }

  set<T>(id: EntityId, c: ComponentDef<T>, value: T): void {
    let table = this.tables.get(c.id);
    if (!table) {
      table = new Map();
      this.tables.set(c.id, table);
    }
    table.set(id, value);
    this.entities.get(id)?.add(c.id);
    this.version++;
  }

  remove<T>(id: EntityId, c: ComponentDef<T>): void {
    if (this.tables.get(c.id)?.delete(id)) {
      this.entities.get(id)?.delete(c.id);
      this.version++;
    }
  }

  /** Iterate every entity that has all listed components. */
  *query<A>(a: ComponentDef<A>): IterableIterator<[EntityId, A]>;
  *query<A, B>(a: ComponentDef<A>, b: ComponentDef<B>): IterableIterator<[EntityId, A, B]>;
  *query(...defs: ComponentDef<unknown>[]): IterableIterator<unknown[]> {
    const tables = defs.map((d) => this.tables.get(d.id));
    if (tables.some((t) => !t)) return;
    // Iterate the smallest table for cache efficiency.
    let smallestIdx = 0;
    for (let i = 1; i < tables.length; i++) {
      if ((tables[i]!.size) < (tables[smallestIdx]!.size)) smallestIdx = i;
    }
    const base = tables[smallestIdx]!;
    outer: for (const [eid, val] of base) {
      const row: unknown[] = [eid as EntityId];
      for (let i = 0; i < tables.length; i++) {
        if (i === smallestIdx) {
          row[i + 1] = val;
        } else {
          const v = tables[i]!.get(eid);
          if (v === undefined) continue outer;
          row[i + 1] = v;
        }
      }
      yield row;
    }
  }
}
