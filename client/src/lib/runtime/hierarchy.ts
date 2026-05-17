// hierarchy.ts — Parent/child indexing + cascade ops
import type { RuntimeObject } from "./types";

export class HierarchyIndex {
  private childrenByParent = new Map<string | null, Set<string>>();

  add(obj: RuntimeObject) {
    const set = this.childrenByParent.get(obj.parentId) ?? new Set<string>();
    set.add(obj.id);
    this.childrenByParent.set(obj.parentId, set);
  }

  remove(obj: RuntimeObject) {
    this.childrenByParent.get(obj.parentId)?.delete(obj.id);
    this.childrenByParent.delete(obj.id);
  }

  reparent(obj: RuntimeObject, newParentId: string | null) {
    this.childrenByParent.get(obj.parentId)?.delete(obj.id);
    obj.parentId = newParentId;
    const set = this.childrenByParent.get(newParentId) ?? new Set<string>();
    set.add(obj.id);
    this.childrenByParent.set(newParentId, set);
  }

  childIds(parentId: string | null): string[] {
    const set = this.childrenByParent.get(parentId);
    return set ? Array.from(set) : [];
  }

  descendantIds(rootId: string): string[] {
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      const kids = this.childIds(id);
      for (const k of kids) {
        out.push(k);
        stack.push(k);
      }
    }
    return out;
  }

  clear() {
    this.childrenByParent.clear();
  }
}
