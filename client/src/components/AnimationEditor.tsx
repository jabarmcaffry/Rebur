// Animation editor — shows real GLB avatar in the viewport
// Top: 3D viewport with real avatar + skeleton  |  Bottom: frame-per-frame timeline

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import {
  Play, Pause, Plus, Trash2, RotateCcw, RotateCw,
  Copy, ChevronRight, ChevronDown, Eye, EyeOff, User, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { JointName, JointPose, RigFrame, RigAnimation } from "@/lib/character-types";
import {
  JOINT_NAMES, JOINT_CHILDREN, ROOT_JOINTS, JOINT_LABEL, JOINT_COLOR,
  loadAnimations, saveAnimations, emptyFrame, emptyAnimation, nanoid,
} from "@/lib/character-types";

// Preload avatar so editor doesn't stutter on first open
useGLTF.preload("/Avatar_all_animations.glb");

// Map our joint names → possible GLB bone name variants
const JOINT_BONE_MAP: Record<JointName, string[]> = {
  Torso:         ["Hips", "Spine", "Spine1", "Spine2", "Chest", "Torso", "mixamorigHips", "mixamorigSpine"],
  Head:          ["Head", "Neck", "Neck1", "mixamorigHead", "mixamorigNeck"],
  LeftUpperArm:  ["LeftArm", "LeftShoulder", "Left_Upper_Arm", "mixamorigLeftArm", "mixamorigLeftShoulder"],
  LeftLowerArm:  ["LeftForeArm", "LeftForearm", "Left_Lower_Arm", "mixamorigLeftForeArm"],
  RightUpperArm: ["RightArm", "RightShoulder", "Right_Upper_Arm", "mixamorigRightArm", "mixamorigRightShoulder"],
  RightLowerArm: ["RightForeArm", "RightForearm", "Right_Lower_Arm", "mixamorigRightForeArm"],
  LeftUpperLeg:  ["LeftUpLeg", "LeftThigh", "Left_Upper_Leg", "LeftHip", "mixamorigLeftUpLeg"],
  LeftLowerLeg:  ["LeftLeg", "LeftShin", "Left_Lower_Leg", "LeftKnee", "mixamorigLeftLeg"],
  RightUpperLeg: ["RightUpLeg", "RightThigh", "Right_Upper_Leg", "RightHip", "mixamorigRightUpLeg"],
  RightLowerLeg: ["RightLeg", "RightShin", "Right_Lower_Leg", "RightKnee", "mixamorigRightLeg"],
};

// ─── Real avatar preview (replaces fake RigMesh) ──────────────────────────────

interface AvatarPreviewProps {
  glbClip: string | null;
  customPoses: Partial<Record<JointName, JointPose>> | null;
  showMesh: boolean;
  onClipsLoaded: (names: string[]) => void;
}

function AvatarPreview({ glbClip, customPoses, showMesh, onClipsLoaded }: AvatarPreviewProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: origScene, animations } = useGLTF("/Avatar_all_animations.glb");
  const cloned = useMemo(() => cloneSkeleton(origScene), [origScene]);
  const { actions, names } = useAnimations(animations, groupRef);
  const reportedRef = useRef(false);

  // Build bone reference map for custom pose application
  const boneMap = useMemo<Map<JointName, THREE.Bone>>(() => {
    const map = new Map<JointName, THREE.Bone>();
    const allBones: THREE.Bone[] = [];
    cloned.traverse(n => { if (n instanceof THREE.Bone) allBones.push(n); });
    for (const joint of JOINT_NAMES) {
      const candidates = JOINT_BONE_MAP[joint];
      for (const candidate of candidates) {
        const bone = allBones.find(b =>
          b.name.toLowerCase() === candidate.toLowerCase()
        );
        if (bone) { map.set(joint, bone); break; }
      }
    }
    return map;
  }, [cloned]);

  // Report GLB clip names once
  useEffect(() => {
    if (names.length > 0 && !reportedRef.current) {
      reportedRef.current = true;
      onClipsLoaded(names);
    }
  }, [names, onClipsLoaded]);

  // Play / switch GLB clip
  useEffect(() => {
    if (!actions || names.length === 0) return;
    if (glbClip && actions[glbClip]) {
      Object.values(actions).forEach(a => a?.fadeOut(0.2));
      actions[glbClip]!.reset().fadeIn(0.2).play();
    } else if (!glbClip) {
      // Custom animation mode — stop all clips so manual poses take over
      Object.values(actions).forEach(a => a?.fadeOut(0.1));
      // Play idle softly as base
      const idleNames = ["idle", "Idle", "IDLE", "Stand", "stand"];
      const idleClip = names.find(n => idleNames.includes(n));
      if (idleClip && actions[idleClip]) {
        actions[idleClip]!.reset().fadeIn(0.3).play();
      }
    }
  }, [glbClip, actions, names]);

  // Apply custom pose rotations to skeleton bones every frame
  useFrame(() => {
    if (!customPoses) return;
    const DEG = Math.PI / 180;
    for (const [joint, pose] of Object.entries(customPoses) as [JointName, JointPose][]) {
      const bone = boneMap.get(joint);
      if (bone && pose) {
        bone.rotation.set(pose.rx * DEG, pose.ry * DEG, pose.rz * DEG, "XYZ");
      }
    }
  });

  // Toggle mesh visibility
  useEffect(() => {
    cloned.traverse(n => {
      if (n instanceof THREE.Mesh) n.visible = showMesh;
    });
  }, [showMesh, cloned]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

// ─── Bone tree (left sidebar) ─────────────────────────────────────────────────

function BoneTreeNode({
  joint, depth, selectedJoint, frameJoints, onSelect,
}: {
  joint: JointName;
  depth: number;
  selectedJoint: JointName | null;
  frameJoints: Partial<Record<JointName, JointPose>>;
  onSelect: (j: JointName) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = JOINT_CHILDREN[joint] ?? [];
  const isSel = joint === selectedJoint;
  const hasPose = !!frameJoints[joint];

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-[3px] cursor-pointer select-none text-xs rounded transition-colors ${
          isSel
            ? "bg-indigo-600/30 text-indigo-300"
            : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => onSelect(joint)}
      >
        {children.length > 0 ? (
          <button
            className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-muted-foreground"
            onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          >
            {open
              ? <ChevronDown className="w-2.5 h-2.5" />
              : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: JOINT_COLOR[joint] }} />
        <span className="flex-1 truncate">{JOINT_LABEL[joint]}</span>
        {hasPose && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1 shrink-0" title="Has keyframe" />
        )}
      </div>
      {open && children.map(c => (
        <BoneTreeNode
          key={c}
          joint={c}
          depth={depth + 1}
          selectedJoint={selectedJoint}
          frameJoints={frameJoints}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ─── Floating rotation controls ───────────────────────────────────────────────

function BoneControls({
  joint, pose, onChange, onClear,
}: {
  joint: JointName;
  pose: JointPose;
  onChange: (p: JointPose) => void;
  onClear: () => void;
}) {
  const axes: { key: keyof JointPose; label: string; color: string }[] = [
    { key: "rx", label: "X", color: "#ef4444" },
    { key: "ry", label: "Y", color: "#22c55e" },
    { key: "rz", label: "Z", color: "#3b82f6" },
  ];

  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl p-3 w-52">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: JOINT_COLOR[joint] }} />
          <span className="text-xs font-semibold text-foreground">{JOINT_LABEL[joint]}</span>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
        >
          Reset
        </button>
      </div>
      <div className="space-y-2.5">
        {axes.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold w-3 shrink-0" style={{ color }}>{label}</span>
            <Slider
              min={-180} max={180} step={1}
              value={[pose[key]]}
              onValueChange={([v]) => onChange({ ...pose, [key]: v })}
              className="flex-1"
            />
            <input
              type="number"
              min={-180} max={180}
              value={Math.round(pose[key])}
              onChange={e => onChange({ ...pose, [key]: Number(e.target.value) })}
              className="w-12 text-[10px] bg-muted border border-border rounded px-1 py-0.5 text-right text-foreground"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Frame chip ───────────────────────────────────────────────────────────────

function FrameChip({
  index, isCurrent, hasData, onClick,
}: {
  index: number;
  isCurrent: boolean;
  hasData: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative w-10 h-14 flex-shrink-0 flex flex-col items-center justify-center
        cursor-pointer select-none rounded border transition-all
        ${isCurrent
          ? "bg-indigo-600 border-indigo-400 text-white scale-[1.06] shadow-lg shadow-indigo-900/50"
          : "bg-card border-border text-muted-foreground hover:bg-muted hover:border-muted-foreground hover:text-foreground"
        }`}
    >
      <span className="text-[11px] font-mono font-semibold leading-none">{index + 1}</span>
      {hasData && (
        <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isCurrent ? "bg-white/70" : "bg-indigo-400"}`} />
      )}
    </div>
  );
}

// ─── Animation group tab ──────────────────────────────────────────────────────

function GroupTab({
  anim, isActive, onSelect, onDelete, onRename,
}: {
  anim: RigAnimation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(anim.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const v = draft.trim() || anim.name;
    onRename(v);
    setDraft(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="px-2 h-6 text-xs bg-card border border-indigo-500 rounded text-foreground outline-none w-24 shrink-0"
      />
    );
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 h-6 rounded text-xs font-medium cursor-pointer shrink-0 transition-colors ${
        isActive
          ? "bg-indigo-600 text-white"
          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
      }`}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
    >
      <span className="max-w-[80px] truncate">{anim.name}</span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className={`flex items-center justify-center w-3.5 h-3.5 rounded transition-colors ${
          isActive ? "text-white/60 hover:text-red-300" : "text-muted-foreground hover:text-red-400"
        }`}
      >
        ×
      </button>
    </div>
  );
}

// ─── Built-in GLB clip tab ────────────────────────────────────────────────────

function GlbClipTab({
  name, isActive, onSelect,
}: {
  name: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 h-6 rounded text-xs font-medium cursor-pointer shrink-0 transition-colors ${
        isActive
          ? "bg-teal-600 text-white"
          : "bg-teal-900/40 text-teal-300 hover:bg-teal-800/60 hover:text-teal-100"
      }`}
      onClick={onSelect}
      title={`Built-in GLB clip: ${name}`}
    >
      <span className="text-[9px] opacity-70 font-mono">▶</span>
      <span className="max-w-[80px] truncate">{name}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnimationEditor({ gameId }: { gameId: string }) {
  const [anims, setAnims] = useState<RigAnimation[]>(() => loadAnimations(gameId));
  const [activeAnimId, setActiveAnimId] = useState<string>(() => {
    const saved = loadAnimations(gameId);
    return saved[0]?.id ?? "";
  });

  // GLB clips loaded from the actual avatar file
  const [glbClips, setGlbClips] = useState<string[]>([]);
  // Which GLB clip is active (null = using a custom animation)
  const [activeGlbClip, setActiveGlbClip] = useState<string | null>(null);

  const [currentFrame, setCurrentFrame]   = useState(0);
  const [selectedJoint, setSelectedJoint] = useState<JointName | null>(null);
  const [showMesh, setShowMesh]           = useState(true);
  const [playing, setPlaying]             = useState(false);

  const histRef      = useRef<RigAnimation[][]>([]);
  const hPtrRef      = useRef(-1);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stripRef     = useRef<HTMLDivElement>(null);

  // ── Derived ───────────────────────────────────────────────────
  const activeAnim    = anims.find(a => a.id === activeAnimId) ?? anims[0];
  const frameData     = activeAnim?.frames[currentFrame];
  const currentPoses: Partial<Record<JointName, JointPose>> = frameData?.joints ?? {};
  const frameCount    = activeAnim?.frames.length ?? 0;

  // In GLB clip mode: pass clip name; in custom mode: pass current poses
  const isGlbMode = activeGlbClip !== null;

  // ── Callback to receive clip names from inside the Canvas ─────
  const handleClipsLoaded = useCallback((names: string[]) => {
    setGlbClips(names);
    // Auto-select the first clip to show the avatar animated by default
    if (names.length > 0) {
      setActiveGlbClip(names[0]);
      setActiveAnimId("");
    }
  }, []);

  // ── Persist helpers ───────────────────────────────────────────
  const persist = useCallback((next: RigAnimation[]) => {
    saveAnimations(gameId, next);
    const trimmed = histRef.current.slice(0, hPtrRef.current + 1);
    const capped  = [...trimmed, next].slice(-50);
    histRef.current = capped;
    hPtrRef.current = capped.length - 1;
  }, [gameId]);

  const mutate = useCallback((fn: (prev: RigAnimation[]) => RigAnimation[]) => {
    setAnims(prev => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  // ── Undo / Redo ───────────────────────────────────────────────
  const undo = useCallback(() => {
    if (hPtrRef.current <= 0) return;
    hPtrRef.current--;
    const s = histRef.current[hPtrRef.current];
    setAnims(s);
    saveAnimations(gameId, s);
  }, [gameId]);

  const redo = useCallback(() => {
    if (hPtrRef.current >= histRef.current.length - 1) return;
    hPtrRef.current++;
    const s = histRef.current[hPtrRef.current];
    setAnims(s);
    saveAnimations(gameId, s);
  }, [gameId]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
      if (e.key === " " && !isGlbMode)  { e.preventDefault(); setPlaying(v => !v); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); setCurrentFrame(f => Math.max(0, f - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setCurrentFrame(f => Math.min(frameCount - 1, f + 1)); }
      if (e.key === "Escape")     setSelectedJoint(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo, frameCount, isGlbMode]);

  // ── Playback ──────────────────────────────────────────────────
  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    if (!playing || isGlbMode) return;
    const fps  = activeAnim?.frameRate ?? 24;
    const loop = activeAnim?.looping ?? true;
    playTimerRef.current = setInterval(() => {
      setCurrentFrame(f => {
        const next = f + 1;
        if (next >= frameCount) {
          if (loop) return 0;
          setPlaying(false);
          return f;
        }
        return next;
      });
    }, 1000 / fps);
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [playing, isGlbMode, activeAnim?.frameRate, activeAnim?.looping, frameCount]);

  // Auto-scroll timeline strip to show current frame
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const chip = strip.children[currentFrame] as HTMLElement | undefined;
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentFrame]);

  // ── Group management ──────────────────────────────────────────
  const selectGroup = useCallback((id: string) => {
    setPlaying(false);
    setActiveAnimId(id);
    setActiveGlbClip(null);
    setCurrentFrame(0);
    setSelectedJoint(null);
  }, []);

  const selectGlbClip = useCallback((name: string) => {
    setPlaying(false);
    setActiveGlbClip(name);
    setActiveAnimId("");
    setSelectedJoint(null);
  }, []);

  const addGroup = useCallback(() => {
    const a = emptyAnimation();
    mutate(prev => [...prev, a]);
    selectGroup(a.id);
  }, [mutate, selectGroup]);

  const deleteGroup = useCallback((id: string) => {
    setAnims(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(a => a.id !== id);
      persist(next);
      if (id === activeAnimId) {
        setActiveAnimId(next[0]?.id ?? "");
        setCurrentFrame(0);
        if (glbClips.length > 0) setActiveGlbClip(glbClips[0]);
      }
      return next;
    });
  }, [activeAnimId, persist, glbClips]);

  const renameGroup = useCallback((id: string, name: string) => {
    mutate(prev => prev.map(a => a.id === id ? { ...a, name } : a));
  }, [mutate]);

  const setFps = useCallback((fps: number) => {
    mutate(prev => prev.map(a => a.id === activeAnimId ? { ...a, frameRate: fps } : a));
  }, [activeAnimId, mutate]);

  const toggleLoop = useCallback(() => {
    mutate(prev => prev.map(a => a.id === activeAnimId ? { ...a, looping: !a.looping } : a));
  }, [activeAnimId, mutate]);

  // ── Pose editing ──────────────────────────────────────────────
  const handlePoseChange = useCallback((pose: JointPose) => {
    if (!selectedJoint || !activeAnim) return;
    mutate(prev => prev.map(a => {
      if (a.id !== activeAnimId) return a;
      return {
        ...a,
        frames: a.frames.map((f, i) =>
          i !== currentFrame ? f : { ...f, joints: { ...f.joints, [selectedJoint]: pose } }
        ),
      };
    }));
  }, [selectedJoint, activeAnim, activeAnimId, currentFrame, mutate]);

  const clearPose = useCallback((joint: JointName) => {
    if (!activeAnim) return;
    mutate(prev => prev.map(a => {
      if (a.id !== activeAnimId) return a;
      return {
        ...a,
        frames: a.frames.map((f, i) => {
          if (i !== currentFrame) return f;
          const joints = { ...f.joints };
          delete joints[joint];
          return { ...f, joints };
        }),
      };
    }));
  }, [activeAnim, activeAnimId, currentFrame, mutate]);

  // ── Frame operations ──────────────────────────────────────────
  const addFrame = useCallback(() => {
    if (!activeAnim || isGlbMode) return;
    mutate(prev => prev.map(a => {
      if (a.id !== activeAnimId) return a;
      return { ...a, frames: [...a.frames, emptyFrame(a.frames.length)] };
    }));
    setCurrentFrame(frameCount);
  }, [activeAnim, activeAnimId, frameCount, mutate, isGlbMode]);

  const duplicateFrame = useCallback(() => {
    if (!activeAnim || isGlbMode) return;
    mutate(prev => prev.map(a => {
      if (a.id !== activeAnimId) return a;
      const src = a.frames[currentFrame];
      if (!src) return a;
      const dup: RigFrame = { index: a.frames.length, joints: { ...src.joints } };
      return { ...a, frames: [...a.frames, dup] };
    }));
    setCurrentFrame(frameCount);
  }, [activeAnim, activeAnimId, currentFrame, frameCount, mutate, isGlbMode]);

  const deleteFrame = useCallback(() => {
    if (!activeAnim || frameCount <= 1 || isGlbMode) return;
    mutate(prev => prev.map(a => {
      if (a.id !== activeAnimId) return a;
      return {
        ...a,
        frames: a.frames
          .filter((_, i) => i !== currentFrame)
          .map((f, i) => ({ ...f, index: i })),
      };
    }));
    setCurrentFrame(f => Math.min(f, frameCount - 2));
  }, [activeAnim, activeAnimId, currentFrame, frameCount, mutate, isGlbMode]);

  // ── Export ────────────────────────────────────────────────────
  const exportJSON = useCallback(() => {
    if (!activeAnim || isGlbMode) return;
    const blob = new Blob([JSON.stringify(activeAnim, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const el   = document.createElement("a");
    el.href    = url;
    el.download = `${activeAnim.name.replace(/\s+/g, "_")}.json`;
    el.click();
    URL.revokeObjectURL(url);
  }, [activeAnim, isGlbMode]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 h-9 px-2 border-b border-border bg-card/30 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showMesh ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 gap-1 text-xs"
              onClick={() => setShowMesh(v => !v)}
            >
              {showMesh ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <User className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle avatar mesh</TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={undo}>
              <RotateCcw className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={redo}>
              <RotateCw className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {isGlbMode ? (
          <span className="text-[10px] text-teal-400 tabular-nums">
            Built-in: {activeGlbClip}
          </span>
        ) : activeAnim ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {activeAnim.name} · {currentFrame + 1} / {frameCount}
          </span>
        ) : null}

        <div className="w-px h-4 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="sm" className="h-6 w-6 p-0"
              onClick={exportJSON}
              disabled={isGlbMode}
            >
              <Download className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Export custom animation JSON</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Scene + bone tree ── */}
      <div className="flex flex-1 min-h-0">

        {/* Bone tree sidebar */}
        <div className="w-40 border-r border-border bg-card/20 flex flex-col shrink-0">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border shrink-0">
            Skeleton
          </div>
          <ScrollArea className="flex-1">
            <div className="py-1">
              {ROOT_JOINTS.map(j => (
                <BoneTreeNode
                  key={j}
                  joint={j}
                  depth={0}
                  selectedJoint={selectedJoint}
                  frameJoints={isGlbMode ? {} : currentPoses}
                  onSelect={j => {
                    if (!isGlbMode) setSelectedJoint(j);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
          <div className="border-t border-border p-2 shrink-0">
            <p className="text-[9px] text-muted-foreground leading-tight">
              {isGlbMode
                ? "Built-in clips can't be edited. Add a custom animation to create new poses."
                : "Select a bone to pose it. Double-click a tab to rename."}
            </p>
          </div>
        </div>

        {/* 3D viewport */}
        <div className="relative flex-1 min-h-0">
          <Canvas
            shadows
            camera={{ position: [0, 1.4, 4], fov: 45 }}
            onPointerMissed={() => setSelectedJoint(null)}
          >
            <color attach="background" args={["#0d0d0d"]} />
            <ambientLight intensity={0.55} />
            <directionalLight
              position={[5, 9, 4]}
              intensity={1.1}
              castShadow
              shadow-mapSize={[512, 512]}
            />
            <directionalLight position={[-4, 3, -4]} intensity={0.3} color="#a0c8ff" />
            <Grid
              args={[20, 20]}
              cellSize={0.5}
              cellThickness={0.4}
              cellColor="#1c1c1c"
              sectionSize={2}
              sectionThickness={0.7}
              sectionColor="#262626"
              fadeDistance={20}
              fadeStrength={1}
              infiniteGrid
            />
            <Suspense fallback={null}>
              <AvatarPreview
                glbClip={activeGlbClip}
                customPoses={isGlbMode ? null : currentPoses}
                showMesh={showMesh}
                onClipsLoaded={handleClipsLoaded}
              />
            </Suspense>
            <OrbitControls makeDefault target={[0, 1.0, 0]} />
          </Canvas>

          {/* Floating bone rotation controls (custom mode only) */}
          {!isGlbMode && selectedJoint && (
            <div className="absolute top-3 right-3 z-10">
              <BoneControls
                joint={selectedJoint}
                pose={currentPoses[selectedJoint] ?? { rx: 0, ry: 0, rz: 0 }}
                onChange={handlePoseChange}
                onClear={() => clearPose(selectedJoint)}
              />
            </div>
          )}

          {/* Hint overlay */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            {isGlbMode ? (
              <span className="text-[10px] text-teal-400/80 bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
                Previewing built-in GLB animation · Add a custom clip to create new animations
              </span>
            ) : !selectedJoint ? (
              <span className="text-[10px] text-muted-foreground/70 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                Click a bone in the tree to pose it · Space to play
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className={`border-t border-border bg-card/20 flex flex-col shrink-0 ${isGlbMode ? "h-10" : "h-[168px]"}`}>

        {/* Animation tabs row */}
        <div
          className="flex items-center gap-1.5 px-2 h-9 border-b border-border shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Built-in GLB clips */}
          {glbClips.map(clip => (
            <GlbClipTab
              key={clip}
              name={clip}
              isActive={activeGlbClip === clip}
              onSelect={() => selectGlbClip(clip)}
            />
          ))}

          {glbClips.length > 0 && anims.length > 0 && (
            <div className="w-px h-4 bg-border shrink-0 mx-0.5" />
          )}

          {/* Custom animation clips */}
          {anims.map(a => (
            <GroupTab
              key={a.id}
              anim={a}
              isActive={!isGlbMode && a.id === activeAnimId}
              onSelect={() => selectGroup(a.id)}
              onDelete={() => deleteGroup(a.id)}
              onRename={name => renameGroup(a.id, name)}
            />
          ))}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={addGroup}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
              >
                <Plus className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New custom animation</TooltipContent>
          </Tooltip>
        </div>

        {/* Frame editor (only in custom animation mode) */}
        {!isGlbMode && (
          <>
            {/* Frame filmstrip */}
            <div
              className="flex-1 overflow-x-auto overflow-y-hidden"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent" }}
            >
              <div
                ref={stripRef}
                className="flex items-center gap-1.5 h-full px-2 py-1.5 min-w-max"
              >
                {(activeAnim?.frames ?? []).map((f, i) => (
                  <FrameChip
                    key={i}
                    index={i}
                    isCurrent={i === currentFrame}
                    hasData={Object.keys(f.joints).length > 0}
                    onClick={() => setCurrentFrame(i)}
                  />
                ))}
                <div
                  onClick={addFrame}
                  className="w-10 h-14 flex-shrink-0 flex items-center justify-center cursor-pointer rounded border border-dashed border-border text-muted-foreground hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Playback + frame controls */}
            <div className="flex items-center gap-1.5 px-2 h-8 border-t border-border shrink-0">
              <button
                onClick={() => setCurrentFrame(0)}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors"
                title="First frame"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1" y="1" width="1.5" height="10" rx="0.4"/>
                  <polygon points="11,1 4.5,6 11,11"/>
                </svg>
              </button>

              <button
                onClick={() => setCurrentFrame(f => Math.max(0, f - 1))}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors"
                title="Previous frame"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="11,1 5,6 11,11"/>
                  <polygon points="6,1 0,6 6,11"/>
                </svg>
              </button>

              <button
                onClick={() => setPlaying(v => !v)}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                  playing
                    ? "bg-indigo-600 text-white"
                    : "bg-white/10 text-foreground hover:bg-white/20"
                }`}
                title={playing ? "Pause (Space)" : "Play (Space)"}
              >
                {playing
                  ? <Pause className="w-3 h-3" />
                  : <Play  className="w-3 h-3 ml-0.5" />}
              </button>

              <button
                onClick={() => setCurrentFrame(f => Math.min(frameCount - 1, f + 1))}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors"
                title="Next frame"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="1,1 7,6 1,11"/>
                  <polygon points="6,1 12,6 6,11"/>
                </svg>
              </button>

              <button
                onClick={() => setCurrentFrame(frameCount - 1)}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors"
                title="Last frame"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="1,1 7.5,6 1,11"/>
                  <rect x="9.5" y="1" width="1.5" height="10" rx="0.4"/>
                </svg>
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={addFrame} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Add frame</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={duplicateFrame} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-white/10 transition-colors">
                    <Copy className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Duplicate frame</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={deleteFrame} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-400 rounded hover:bg-white/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete frame</TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              <button
                onClick={toggleLoop}
                className={`h-5 px-2 rounded text-[10px] font-medium border transition-colors ${
                  activeAnim?.looping
                    ? "bg-indigo-600/30 text-indigo-300 border-indigo-600/50"
                    : "text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                Loop
              </button>

              <span className="text-[10px] text-muted-foreground ml-1">FPS</span>
              <select
                value={activeAnim?.frameRate ?? 24}
                onChange={e => setFps(Number(e.target.value))}
                className="h-5 px-1 text-[10px] bg-muted border border-border rounded text-foreground cursor-pointer"
              >
                {[8, 12, 24, 30, 60].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
