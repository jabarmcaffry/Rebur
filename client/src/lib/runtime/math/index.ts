/**
 * Math Library - Vector3, Quaternion, CFrame
 * 
 * Provides advanced math primitives for 3D transformations while maintaining
 * backward compatibility with plain {x, y, z} objects.
 */

// ============================================================================
// Types
// ============================================================================

/** Plain object representation - always accepted as input */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ============================================================================
// Vector3
// ============================================================================

export class Vector3 implements Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // ---------- Static constructors ----------
  static readonly zero = new Vector3(0, 0, 0);
  static readonly one = new Vector3(1, 1, 1);
  static readonly up = new Vector3(0, 1, 0);
  static readonly down = new Vector3(0, -1, 0);
  static readonly forward = new Vector3(0, 0, 1);
  static readonly back = new Vector3(0, 0, -1);
  static readonly right = new Vector3(1, 0, 0);
  static readonly left = new Vector3(-1, 0, 0);

  /** Create from plain object or another Vector3 */
  static from(v: Vec3Like): Vector3 {
    if (v instanceof Vector3) return v;
    return new Vector3(v.x, v.y, v.z);
  }

  /** Create from array [x, y, z] */
  static fromArray(arr: [number, number, number]): Vector3 {
    return new Vector3(arr[0], arr[1], arr[2]);
  }

  /** Linear interpolation between two vectors */
  static lerp(a: Vec3Like, b: Vec3Like, t: number): Vector3 {
    return new Vector3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  }

  // ---------- Instance methods (immutable - return new Vector3) ----------
  
  add(v: Vec3Like): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vec3Like): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  mul(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  div(scalar: number): Vector3 {
    return new Vector3(this.x / scalar, this.y / scalar, this.z / scalar);
  }

  /** Component-wise multiplication */
  scale(v: Vec3Like): Vector3 {
    return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  dot(v: Vec3Like): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vec3Like): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  get magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  get sqrMagnitude(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  get unit(): Vector3 {
    const mag = this.magnitude;
    if (mag === 0) return Vector3.zero;
    return this.div(mag);
  }

  /** Alias for unit */
  get normalized(): Vector3 {
    return this.unit;
  }

  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  abs(): Vector3 {
    return new Vector3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
  }

  floor(): Vector3 {
    return new Vector3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
  }

  ceil(): Vector3 {
    return new Vector3(Math.ceil(this.x), Math.ceil(this.y), Math.ceil(this.z));
  }

  round(): Vector3 {
    return new Vector3(Math.round(this.x), Math.round(this.y), Math.round(this.z));
  }

  clamp(min: Vec3Like, max: Vec3Like): Vector3 {
    return new Vector3(
      Math.max(min.x, Math.min(max.x, this.x)),
      Math.max(min.y, Math.min(max.y, this.y)),
      Math.max(min.z, Math.min(max.z, this.z))
    );
  }

  distanceTo(v: Vec3Like): number {
    return this.sub(v).magnitude;
  }

  angleTo(v: Vec3Like): number {
    const denominator = Math.sqrt(this.sqrMagnitude * Vector3.from(v).sqrMagnitude);
    if (denominator === 0) return 0;
    const dot = Math.max(-1, Math.min(1, this.dot(v) / denominator));
    return Math.acos(dot);
  }

  /** Reflect vector off a surface with given normal */
  reflect(normal: Vec3Like): Vector3 {
    const n = Vector3.from(normal);
    return this.sub(n.mul(2 * this.dot(n)));
  }

  /** Project this vector onto another */
  projectOnto(v: Vec3Like): Vector3 {
    const target = Vector3.from(v);
    const sqrMag = target.sqrMagnitude;
    if (sqrMag === 0) return Vector3.zero;
    return target.mul(this.dot(target) / sqrMag);
  }

  equals(v: Vec3Like, epsilon = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toObject(): Vec3Like {
    return { x: this.x, y: this.y, z: this.z };
  }

  toString(): string {
    return `Vector3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
}

// ============================================================================
// Quaternion
// ============================================================================

export class Quaternion implements QuatLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  // ---------- Static constructors ----------
  static readonly identity = new Quaternion(0, 0, 0, 1);

  /** Create from plain object */
  static from(q: QuatLike): Quaternion {
    if (q instanceof Quaternion) return q;
    return new Quaternion(q.x, q.y, q.z, q.w);
  }

  /** Create from Euler angles (radians) in XYZ order */
  static fromEuler(x: number, y: number, z: number): Quaternion {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);

    return new Quaternion(
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3
    );
  }

  /** Create from Euler angles in degrees */
  static fromEulerDegrees(x: number, y: number, z: number): Quaternion {
    const toRad = Math.PI / 180;
    return Quaternion.fromEuler(x * toRad, y * toRad, z * toRad);
  }

  /** Create from axis-angle representation */
  static fromAxisAngle(axis: Vec3Like, angle: number): Quaternion {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    const v = Vector3.from(axis).unit;
    return new Quaternion(v.x * s, v.y * s, v.z * s, Math.cos(halfAngle));
  }

  /** Create rotation that looks in direction (with optional up vector) */
  static lookRotation(forward: Vec3Like, up: Vec3Like = Vector3.up): Quaternion {
    const f = Vector3.from(forward).unit;
    const r = Vector3.from(up).cross(f).unit;
    const u = f.cross(r);

    const m00 = r.x, m01 = r.y, m02 = r.z;
    const m10 = u.x, m11 = u.y, m12 = u.z;
    const m20 = f.x, m21 = f.y, m22 = f.z;

    const trace = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (m12 - m21) * s;
      y = (m20 - m02) * s;
      z = (m01 - m10) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m12 - m21) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m20 + m02) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m20 - m02) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m01 - m10) / s;
      x = (m20 + m02) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }

    return new Quaternion(x, y, z, w).normalized;
  }

  /** Spherical interpolation */
  static slerp(a: QuatLike, b: QuatLike, t: number): Quaternion {
    const qa = Quaternion.from(a);
    let qb = Quaternion.from(b);

    let dot = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;

    // If dot < 0, negate one to take shorter path
    if (dot < 0) {
      qb = new Quaternion(-qb.x, -qb.y, -qb.z, -qb.w);
      dot = -dot;
    }

    // If quaternions are very close, use linear interpolation
    if (dot > 0.9995) {
      return new Quaternion(
        qa.x + t * (qb.x - qa.x),
        qa.y + t * (qb.y - qa.y),
        qa.z + t * (qb.z - qa.z),
        qa.w + t * (qb.w - qa.w)
      ).normalized;
    }

    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);

    const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return new Quaternion(
      s0 * qa.x + s1 * qb.x,
      s0 * qa.y + s1 * qb.y,
      s0 * qa.z + s1 * qb.z,
      s0 * qa.w + s1 * qb.w
    );
  }

  /** Angle between two quaternions in radians */
  static angle(a: QuatLike, b: QuatLike): number {
    const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
    return 2 * Math.acos(Math.min(1, dot));
  }

  // ---------- Instance methods ----------

  get magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }

  get normalized(): Quaternion {
    const mag = this.magnitude;
    if (mag === 0) return Quaternion.identity;
    return new Quaternion(this.x / mag, this.y / mag, this.z / mag, this.w / mag);
  }

  get conjugate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, this.w);
  }

  get inverse(): Quaternion {
    const sqrMag = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    if (sqrMag === 0) return Quaternion.identity;
    return new Quaternion(-this.x / sqrMag, -this.y / sqrMag, -this.z / sqrMag, this.w / sqrMag);
  }

  /** Multiply quaternions (combine rotations) */
  mul(q: QuatLike): Quaternion {
    return new Quaternion(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z
    );
  }

  /** Rotate a vector by this quaternion */
  rotateVector(v: Vec3Like): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const result = this.mul(qv).mul(this.conjugate);
    return new Vector3(result.x, result.y, result.z);
  }

  /** Convert to Euler angles (radians) in XYZ order */
  toEuler(): Vector3 {
    const sinr_cosp = 2 * (this.w * this.x + this.y * this.z);
    const cosr_cosp = 1 - 2 * (this.x * this.x + this.y * this.y);
    const x = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (this.w * this.y - this.z * this.x);
    const y = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

    const siny_cosp = 2 * (this.w * this.z + this.x * this.y);
    const cosy_cosp = 1 - 2 * (this.y * this.y + this.z * this.z);
    const z = Math.atan2(siny_cosp, cosy_cosp);

    return new Vector3(x, y, z);
  }

  /** Convert to Euler angles in degrees */
  toEulerDegrees(): Vector3 {
    const euler = this.toEuler();
    const toDeg = 180 / Math.PI;
    return new Vector3(euler.x * toDeg, euler.y * toDeg, euler.z * toDeg);
  }

  /** Get axis-angle representation */
  toAxisAngle(): { axis: Vector3; angle: number } {
    const angle = 2 * Math.acos(this.w);
    const s = Math.sqrt(1 - this.w * this.w);
    if (s < 0.0001) {
      return { axis: Vector3.up, angle: 0 };
    }
    return { axis: new Vector3(this.x / s, this.y / s, this.z / s), angle };
  }

  /** Get the forward direction of this rotation */
  get forward(): Vector3 {
    return this.rotateVector(Vector3.forward);
  }

  /** Get the up direction of this rotation */
  get up(): Vector3 {
    return this.rotateVector(Vector3.up);
  }

  /** Get the right direction of this rotation */
  get right(): Vector3 {
    return this.rotateVector(Vector3.right);
  }

  equals(q: QuatLike, epsilon = 0.0001): boolean {
    return (
      Math.abs(this.x - q.x) < epsilon &&
      Math.abs(this.y - q.y) < epsilon &&
      Math.abs(this.z - q.z) < epsilon &&
      Math.abs(this.w - q.w) < epsilon
    );
  }

  toObject(): QuatLike {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }

  toString(): string {
    return `Quaternion(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)}, ${this.w.toFixed(3)})`;
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }
}

// ============================================================================
// CFrame (Coordinate Frame - combined position + rotation)
// ============================================================================

export class CFrame {
  readonly position: Vector3;
  readonly rotation: Quaternion;

  constructor(position: Vec3Like = Vector3.zero, rotation: QuatLike = Quaternion.identity) {
    this.position = Vector3.from(position);
    this.rotation = Quaternion.from(rotation);
  }

  // ---------- Static constructors ----------
  static readonly identity = new CFrame(Vector3.zero, Quaternion.identity);

  /** Create from position only */
  static fromPosition(x: number, y: number, z: number): CFrame {
    return new CFrame(new Vector3(x, y, z), Quaternion.identity);
  }

  /** Create from position and Euler angles (radians) */
  static fromEuler(pos: Vec3Like, rx: number, ry: number, rz: number): CFrame {
    return new CFrame(pos, Quaternion.fromEuler(rx, ry, rz));
  }

  /** Create from position and Euler angles (degrees) */
  static fromEulerDegrees(pos: Vec3Like, rx: number, ry: number, rz: number): CFrame {
    return new CFrame(pos, Quaternion.fromEulerDegrees(rx, ry, rz));
  }

  /** Create CFrame that looks from position toward target */
  static lookAt(position: Vec3Like, target: Vec3Like, up: Vec3Like = Vector3.up): CFrame {
    const pos = Vector3.from(position);
    const dir = Vector3.from(target).sub(pos).unit;
    if (dir.sqrMagnitude === 0) {
      return new CFrame(pos, Quaternion.identity);
    }
    return new CFrame(pos, Quaternion.lookRotation(dir, up));
  }

  /** Linear interpolation between two CFrames */
  static lerp(a: CFrame, b: CFrame, t: number): CFrame {
    return new CFrame(
      Vector3.lerp(a.position, b.position, t),
      Quaternion.slerp(a.rotation, b.rotation, t)
    );
  }

  // ---------- Instance methods ----------

  /** Multiply CFrames (compose transformations) */
  mul(cf: CFrame): CFrame {
    return new CFrame(
      this.position.add(this.rotation.rotateVector(cf.position)),
      this.rotation.mul(cf.rotation)
    );
  }

  /** Get inverse CFrame */
  get inverse(): CFrame {
    const invRot = this.rotation.inverse;
    return new CFrame(invRot.rotateVector(this.position.negate()), invRot);
  }

  /** Transform a point from local to world space */
  pointToWorldSpace(point: Vec3Like): Vector3 {
    return this.position.add(this.rotation.rotateVector(point));
  }

  /** Transform a point from world to local space */
  pointToObjectSpace(point: Vec3Like): Vector3 {
    return this.rotation.inverse.rotateVector(Vector3.from(point).sub(this.position));
  }

  /** Transform a direction from local to world space */
  vectorToWorldSpace(vector: Vec3Like): Vector3 {
    return this.rotation.rotateVector(vector);
  }

  /** Transform a direction from world to local space */
  vectorToObjectSpace(vector: Vec3Like): Vector3 {
    return this.rotation.inverse.rotateVector(vector);
  }

  /** Get the forward direction (look vector) */
  get lookVector(): Vector3 {
    return this.rotation.forward;
  }

  /** Get the up direction */
  get upVector(): Vector3 {
    return this.rotation.up;
  }

  /** Get the right direction */
  get rightVector(): Vector3 {
    return this.rotation.right;
  }

  /** Get position components */
  get x(): number { return this.position.x; }
  get y(): number { return this.position.y; }
  get z(): number { return this.position.z; }

  /** Get Euler angles in radians */
  toEulerAngles(): Vector3 {
    return this.rotation.toEuler();
  }

  /** Get Euler angles in degrees */
  toEulerAnglesDegrees(): Vector3 {
    return this.rotation.toEulerDegrees();
  }

  /** Create translated CFrame */
  translate(offset: Vec3Like): CFrame {
    return new CFrame(this.position.add(offset), this.rotation);
  }

  /** Create rotated CFrame (additional rotation in world space) */
  rotate(q: QuatLike): CFrame {
    return new CFrame(this.position, Quaternion.from(q).mul(this.rotation));
  }

  /** Create rotated CFrame (additional rotation in local space) */
  rotateLocal(q: QuatLike): CFrame {
    return new CFrame(this.position, this.rotation.mul(q));
  }

  equals(cf: CFrame, epsilon = 0.0001): boolean {
    return this.position.equals(cf.position, epsilon) && this.rotation.equals(cf.rotation, epsilon);
  }

  toObject(): { position: Vec3Like; rotation: QuatLike } {
    return {
      position: this.position.toObject(),
      rotation: this.rotation.toObject(),
    };
  }

  toString(): string {
    return `CFrame(${this.position.toString()}, ${this.rotation.toString()})`;
  }

  clone(): CFrame {
    return new CFrame(this.position, this.rotation);
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/** Convert degrees to radians */
export function rad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/** Convert radians to degrees */
export function deg(radians: number): number {
  return radians * (180 / Math.PI);
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse linear interpolation */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

/** Remap value from one range to another */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/** Smooth step interpolation */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoother step interpolation */
export function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Move toward a target value by a max delta */
export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Wrap angle to -PI to PI range */
export function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/** Calculate shortest difference between two angles */
export function deltaAngle(current: number, target: number): number {
  let delta = wrapAngle(target - current);
  return delta;
}
