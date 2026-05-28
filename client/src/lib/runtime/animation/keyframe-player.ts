/**
 * Roblox-style animation system for Rebur Engine.
 *
 * Every RuntimeObject exposes an `animator` property (lazy-created).
 * Scripts call `obj.animator.load(def)` to get an AnimationTrack, then
 * call `track.play()`, `track.stop()`, listen to events, etc.
 *
 * Example:
 *   const track = workspace.Platform.animator.load({
 *     name: "hover",
 *     duration: 2,
 *     loop: true,
 *     keyframes: [
 *       { time: 0, position: { x: 0, y: 0, z: 0 } },
 *       { time: 1, position: { x: 0, y: 3, z: 0 } },
 *       { time: 2, position: { x: 0, y: 0, z: 0 } },
 *     ],
 *   });
 *   track.play();
 *   track.on("stopped", () => log("done"));
 */

import type { RuntimeObject } from "../types";

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single point in time within an animation definition. */
export interface KeyframeData {
  /** Time offset in seconds from the start of the animation. */
  time: number;
  /** Optional name — fires the "keyframeReached" event when passed. */
  name?: string;
  /** Absolute position to apply. Omit any axis you don't want to animate. */
  position?: { x?: number; y?: number; z?: number };
  /** Absolute rotation in degrees. Omit any axis you don't want to animate. */
  rotation?: { x?: number; y?: number; z?: number };
  /** Absolute scale. Omit any axis you don't want to animate. */
  scale?: { x?: number; y?: number; z?: number };
}

/** Defines an animation sequence. Pass to `animator.load()`. */
export interface AnimationDefinition {
  /** Display name — also used by `animator.get(name)`. */
  name?: string;
  /** Total length in seconds. */
  duration: number;
  /** Whether the animation loops when it reaches the end. Default false. */
  loop?: boolean;
  /** Ordered or unordered list of keyframes (sorted internally by time). */
  keyframes: KeyframeData[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function lerpNum(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}

/** Linearly interpolate two keyframes at time t. */
function sampleAt(keyframes: KeyframeData[], t: number): KeyframeData {
  if (keyframes.length === 0) return { time: 0 };

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0];
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (lo.time <= t && hi.time >= t) {
      const span = hi.time - lo.time;
      const alpha = span > 0 ? (t - lo.time) / span : 0;
      const lp = (a?: number, b?: number) => lerpNum(a, b, alpha);

      return {
        time: t,
        position:
          lo.position || hi.position
            ? {
                x: lp(lo.position?.x, hi.position?.x),
                y: lp(lo.position?.y, hi.position?.y),
                z: lp(lo.position?.z, hi.position?.z),
              }
            : undefined,
        rotation:
          lo.rotation || hi.rotation
            ? {
                x: lp(lo.rotation?.x, hi.rotation?.x),
                y: lp(lo.rotation?.y, hi.rotation?.y),
                z: lp(lo.rotation?.z, hi.rotation?.z),
              }
            : undefined,
        scale:
          lo.scale || hi.scale
            ? {
                x: lp(lo.scale?.x, hi.scale?.x),
                y: lp(lo.scale?.y, hi.scale?.y),
                z: lp(lo.scale?.z, hi.scale?.z),
              }
            : undefined,
      };
    }
  }

  return sorted[sorted.length - 1];
}

// ─── AnimationTrack ───────────────────────────────────────────────────────────

/**
 * A loaded animation bound to a specific object.
 * Returned by `animator.load()`. Similar to Roblox's AnimationTrack.
 */
export class AnimationTrack {
  readonly name: string;

  private readonly _def: AnimationDefinition;
  private readonly _obj: RuntimeObject;

  private _playing = false;
  private _paused = false;
  private _time = 0;
  private _speed = 1;
  private _weight = 1;

  private _stoppedCbs: (() => void)[] = [];
  private _keyframeCbs: ((name: string) => void)[] = [];
  private _firedKeyframes = new Set<string>();

  constructor(def: AnimationDefinition, obj: RuntimeObject) {
    this.name = def.name ?? "animation";
    this._def = { ...def, loop: def.loop ?? false };
    this._obj = obj;
  }

  // ── Playback controls ──────────────────────────────────────────────────────

  /**
   * Start playing the animation from the beginning.
   * @param fadeTime  Unused for now (reserved for future cross-fading).
   */
  play(_fadeTime = 0): this {
    this._playing = true;
    this._paused = false;
    this._time = 0;
    this._firedKeyframes.clear();
    return this;
  }

  /**
   * Stop the animation and reset to time 0.  Fires the "stopped" event.
   * @param fadeTime  Unused for now (reserved for future cross-fading).
   */
  stop(_fadeTime = 0): this {
    const wasPlaying = this._playing;
    this._playing = false;
    this._paused = false;
    this._time = 0;
    if (wasPlaying) {
      const cbs = [...this._stoppedCbs];
      cbs.forEach(cb => { try { cb(); } catch { /* script error */ } });
    }
    return this;
  }

  /** Pause playback without resetting time. */
  pause(): this {
    this._paused = true;
    return this;
  }

  /** Resume from where the animation was paused. */
  resume(): this {
    this._paused = false;
    return this;
  }

  /**
   * Change playback speed.  1 = normal, 2 = double speed, 0.5 = half speed.
   */
  adjustSpeed(speed: number): this {
    this._speed = Math.max(0, speed);
    return this;
  }

  /**
   * Change blend weight (0–1).  1 = full animation, 0 = no effect.
   * Values between 0 and 1 blend between the keyframe value and the
   * object's current transform.
   */
  adjustWeight(weight: number): this {
    this._weight = Math.max(0, Math.min(1, weight));
    return this;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /**
   * Listen to animation events.
   *
   * "stopped"        — fires when the animation ends (non-looping) or is stopped.
   * "keyframeReached" — fires when a named keyframe is passed; receives the name.
   *
   * Returns an unsubscribe function.
   *
   * @example
   *   track.on("stopped", () => log("animation done"));
   *   track.on("keyframeReached", (name) => log("reached", name));
   */
  on(event: "stopped" | "keyframeReached", fn: any): () => void {
    if (event === "stopped") {
      this._stoppedCbs.push(fn);
      return () => { this._stoppedCbs = this._stoppedCbs.filter(f => f !== fn); };
    }
    if (event === "keyframeReached") {
      this._keyframeCbs.push(fn);
      return () => { this._keyframeCbs = this._keyframeCbs.filter(f => f !== fn); };
    }
    return () => {};
  }

  // ── Read-only state ────────────────────────────────────────────────────────

  /** True if the animation is actively playing (not paused). */
  get isPlaying(): boolean { return this._playing && !this._paused; }
  /** True if the animation was paused mid-way. */
  get isPaused(): boolean { return this._paused; }
  /** Total duration in seconds. */
  get length(): number { return this._def.duration; }
  /** Current playback time in seconds. Can be set to seek. */
  get timePosition(): number { return this._time; }
  set timePosition(t: number) {
    this._time = Math.max(0, Math.min(this._def.duration, t));
  }

  // ── Internal step (called by Animator each frame) ─────────────────────────

  /** @internal */
  _step(dt: number): void {
    if (!this._playing || this._paused) return;

    this._time += dt * this._speed;
    const loop = this._def.loop ?? false;

    if (this._time >= this._def.duration) {
      if (loop) {
        this._time = this._time % this._def.duration;
        this._firedKeyframes.clear();
      } else {
        this._time = this._def.duration;
        this._applyAt(this._time);
        this._playing = false;
        const cbs = [...this._stoppedCbs];
        cbs.forEach(cb => { try { cb(); } catch { /* script error */ } });
        return;
      }
    }

    this._applyAt(this._time);
    this._checkKeyframes();
  }

  private _applyAt(t: number): void {
    const s = sampleAt(this._def.keyframes, t);
    const obj = this._obj;
    const w = this._weight;

    if (s.position) {
      if (s.position.x !== undefined)
        obj.position.x = w === 1 ? s.position.x : obj.position.x + (s.position.x - obj.position.x) * w;
      if (s.position.y !== undefined)
        obj.position.y = w === 1 ? s.position.y : obj.position.y + (s.position.y - obj.position.y) * w;
      if (s.position.z !== undefined)
        obj.position.z = w === 1 ? s.position.z : obj.position.z + (s.position.z - obj.position.z) * w;
    }

    if (s.rotation) {
      if (s.rotation.x !== undefined)
        obj.rotation.x = w === 1 ? s.rotation.x : obj.rotation.x + (s.rotation.x - obj.rotation.x) * w;
      if (s.rotation.y !== undefined)
        obj.rotation.y = w === 1 ? s.rotation.y : obj.rotation.y + (s.rotation.y - obj.rotation.y) * w;
      if (s.rotation.z !== undefined)
        obj.rotation.z = w === 1 ? s.rotation.z : obj.rotation.z + (s.rotation.z - obj.rotation.z) * w;
    }

    if (s.scale) {
      if (s.scale.x !== undefined)
        obj.scale.x = w === 1 ? s.scale.x : obj.scale.x + (s.scale.x - obj.scale.x) * w;
      if (s.scale.y !== undefined)
        obj.scale.y = w === 1 ? s.scale.y : obj.scale.y + (s.scale.y - obj.scale.y) * w;
      if (s.scale.z !== undefined)
        obj.scale.z = w === 1 ? s.scale.z : obj.scale.z + (s.scale.z - obj.scale.z) * w;
    }
  }

  private _checkKeyframes(): void {
    for (const kf of this._def.keyframes) {
      if (kf.name && !this._firedKeyframes.has(kf.name) && this._time >= kf.time) {
        this._firedKeyframes.add(kf.name);
        const name = kf.name;
        const cbs = [...this._keyframeCbs];
        cbs.forEach(cb => { try { cb(name); } catch { /* script error */ } });
      }
    }
  }
}

// ─── Animator ─────────────────────────────────────────────────────────────────

/**
 * Manages all AnimationTracks for a single object.
 * Accessed via `obj.animator` — auto-created on first access.
 * Similar to Roblox's Animator service on a character.
 */
export class Animator {
  private readonly _obj: RuntimeObject;
  private readonly _tracks: AnimationTrack[] = [];

  constructor(obj: RuntimeObject) {
    this._obj = obj;
  }

  /**
   * Create a new AnimationTrack from a definition.
   * Returns the track so you can chain `.play()` immediately.
   *
   * @example
   *   const track = workspace.Door.animator.load({
   *     name: "open",
   *     duration: 0.5,
   *     keyframes: [
   *       { time: 0,   rotation: { y: 0   } },
   *       { time: 0.5, rotation: { y: 90  } },
   *     ],
   *   });
   *   track.play();
   */
  load(def: AnimationDefinition): AnimationTrack {
    const track = new AnimationTrack(def, this._obj);
    this._tracks.push(track);
    return track;
  }

  /** Stop every currently-playing track on this object. */
  stopAll(): void {
    for (const track of this._tracks) {
      if (track.isPlaying) track.stop();
    }
  }

  /**
   * Get a previously-loaded track by its name.
   * Returns null if not found.
   */
  get(name: string): AnimationTrack | null {
    return this._tracks.find(t => t.name === name) ?? null;
  }

  /** All tracks that have been loaded (playing or stopped). */
  get tracks(): AnimationTrack[] {
    return [...this._tracks];
  }

  /** @internal Called each frame by the game loop. */
  _step(dt: number): void {
    for (const track of this._tracks) {
      if (track.isPlaying) track._step(dt);
    }
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/** WeakMap so animators are automatically GC'd with their objects. */
const _animators = new WeakMap<object, Animator>();

/**
 * Get (or lazily create) the Animator for a RuntimeObject.
 * This is what `obj.animator` resolves to in user scripts.
 */
export function getAnimator(obj: RuntimeObject): Animator {
  let a = _animators.get(obj);
  if (!a) {
    a = new Animator(obj);
    _animators.set(obj, a);
  }
  return a;
}

/**
 * Step all active animators for the given object list.
 * Called once per game-loop tick from GameRuntime.
 */
export function stepAllAnimators(objectList: RuntimeObject[], dt: number): void {
  for (const obj of objectList) {
    if (_animators.has(obj)) {
      _animators.get(obj)!._step(dt);
    }
  }
}

// ─── AnimationEditor types ─────────────────────────────────────────────────────

/** Flat keyframe used by AnimationEditor (uses px/py/pz instead of position.x/y/z). */
export interface Keyframe {
  id: string;
  time: number;
  px?: number; py?: number; pz?: number;
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
}

/** Animation definition used by AnimationEditor. */
export interface AnimationDef {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  keyframes: Keyframe[];
}

/** Joint / constraint definition used by AnimationEditor rig view. */
export interface JointDef {
  id: string;
  type: "fixed" | "hinge" | "ball" | "slider";
  objectId: string;
  parentId?: string;
  anchor?: { x: number; y: number; z: number };
  axis?: { x: number; y: number; z: number };
  limits?: { min: number; max: number };
}
