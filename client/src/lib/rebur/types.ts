export const REBUR_VERSION = "1.0" as const;
export const REBUR_EXT = ".rebur";
export const REBUR_MIME = "application/x-rebur";

export interface ReburBone {
  name: string;
  parentIndex: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export interface ReburAnimation {
  name: string;
  duration: number;
  clipJson: Record<string, unknown>;
}

export interface ReburAsset {
  version: typeof REBUR_VERSION;
  format: "rebur";
  name: string;
  /**
   * The uniform scale factor FBXLoader applied to the root group when the
   * original FBX was loaded (e.g. 0.01 for centimetre exports, 1.0 for metre
   * exports).  We restore this as the wrapper group scale at render time so
   * the bone-inverse matrices — recomputed fresh on bind — are consistent
   * with the mesh vertex positions.  Defaults to 0.01 for legacy assets.
   */
  modelScale: number;
  geometryJson: Record<string, unknown>;
  skeleton: {
    bones: ReburBone[];
    boneInverses: number[][];
  };
  animations: ReburAnimation[];
}
