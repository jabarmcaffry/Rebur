import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import {
  Play, Pause, Plus, Trash2, RotateCcw, RotateCw,
  Copy, ChevronRight, ChevronDown, Download,
  Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  JOINT_NAMES,
  JOINT_CHILDREN,
  JOINT_LABEL,
  JOINT_COLOR,
  ROOT_JOINTS,
  type JointName,
  type JointPose,
  type RigFrame,
  type RigAnimation,
  nanoid,
  emptyFrame,
  emptyAnimation,
  loadAnimations,
  saveAnimations,
} from "@/lib/character-types";

// ─── Rig 3D rendering ────────────────────────────────────────────────────────

interface RigMeshProps {
  poses: Partial<Record<JointName, JointPose>>;
  selectedJoint?: JointName | null;
  onJointClick?: (joint: JointName) => void;
  ghost?: boolean;
  ghostColor?: string;
}

function RigMesh({ poses, selectedJoint, onJointClick, ghost = false, ghostColor = "#4b5563" }: RigMeshProps) {
  const DEG = Math.PI / 180;

  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const lUARef = useRef<THREE.Group>(null);
  const lLARef = useRef<THREE.Group>(null);
  const rUARef = useRef<THREE.Group>(null);
  const rLARef = useRef<THREE.Group>(null);
  const lULRef = useRef<THREE.Group>(null);
  const lLLRef = useRef<THREE.Group>(null);
  const rULRef = useRef<THREE.Group>(null);
  const rLLRef = useRef<THREE.Group>(null);

  const jointRefs: Record<JointName, RefObject<THREE.Group>> = {
    Torso: torsoRef,
    Head: headRef,
    LeftUpperArm: lUARef,
    LeftLowerArm: lLARef,
    RightUpperArm: rUARef,
    RightLowerArm: rLARef,
    LeftUpperLeg: lULRef,
    LeftLowerLeg: lLLRef,
    RightUpperLeg: rULRef,
    RightLowerLeg: rLLRef,
  };

  useFrame(() => {
    for (const name of JOINT_NAMES) {
      const ref = jointRefs[name];
      if (!ref.current) continue;
      const p = poses[name];
      ref.current.rotation.set(
        (p?.rx ?? 0) * DEG,
        (p?.ry ?? 0) * DEG,
        (p?.rz ?? 0) * DEG,
        "XYZ"
      );
    }
  });

  const color = (joint: JointName) => {
    if (ghost) return ghostColor;
    if (joint === selectedJoint) return "#818cf8";
    return JOINT_COLOR[joint];
  };

  const mat = (joint: JointName) => (
    <meshStandardMaterial
      color={color(joint)}
      transparent={ghost}
      opacity={ghost ? 0.22 : 1}
      roughness={0.55}
      metalness={0.05}
    />
  );

  const click = ghost
    ? undefined
    : (j: JointName) => (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onJointClick?.(j);
      };

  const sel = (j: JointName) =>
    !ghost && j === selectedJoint
      ? { scale: [1.08, 1.08, 1.08] as [number, number, number] }
      : {};

  return (
    <group ref={torsoRef} position={[0, 1.8, 0]}>
      <mesh onClick={click?.("Torso")} castShadow {...sel("Torso")}>
        <boxGeometry args={[0.9, 1.2, 0.5]} />
        {mat("Torso")}
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0, 0.6, 0]}>
        <mesh position={[0, 0.35, 0]} onClick={click?.("Head")} castShadow {...sel("Head")}>
          <sphereGeometry args={[0.3, 16, 12]} />
          {mat("Head")}
        </mesh>
      </group>

      {/* Left arm */}
      <group ref={lUARef} position={[-0.6, 0.4, 0]}>
        <mesh position={[0, -0.3, 0]} onClick={click?.("LeftUpperArm")} castShadow {...sel("LeftUpperArm")}>
          <cylinderGeometry args={[0.1, 0.12, 0.6, 12]} />
          {mat("LeftUpperArm")}
        </mesh>
        <group ref={lLARef} position={[0, -0.6, 0]}>
          <mesh position={[0, -0.25, 0]} onClick={click?.("LeftLowerArm")} castShadow {...sel("LeftLowerArm")}>
            <cylinderGeometry args={[0.09, 0.1, 0.5, 12]} />
            {mat("LeftLowerArm")}
          </mesh>
        </group>
      </group>

      {/* Right arm */}
      <group ref={rUARef} position={[0.6, 0.4, 0]}>
        <mesh position={[0, -0.3, 0]} onClick={click?.("RightUpperArm")} castShadow {...sel("RightUpperArm")}>
          <cylinderGeometry args={[0.1, 0.12, 0.6, 12]} />
          {mat("RightUpperArm")}
        </mesh>
        <group ref={rLARef} position={[0, -0.6, 0]}>
          <mesh position={[0, -0.25, 0]} onClick={click?.("RightLowerArm")} castShadow {...sel("RightLowerArm")}>
            <cylinderGeometry args={[0.09, 0.1, 0.5, 12]} />
            {mat("RightLowerArm")}
          </mesh>
        </group>
      </group>

      {/* Left leg */}
      <group ref={lULRef} position={[-0.25, -0.6, 0]}>
        <mesh position={[0, -0.325, 0]} onClick={click?.("LeftUpperLeg")} castShadow {...sel("LeftUpperLeg")}>
          <cylinderGeometry args={[0.13, 0.16, 0.65, 12]} />
          {mat("LeftUpperLeg")}
        </mesh>
        <group ref={lLLRef} position={[0, -0.65, 0]}>
          <mesh position={[0, -0.275, 0]} onClick={click?.("LeftLowerLeg")} castShadow {...sel("LeftLowerLeg")}>
            <cylinderGeometry args={[0.11, 0.13, 0.55, 12]} />
            {mat("LeftLowerLeg")}
          </mesh>
        </group>
      </group>

      {/* Right leg */}
      <group ref={rULRef} position={[0.25, -0.6, 0]}>
        <mesh position={[0, -0.325, 0]} onClick={click?.("RightUpperLeg")} castShadow {...sel("RightUpperLeg")}>
          <cylinderGeometry args={[0.13, 0.16, 0.65, 12]} />
          {mat("RightUpperLeg")}
        </mesh>
        <group ref={rLLRef} position={[0, -0.65, 0]}>
          <mesh position={[0, -0.275, 0]} onClick={click?.("RightLowerLeg")} castShadow {...sel("RightLowerLeg")}>
            <cylinderGeometry args={[0.11, 0.13, 0.55, 12]} />
            {mat("RightLowerLeg")}
          </mesh>
        </group>
      </group>
    </group>
  );
}

interface RigSceneProps {
  current: Partial<Record<JointName, JointPose>>;
  prev: Partial<Record<JointName, JointPose>> | null;
  next: Partial<Record<JointName, JointPose>> | null;
  selectedJoint: JointName | null;
  onionSkin: boolean;
  onJointClick: (j: JointName) => void;
}

function RigScene({ current, prev, next, selectedJoint, onionSkin, onJointClick }: RigSceneProps) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={0.9} castShadow shadow-mapSize={[512, 512]} />
      <directionalLight position={[-3, 2, -3]} intensity={0.25} />

      {onionSkin && prev && (
        <RigMesh poses={prev} ghost ghostColor="#3b82f6" />
      )}
      {onionSkin && next && (
        <RigMesh poses={next} ghost ghostColor="#f97316" />
      )}
      <RigMesh
        poses={current}
        selectedJoint={selectedJoint}
        onJointClick={onJointClick}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <Grid
        args={[8, 8]}
        cellSize={0.5}
        cellThickness={0.3}
        cellColor="#1f1f1f"
        sectionSize={2}
        sectionThickness={0.8}
        sectionColor="#2d2d2d"
        fadeDistance={10}
        infiniteGrid={false}
      />

      <OrbitControls makeDefault target={[0, 1.5, 0]} minDistance={1.5} maxDistance={8} />
    </>
  );
}

// ─── Joint tree ──────────────────────────────────────────────────────────────

function JointTree({
  selectedJoint,
  frameJoints,
  onSelect,
}: {
  selectedJoint: JointName | null;
  frameJoints: Partial<Record<JointName, JointPose>>;
  onSelect: (j: JointName) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border shrink-0">
        Joints
      </div>
      <ScrollArea className="flex-1">
        <div className="py-1">
          {ROOT_JOINTS.map((j) => (
            <JointTree2
              key={j}
              joint={j}
              depth={0}
              selectedJoint={selectedJoint}
              frameJoints={frameJoints}
              onSelect={onSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function JointTree2({
  joint,
  depth,
  selectedJoint,
  frameJoints,
  onSelect,
}: {
  joint: JointName;
  depth: number;
  selectedJoint: JointName | null;
  frameJoints: Partial<Record<JointName, JointPose>>;
  onSelect: (j: JointName) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = JOINT_CHILDREN[joint];
  const hasChildren = !!(children && children.length > 0);
  const hasData = !!(frameJoints[joint]);
  const isSelected = selectedJoint === joint;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer select-none text-xs transition-colors ${
          isSelected
            ? "bg-indigo-600/25 text-indigo-300"
            : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onSelect(joint)}
      >
        {hasChildren ? (
          <button
            className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: JOINT_COLOR[joint] }} />
        <span className="truncate flex-1">{JOINT_LABEL[joint]}</span>
        {hasData && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/80 shrink-0" />
        )}
      </div>
      {hasChildren && open &&
        children!.map((c) => (
          <JointTree2
            key={c}
            joint={c}
            depth={depth + 1}
            selectedJoint={selectedJoint}
            frameJoints={frameJoints}
            onSelect={onSelect}
          />
        ))
      }
    </div>
  );
}

// ─── Joint rotation controls ──────────────────────────────────────────────────

function JointControls({
  joint,
  pose,
  onChange,
  onReset,
}: {
  joint: JointName | null;
  pose: JointPose | undefined;
  onChange: (p: JointPose) => void;
  onReset: () => void;
}) {
  if (!joint) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[11px] text-muted-foreground px-3 text-center">
        <span className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center mb-2">
          <RotateCcw className="w-4 h-4 text-indigo-400" />
        </span>
        Click a joint in the tree or 3D view to edit its rotation
      </div>
    );
  }

  const p: JointPose = pose ?? { rx: 0, ry: 0, rz: 0 };

  const Row = ({
    axis,
    val,
    color,
  }: {
    axis: "rx" | "ry" | "rz";
    val: number;
    color: string;
  }) => (
    <div className="flex flex-col gap-0.5 mb-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color }}>
          {axis.replace("r", "Rot ")}
        </span>
        <input
          type="number"
          step={1}
          value={Math.round(val)}
          onChange={(e) => onChange({ ...p, [axis]: parseFloat(e.target.value) || 0 })}
          className="w-16 text-right bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] font-mono rounded px-1.5 py-0.5 outline-none focus:border-indigo-500/60"
        />
      </div>
      <Slider
        min={-180}
        max={180}
        step={1}
        value={[val]}
        onValueChange={([v]) => onChange({ ...p, [axis]: v })}
        className="w-full"
      />
      <div className="flex justify-between text-[9px] text-muted-foreground/50 px-0.5">
        <span>-180°</span>
        <span>0°</span>
        <span>180°</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: JOINT_COLOR[joint] }} />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {JOINT_LABEL[joint]}
          </span>
        </div>
        <button
          onClick={onReset}
          title="Reset to 0°"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
      <ScrollArea className="flex-1 px-3 pt-3">
        <Row axis="rx" val={p.rx} color="#ef4444" />
        <Row axis="ry" val={p.ry} color="#22c55e" />
        <Row axis="rz" val={p.rz} color="#3b82f6" />
        <div className="mt-1 text-[9px] text-muted-foreground/40 text-center">Degrees · FK chain</div>
      </ScrollArea>
    </div>
  );
}

// ─── Frame timeline ───────────────────────────────────────────────────────────

function FrameTimeline({
  frames,
  current,
  onNavigate,
  onAdd,
  onDelete,
  onDuplicate,
}: {
  frames: RigFrame[];
  current: number;
  onNavigate: (i: number) => void;
  onAdd: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-frame="${current}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);

  return (
    <div className="flex items-center gap-1 h-full px-2 border-t border-border bg-[#0d0d0d]">
      <div className="flex items-center gap-0.5 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => onNavigate(Math.max(0, current - 1))}>
              <ChevronRight className="w-3 h-3 rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Prev frame</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => onNavigate(Math.min(frames.length - 1, current + 1))}>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next frame</TooltipContent>
        </Tooltip>
      </div>

      <div ref={scrollRef} className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar py-1">
        {frames.map((f, i) => {
          const hasPose = Object.keys(f.joints).length > 0;
          return (
            <button
              key={f.index}
              data-frame={i}
              onClick={() => onNavigate(i)}
              onDoubleClick={onDuplicate}
              title={`Frame ${i + 1}${hasPose ? " (has pose)" : ""}\nDouble-click to duplicate`}
              className={`shrink-0 w-8 h-7 rounded text-[10px] font-mono flex flex-col items-center justify-center gap-0.5 border transition-all ${
                i === current
                  ? "bg-indigo-600 border-indigo-400 text-white scale-105"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-muted-foreground hover:border-indigo-600/50 hover:text-foreground"
              }`}
            >
              <span>{i + 1}</span>
              {hasPose && <span className="w-1 h-1 rounded-full bg-current opacity-60" />}
            </button>
          );
        })}
        <button
          onClick={onAdd}
          className="shrink-0 w-7 h-7 rounded border border-dashed border-[#2a2a2a] text-muted-foreground hover:text-foreground hover:border-indigo-600/50 transition-colors flex items-center justify-center"
          title="Add frame"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={onDuplicate} title="Duplicate frame">
              <Copy className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicate frame</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 text-destructive/70 hover:text-destructive"
              onClick={onDelete}
              disabled={frames.length <= 1}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete frame</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HistoryEntry {
  frames: RigFrame[];
  currentFrame: number;
}

interface Props {
  gameId: string;
}

export default function RigAnimationEditor({ gameId }: Props) {
  const [animations, setAnimations] = useState<RigAnimation[]>(() => loadAnimations(gameId));
  const [selectedAnimId, setSelectedAnimId] = useState<string>(animations[0].id);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [selectedJoint, setSelectedJoint] = useState<JointName | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [onionSkin, setOnionSkin] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const playIntervalRef = useRef<number | null>(null);

  const selectedAnim = animations.find((a) => a.id === selectedAnimId) ?? animations[0];
  const clampedFrame = Math.min(currentFrame, selectedAnim.frames.length - 1);
  const currentFrameData = selectedAnim.frames[clampedFrame];
  const currentPoses: Partial<Record<JointName, JointPose>> = currentFrameData?.joints ?? {};
  const prevPoses = clampedFrame > 0 ? selectedAnim.frames[clampedFrame - 1].joints : null;
  const nextPoses = clampedFrame < selectedAnim.frames.length - 1 ? selectedAnim.frames[clampedFrame + 1].joints : null;

  const selectedJointPose = selectedJoint ? currentPoses[selectedJoint] : undefined;

  const persistAnims = useCallback((anims: RigAnimation[]) => {
    setAnimations(anims);
    saveAnimations(gameId, anims);
  }, [gameId]);

  const pushHistory = useCallback((anims: RigAnimation[], frame: number) => {
    const entry: HistoryEntry = { frames: JSON.parse(JSON.stringify(anims.find(a => a.id === selectedAnimId)!.frames)), currentFrame: frame };
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      return [...trimmed, entry].slice(-50);
    });
    setHistoryIdx((i) => Math.min(i + 1, 49));
  }, [selectedAnimId, historyIdx]);

  const updateFrames = useCallback((newFrames: RigFrame[], newCurrentFrame?: number) => {
    pushHistory(animations, currentFrame);
    persistAnims(animations.map((a) =>
      a.id === selectedAnimId ? { ...a, frames: newFrames } : a
    ));
    if (newCurrentFrame !== undefined) setCurrentFrame(newCurrentFrame);
  }, [animations, selectedAnimId, currentFrame, persistAnims, pushHistory]);

  const undo = useCallback(() => {
    if (historyIdx < 0) return;
    const entry = history[historyIdx];
    setHistoryIdx((i) => i - 1);
    persistAnims(animations.map((a) =>
      a.id === selectedAnimId ? { ...a, frames: entry.frames } : a
    ));
    setCurrentFrame(entry.currentFrame);
  }, [history, historyIdx, animations, selectedAnimId, persistAnims]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const entry = history[historyIdx + 1];
    setHistoryIdx((i) => i + 1);
    persistAnims(animations.map((a) =>
      a.id === selectedAnimId ? { ...a, frames: entry.frames } : a
    ));
    setCurrentFrame(entry.currentFrame);
  }, [history, historyIdx, animations, selectedAnimId, persistAnims]);

  const setJointPose = useCallback((joint: JointName, pose: JointPose) => {
    const frames = selectedAnim.frames.map((f, i) =>
      i === clampedFrame
        ? { ...f, joints: { ...f.joints, [joint]: pose } }
        : f
    );
    updateFrames(frames);
  }, [selectedAnim, clampedFrame, updateFrames]);

  const resetJointPose = useCallback(() => {
    if (!selectedJoint) return;
    const frames = selectedAnim.frames.map((f, i) => {
      if (i !== clampedFrame) return f;
      const joints = { ...f.joints };
      delete joints[selectedJoint];
      return { ...f, joints };
    });
    updateFrames(frames);
  }, [selectedJoint, selectedAnim, clampedFrame, updateFrames]);

  const addFrame = useCallback(() => {
    const newIdx = clampedFrame + 1;
    const newFrame: RigFrame = { index: newIdx, joints: {} };
    const frames = [
      ...selectedAnim.frames.slice(0, newIdx),
      newFrame,
      ...selectedAnim.frames.slice(newIdx),
    ].map((f, i) => ({ ...f, index: i }));
    updateFrames(frames, newIdx);
  }, [selectedAnim, clampedFrame, updateFrames]);

  const deleteFrame = useCallback(() => {
    if (selectedAnim.frames.length <= 1) return;
    const frames = selectedAnim.frames
      .filter((_, i) => i !== clampedFrame)
      .map((f, i) => ({ ...f, index: i }));
    const nextFrame = Math.max(0, clampedFrame - 1);
    updateFrames(frames, nextFrame);
  }, [selectedAnim, clampedFrame, updateFrames]);

  const duplicateFrame = useCallback(() => {
    const cur = selectedAnim.frames[clampedFrame];
    const newIdx = clampedFrame + 1;
    const copy: RigFrame = { index: newIdx, joints: { ...cur.joints } };
    const frames = [
      ...selectedAnim.frames.slice(0, newIdx),
      copy,
      ...selectedAnim.frames.slice(newIdx),
    ].map((f, i) => ({ ...f, index: i }));
    updateFrames(frames, newIdx);
  }, [selectedAnim, clampedFrame, updateFrames]);

  const newAnimation = useCallback(() => {
    const anim = emptyAnimation();
    const newAnims = [...animations, anim];
    persistAnims(newAnims);
    setSelectedAnimId(anim.id);
    setCurrentFrame(0);
  }, [animations, persistAnims]);

  const deleteAnimation = useCallback(() => {
    if (animations.length <= 1) return;
    const newAnims = animations.filter((a) => a.id !== selectedAnimId);
    persistAnims(newAnims);
    setSelectedAnimId(newAnims[0].id);
    setCurrentFrame(0);
  }, [animations, selectedAnimId, persistAnims]);

  const renameAnimation = useCallback((name: string) => {
    persistAnims(animations.map((a) => a.id === selectedAnimId ? { ...a, name } : a));
  }, [animations, selectedAnimId, persistAnims]);

  const updateFps = useCallback((fps: number) => {
    persistAnims(animations.map((a) => a.id === selectedAnimId ? { ...a, frameRate: fps } : a));
  }, [animations, selectedAnimId, persistAnims]);

  const exportAnimation = useCallback(() => {
    const blob = new Blob([JSON.stringify(selectedAnim, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedAnim.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedAnim]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const interval = 1000 / (selectedAnim.frameRate || 24);
      playIntervalRef.current = window.setInterval(() => {
        setCurrentFrame((f) => {
          const next = f + 1;
          if (next >= selectedAnim.frames.length) {
            if (selectedAnim.looping) return 0;
            setIsPlaying(false);
            return f;
          }
          return next;
        });
      }, interval);
    } else {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, selectedAnim.frameRate, selectedAnim.frames.length, selectedAnim.looping]);

  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [selectedAnimId]);

  const canUndo = historyIdx >= 0;
  const canRedo = historyIdx < history.length - 1;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-sm overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-[#0f0f0f] shrink-0 flex-wrap">
        {/* Animation selector */}
        <select
          value={selectedAnimId}
          onChange={(e) => setSelectedAnimId(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs rounded px-2 py-1 outline-none focus:border-indigo-500/60 max-w-[130px]"
        >
          {animations.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <input
          value={selectedAnim.name}
          onChange={(e) => renameAnimation(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs rounded px-2 py-1 outline-none focus:border-indigo-500/60 w-32"
          placeholder="Animation name"
        />

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">FPS</span>
          <input
            type="number"
            min={1}
            max={60}
            value={selectedAnim.frameRate}
            onChange={(e) => updateFps(parseInt(e.target.value) || 24)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs rounded px-1.5 py-1 outline-none focus:border-indigo-500/60 w-12 font-mono"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
            {clampedFrame + 1}/{selectedAnim.frames.length}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={togglePlay}>
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={undo} disabled={!canUndo}>
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={redo} disabled={!canRedo}>
                <RotateCw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={onionSkin ? "default" : "ghost"}
                className="w-7 h-7"
                onClick={() => setOnionSkin((v) => !v)}
              >
                {onionSkin ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Onion skin {onionSkin ? "on" : "off"}</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={newAnimation}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New animation</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 text-destructive/60 hover:text-destructive"
                onClick={deleteAnimation}
                disabled={animations.length <= 1}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete animation</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={exportAnimation}>
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export JSON</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Joint tree */}
        <div className="w-40 shrink-0 border-r border-border bg-[#0d0d0d] flex flex-col">
          <JointTree
            selectedJoint={selectedJoint}
            frameJoints={currentPoses}
            onSelect={setSelectedJoint}
          />
        </div>

        {/* 3D viewport */}
        <div className="flex-1 min-w-0 bg-[#0a0a0a] relative">
          <Canvas
            shadows
            camera={{ position: [0, 2.5, 5], fov: 45 }}
            gl={{ antialias: true }}
            className="w-full h-full"
          >
            <RigScene
              current={currentPoses}
              prev={prevPoses}
              next={nextPoses}
              selectedJoint={selectedJoint}
              onionSkin={onionSkin}
              onJointClick={setSelectedJoint}
            />
          </Canvas>

          {/* Onion skin legend */}
          {onionSkin && (
            <div className="absolute bottom-2 left-2 flex items-center gap-3 text-[9px] text-muted-foreground bg-black/50 rounded px-2 py-1 pointer-events-none">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500/70" /> prev
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500/70" /> next
              </span>
            </div>
          )}

          {/* Frame badge */}
          <div className="absolute top-2 right-2 bg-black/60 text-white/70 text-[10px] font-mono px-2 py-0.5 rounded pointer-events-none">
            Frame {clampedFrame + 1}
          </div>
        </div>

        {/* Joint controls */}
        <div className="w-44 shrink-0 border-l border-border bg-[#0d0d0d] flex flex-col">
          <JointControls
            joint={selectedJoint}
            pose={selectedJointPose}
            onChange={(p) => selectedJoint && setJointPose(selectedJoint, p)}
            onReset={resetJointPose}
          />
        </div>
      </div>

      {/* Frame timeline */}
      <div className="h-11 shrink-0">
        <FrameTimeline
          frames={selectedAnim.frames}
          current={clampedFrame}
          onNavigate={setCurrentFrame}
          onAdd={addFrame}
          onDelete={deleteFrame}
          onDuplicate={duplicateFrame}
        />
      </div>
    </div>
  );
}
