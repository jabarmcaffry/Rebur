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
  geometryJson: Record<string, unknown>;
  skeleton: {
    bones: ReburBone[];
    boneInverses: number[][];
  };
  animations: ReburAnimation[];
}
