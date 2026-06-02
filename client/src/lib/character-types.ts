export const JOINT_NAMES = [
  "Torso",
  "Head",
  "LeftUpperArm",
  "LeftLowerArm",
  "RightUpperArm",
  "RightLowerArm",
  "LeftUpperLeg",
  "LeftLowerLeg",
  "RightUpperLeg",
  "RightLowerLeg",
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

export interface JointPose {
  rx: number;
  ry: number;
  rz: number;
}

export interface RigFrame {
  index: number;
  joints: Partial<Record<JointName, JointPose>>;
}

export interface RigAnimation {
  id: string;
  name: string;
  frameRate: number;
  looping: boolean;
  frames: RigFrame[];
}

export const JOINT_CHILDREN: Partial<Record<JointName, JointName[]>> = {
  Torso: ["Head", "LeftUpperArm", "RightUpperArm", "LeftUpperLeg", "RightUpperLeg"],
  LeftUpperArm: ["LeftLowerArm"],
  RightUpperArm: ["RightLowerArm"],
  LeftUpperLeg: ["LeftLowerLeg"],
  RightUpperLeg: ["RightLowerLeg"],
};

export const ROOT_JOINTS: JointName[] = ["Torso"];

export const JOINT_LABEL: Record<JointName, string> = {
  Torso: "Torso",
  Head: "Head",
  LeftUpperArm: "L. Upper Arm",
  LeftLowerArm: "L. Lower Arm",
  RightUpperArm: "R. Upper Arm",
  RightLowerArm: "R. Lower Arm",
  LeftUpperLeg: "L. Upper Leg",
  LeftLowerLeg: "L. Lower Leg",
  RightUpperLeg: "R. Upper Leg",
  RightLowerLeg: "R. Lower Leg",
};

export const JOINT_COLOR: Record<JointName, string> = {
  Torso: "#9ca3af",
  Head: "#fbbf24",
  LeftUpperArm: "#60a5fa",
  LeftLowerArm: "#93c5fd",
  RightUpperArm: "#f87171",
  RightLowerArm: "#fca5a5",
  LeftUpperLeg: "#34d399",
  LeftLowerLeg: "#6ee7b7",
  RightUpperLeg: "#a78bfa",
  RightLowerLeg: "#c4b5fd",
};

export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyFrame(index: number): RigFrame {
  return { index, joints: {} };
}

export function emptyAnimation(): RigAnimation {
  return {
    id: nanoid(),
    name: "New Animation",
    frameRate: 24,
    looping: true,
    frames: [emptyFrame(0)],
  };
}

export function storageKey(gameId: string): string {
  return `rebur_rig_anims_v1_${gameId}`;
}

export function loadAnimations(gameId: string): RigAnimation[] {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [emptyAnimation()];
}

export function saveAnimations(gameId: string, anims: RigAnimation[]): void {
  try {
    localStorage.setItem(storageKey(gameId), JSON.stringify(anims));
  } catch {}
}
