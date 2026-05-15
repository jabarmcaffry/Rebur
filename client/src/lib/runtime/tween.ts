// tween.ts — Lightweight property tweening system

export type Easing =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic";

const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

interface ActiveTween {
  target: Record<string, any>;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  elapsed: number;
  ease: (t: number) => number;
  onDone?: () => void;
  cancelled: boolean;
}

export class TweenManager {
  private active: ActiveTween[] = [];

  clear() { this.active.length = 0; }

  start(
    target: Record<string, any>,
    to: Record<string, any>,
    duration: number,
    easing: Easing = "linear",
    onDone?: () => void
  ): () => void {
    const numericTo: Record<string, number> = {};
    const from: Record<string, number> = {};
    for (const k of Object.keys(to)) {
      const tv = to[k];
      const cv = target?.[k];
      if (typeof tv === "number" && typeof cv === "number") {
        numericTo[k] = tv;
        from[k] = cv;
      }
    }
    if (Object.keys(numericTo).length === 0 || duration <= 0) {
      for (const k of Object.keys(numericTo)) target[k] = numericTo[k];
      try { onDone?.(); } catch { /* swallow */ }
      return () => {};
    }
    // Drop any existing tween that targets the same object+key set.
    for (const t of this.active) {
      if (t.target === target) {
        for (const k of Object.keys(numericTo)) {
          if (k in t.to) delete t.to[k];
        }
      }
    }
    const tween: ActiveTween = { target, from, to: numericTo, duration, elapsed: 0, ease: EASE[easing] ?? EASE.linear, onDone, cancelled: false };
    this.active.push(tween);
    return () => { tween.cancelled = true; };
  }

  step(dt: number) {
    if (this.active.length === 0) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      if (t.cancelled) { this.active.splice(i, 1); continue; }
      t.elapsed += dt;
      const raw = Math.min(1, t.elapsed / t.duration);
      const k = t.ease(raw);
      for (const key of Object.keys(t.to)) {
        const a = t.from[key];
        const b = t.to[key];
        try { t.target[key] = a + (b - a) * k; } catch { /* read-only */ }
      }
      if (raw >= 1) {
        this.active.splice(i, 1);
        try { t.onDone?.(); } catch { /* swallow */ }
      }
    }
  }
}
