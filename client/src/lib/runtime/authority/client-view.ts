/**
 * ClientView — read-only mirror of authoritative server snapshots.
 *
 * Keeps the last two received snapshots (prev + next) so the renderer can
 * interpolate between them in real time. This matters as soon as snapshots
 * arrive at a lower rate than the display refresh (e.g. 20 Hz server tick
 * vs 60+ Hz render). On a real network this also gives us the standard
 * "render in the past" buffer that smooths over jitter.
 *
 * Renderers should call `sample(eid, component, alpha)` for spatial data
 * (Transform/Velocity) and `read(eid, component)` for booleans/strings.
 */
import type { ServerSnapshot } from "./server-sim";

interface SnapRef {
  tick: number;
  /** Wall-clock when this snapshot was received. */
  receivedAt: number;
  data: ServerSnapshot;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Shortest-arc lerp for an Euler-angle channel (radians, wraps at 2π).
function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let diff = ((b - a) % TAU + TAU * 1.5) % TAU - Math.PI;
  return a + diff * t;
}

export class ClientView {
  private prev: SnapRef | null = null;
  private next: SnapRef | null = null;

  /** Push a new authoritative snapshot. The previous "next" becomes "prev". */
  apply(snap: ServerSnapshot): void {
    const now = performance.now();
    if (!this.next || snap.tick > this.next.tick) {
      this.prev = this.next;
      this.next = { tick: snap.tick, receivedAt: now, data: snap };
    }
  }

  /** Latest received snapshot (no interpolation). */
  current(): ServerSnapshot {
    return this.next?.data ?? { tick: 0, entities: {} };
  }

  /** Read a component verbatim from the latest snapshot. */
  read<T = unknown>(entity: number, component: string): T | undefined {
    return this.next?.data.entities[entity]?.[component] as T | undefined;
  }

  /**
   * Interpolate a Vec3-shaped component (`{x,y,z}`) between prev and next.
   * `alpha` defaults to the wall-clock fraction between the two snapshots,
   * but callers can override it (e.g. when running a render-time clock).
   */
  sampleVec3(
    entity: number,
    component: string,
    alpha?: number,
  ): { x: number; y: number; z: number } | undefined {
    const n = this.next?.data.entities[entity]?.[component] as
      | { x: number; y: number; z: number }
      | undefined;
    if (!n) return undefined;
    const p = this.prev?.data.entities[entity]?.[component] as
      | { x: number; y: number; z: number }
      | undefined;
    if (!p) return n;
    const t = alpha ?? this.defaultAlpha();
    return {
      x: lerp(p.x, n.x, t),
      y: lerp(p.y, n.y, t),
      z: lerp(p.z, n.z, t),
    };
  }

  /** Like sampleVec3 but uses shortest-arc lerp on each axis (rotations). */
  sampleEuler(
    entity: number,
    component: string,
    alpha?: number,
  ): { x: number; y: number; z: number } | undefined {
    const n = this.next?.data.entities[entity]?.[component] as
      | { x: number; y: number; z: number }
      | undefined;
    if (!n) return undefined;
    const p = this.prev?.data.entities[entity]?.[component] as
      | { x: number; y: number; z: number }
      | undefined;
    if (!p) return n;
    const t = alpha ?? this.defaultAlpha();
    return {
      x: lerpAngle(p.x, n.x, t),
      y: lerpAngle(p.y, n.y, t),
      z: lerpAngle(p.z, n.z, t),
    };
  }

  /** Wall-clock fraction between prev and next, clamped to [0,1]. */
  private defaultAlpha(): number {
    if (!this.prev || !this.next) return 1;
    const span = this.next.receivedAt - this.prev.receivedAt;
    if (span <= 0) return 1;
    const t = (performance.now() - this.next.receivedAt) / span;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
}
