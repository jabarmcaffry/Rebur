import { useState, useRef, useCallback, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GameObject } from "@shared/schema";
import type { AnimationDef, Keyframe, JointDef } from "@/lib/runtime/animation/keyframe-player";
import { loadGLTFAsync } from "@/lib/gltf-loader";
import * as THREE from "three";
import {
  Plus, Trash2, Play, Square, RotateCcw, Copy, Link,
  ChevronDown, ChevronRight, Unlink, Pause, Film, Download,
  Zap, AlertCircle,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2, 9);
}

const TRACKS: { key: keyof Keyframe; label: string; color: string }[] = [
  { key: "px", label: "Position X", color: "#ef4444" },
  { key: "py", label: "Position Y", color: "#f97316" },
  { key: "pz", label: "Position Z", color: "#eab308" },
  { key: "rx", label: "Rotation X", color: "#22c55e" },
  { key: "ry", label: "Rotation Y", color: "#06b6d4" },
  { key: "rz", label: "Rotation Z", color: "#3b82f6" },
  { key: "sx", label: "Scale X",    color: "#a855f7" },
  { key: "sy", label: "Scale Y",    color: "#ec4899" },
  { key: "sz", label: "Scale Z",    color: "#14b8a6" },
];

const JOINT_TYPES = ["fixed", "hinge", "ball", "slider"] as const;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function sampleAnim(anim: AnimationDef, t: number): Partial<Record<keyof Keyframe, number>> {
  const kfs = [...anim.keyframes].sort((a, b) => a.time - b.time);
  if (!kfs.length) return {};
  if (kfs.length === 1) return kfs[0] as any;
  if (t <= kfs[0].time) return kfs[0] as any;
  if (t >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1] as any;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (kfs[i].time <= t && kfs[i + 1].time >= t) {
      const span = kfs[i + 1].time - kfs[i].time;
      const u = span > 0 ? (t - kfs[i].time) / span : 0;
      const out: any = {};
      for (const trk of TRACKS) {
        const lo = (kfs[i] as any)[trk.key];
        const hi = (kfs[i + 1] as any)[trk.key];
        if (lo !== undefined && hi !== undefined) out[trk.key] = lerp(lo, hi, u);
        else if (lo !== undefined) out[trk.key] = lo;
        else if (hi !== undefined) out[trk.key] = hi;
      }
      return out;
    }
  }
  return {};
}

/** Sample a THREE.AnimationClip into flat Keyframe[] for the AnimationEditor. */
function clipToKeyframes(clip: THREE.AnimationClip): Keyframe[] {
  const kfs: Record<number, Keyframe> = {};
  const ensure = (t: number) => {
    if (!kfs[t]) kfs[t] = { id: nanoid(), time: t };
    return kfs[t];
  };

  for (const track of clip.tracks) {
    const name = track.name.toLowerCase();
    // Only handle position/quaternion/scale tracks on root bone/node
    const times = (track as any).times as Float32Array;
    const values = (track as any).values as Float32Array;

    if (name.includes(".position")) {
      for (let i = 0; i < times.length; i++) {
        const kf = ensure(parseFloat(times[i].toFixed(3)));
        kf.px = values[i * 3];
        kf.py = values[i * 3 + 1];
        kf.pz = values[i * 3 + 2];
      }
    } else if (name.includes(".scale")) {
      for (let i = 0; i < times.length; i++) {
        const kf = ensure(parseFloat(times[i].toFixed(3)));
        kf.sx = values[i * 3];
        kf.sy = values[i * 3 + 1];
        kf.sz = values[i * 3 + 2];
      }
    } else if (name.includes(".euler")) {
      for (let i = 0; i < times.length; i++) {
        const kf = ensure(parseFloat(times[i].toFixed(3)));
        kf.rx = values[i * 3] * (180 / Math.PI);
        kf.ry = values[i * 3 + 1] * (180 / Math.PI);
        kf.rz = values[i * 3 + 2] * (180 / Math.PI);
      }
    }
  }

  return Object.values(kfs).sort((a, b) => a.time - b.time);
}

// ─── sub-components ──────────────────────────────────────────────────────────

function ScrubBar({
  duration, currentTime, keyframes, trackKey, color,
  onSeek, onAddKeyframe, onDeleteKeyframe,
}: {
  duration: number; currentTime: number;
  keyframes: Keyframe[]; trackKey: keyof Keyframe; color: string;
  onSeek: (t: number) => void;
  onAddKeyframe: (t: number) => void;
  onDeleteKeyframe: (id: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const tForX = (x: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(duration, ((x - rect.left) / rect.width) * duration));
  };
  const xForT = (t: number) => `${(t / duration) * 100}%`;
  const kfsOnTrack = keyframes.filter(k => (k as any)[trackKey] !== undefined);

  return (
    <div
      ref={barRef}
      className="relative h-8 bg-[#111] rounded cursor-crosshair select-none border border-[#2a2a2a]"
      onClick={e => onSeek(tForX(e.clientX))}
      onDoubleClick={e => { e.stopPropagation(); onAddKeyframe(tForX(e.clientX)); }}
    >
      {[1,2,3,4,5,6,7,8,9].map(i => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-[#222]" style={{ left: `${i * 10}%` }} />
      ))}
      {kfsOnTrack.map(kf => (
        <button
          key={kf.id}
          title={`t=${kf.time.toFixed(2)}s  value=${((kf as any)[trackKey] as number)?.toFixed(3)}\nDouble-click track to add · Right-click to delete`}
          style={{ left: xForT(kf.time), backgroundColor: color }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 rounded-sm z-10 hover:scale-125 transition-transform"
          onClick={e => { e.stopPropagation(); }}
          onContextMenu={e => { e.preventDefault(); onDeleteKeyframe(kf.id); }}
        />
      ))}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-20 pointer-events-none"
        style={{ left: xForT(currentTime) }}
      />
    </div>
  );
}

// ─── GLTF Clips panel ─────────────────────────────────────────────────────────

interface GLTFClipInfo {
  name: string;
  duration: number;
  tracks: number;
}

function GltfClipsPanel({
  selectedObject,
  onImportClip,
}: {
  selectedObject: GameObject;
  onImportClip: (def: AnimationDef) => void;
}) {
  const [clips, setClips] = useState<GLTFClipInfo[]>([]);
  const [rawClips, setRawClips] = useState<THREE.AnimationClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewingClip, setPreviewingClip] = useState<string | null>(null);
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());

  const modelUrl = (selectedObject.properties as any)?.fileUrl as string | undefined;

  useEffect(() => {
    if (!modelUrl) return;
    setLoading(true);
    setError(null);
    loadGLTFAsync(modelUrl)
      .then(({ animations }) => {
        setRawClips(animations);
        setClips(animations.map(c => ({
          name: c.name || "Unnamed",
          duration: parseFloat(c.duration.toFixed(2)),
          tracks: c.tracks.length,
        })));
      })
      .catch(e => setError(e?.message ?? "Failed to load model"))
      .finally(() => setLoading(false));
  }, [modelUrl]);

  const handleImport = (clip: THREE.AnimationClip) => {
    const keyframes = clipToKeyframes(clip);
    const def: AnimationDef = {
      id: nanoid(),
      name: clip.name || "Imported Clip",
      duration: parseFloat(clip.duration.toFixed(2)),
      loop: true,
      autoPlay: false,
      keyframes,
    };
    onImportClip(def);
    setImportedNames(prev => new Set(prev).add(clip.name));
  };

  if (!modelUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
        <Film className="w-8 h-8 text-gray-700" />
        <p className="text-xs text-muted-foreground">
          This object has no model attached. GLTF clips come from uploaded .glb files.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-500">
        <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
        Loading clips…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 px-6 text-center">
        <AlertCircle className="w-6 h-6 text-red-500" />
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
        <Film className="w-8 h-8 text-gray-700" />
        <p className="text-xs text-muted-foreground">
          No animation clips found in this model.
          Export your model from Blender/Maya with embedded actions to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-[#111] shrink-0">
        <p className="text-[10px] text-gray-500">
          {clips.length} clip{clips.length !== 1 ? "s" : ""} embedded in model · Import to edit in the timeline
        </p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[#1a1a1a]">
        {clips.map((clip, i) => {
          const rawClip = rawClips[i];
          const isImported = importedNames.has(clip.name);
          const isPreviewing = previewingClip === clip.name;
          return (
            <div key={clip.name + i} className="px-3 py-2.5 hover:bg-[#111] transition-colors">
              <div className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">{clip.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {clip.duration}s · {clip.tracks} track{clip.tracks !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    title={isPreviewing ? "Stop preview" : "Preview clip"}
                    onClick={() => setPreviewingClip(isPreviewing ? null : clip.name)}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      isPreviewing ? "bg-violet-600 text-white" : "hover:bg-[#222] text-gray-500 hover:text-white"
                    }`}
                  >
                    {isPreviewing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button
                    title={isImported ? "Already imported" : "Import to timeline"}
                    onClick={() => rawClip && handleImport(rawClip)}
                    disabled={isImported}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      isImported
                        ? "text-green-500 cursor-default"
                        : "hover:bg-[#222] text-gray-500 hover:text-violet-400"
                    }`}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {isPreviewing && (
                <div className="mt-2 px-1">
                  <div className="h-1 bg-[#222] rounded overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded animate-pulse"
                      style={{ width: "60%" }}
                    />
                  </div>
                  <p className="text-[10px] text-violet-400 mt-1">
                    Preview active — set <code className="bg-[#1a1a1a] px-1 rounded">playingClip: "{clip.name}"</code> in Properties to use in-game
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
        <p className="text-[10px] text-gray-600">
          Tip: In a script use <code className="text-gray-400">obj.animator.playClip("name")</code> to play any clip.
        </p>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  selectedObject: GameObject | null;
  allObjects: GameObject[];
  gameId: string;
  onObjectUpdate?: (obj: GameObject) => void;
  /** Called whenever the animation scrub head moves — lets the viewport preview the pose. Null = stop preview. */
  onPreviewTransform?: (t: Partial<Record<keyof Keyframe, number>> | null) => void;
}

type EditorTab = "animations" | "gltf-clips" | "joints";

const isModelObject = (obj: GameObject | null) =>
  obj?.type === "model" && !!(obj?.properties as any)?.fileUrl;

export default function AnimationEditor({ selectedObject, allObjects, gameId, onObjectUpdate, onPreviewTransform }: Props) {
  const [tab, setTab] = useState<EditorTab>("animations");
  const [selectedAnimId, setSelectedAnimId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [expandedTracks, setExpandedTracks] = useState<Set<keyof Keyframe>>(new Set());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  const [addJointOpen, setAddJointOpen] = useState(false);
  const [newJointTarget, setNewJointTarget] = useState("");
  const [newJointType, setNewJointType] = useState<JointDef["type"]>("fixed");

  const props = (selectedObject?.properties ?? {}) as Record<string, any>;
  const animations: AnimationDef[] = props.animations ?? [];
  const joints: JointDef[] = props.joints ?? [];
  const selectedAnim = animations.find(a => a.id === selectedAnimId) ?? null;

  // ── persistence ──────────────────────────────────────────────────────────
  const saveProps = useCallback(async (newProps: Record<string, any>) => {
    if (!selectedObject) return;
    const merged = { ...props, ...newProps };
    await apiRequest("PATCH", `/api/objects/${selectedObject.id}`, { properties: merged });
    queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
    if (onObjectUpdate) {
      onObjectUpdate({ ...selectedObject, properties: merged });
    }
  }, [selectedObject, props, gameId, onObjectUpdate]);

  // ── playback ─────────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  useEffect(() => {
    if (!playing || !selectedAnim) { stopPlayback(); return; }
    const tick = (ts: number) => {
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      setCurrentTime(prev => {
        let next = prev + dt;
        if (next >= selectedAnim.duration) {
          if (selectedAnim.loop) next %= selectedAnim.duration;
          else { stopPlayback(); return selectedAnim.duration; }
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, selectedAnim, stopPlayback]);

  // ── live viewport preview ─────────────────────────────────────────────────
  // Whenever the scrub head moves (playing or dragging), push the sampled pose
  // to the editor viewport so the user can see the animation happening live.
  useEffect(() => {
    if (!onPreviewTransform) return;
    if (!selectedAnim || selectedAnim.keyframes.length === 0) {
      onPreviewTransform(null);
      return;
    }
    onPreviewTransform(sampleAnim(selectedAnim, currentTime));
  }, [currentTime, selectedAnim, onPreviewTransform]);

  // Clear preview when the animation editor loses its selection or unmounts.
  useEffect(() => {
    return () => { onPreviewTransform?.(null); };
  }, [selectedObject?.id]);

  // ── animation CRUD ────────────────────────────────────────────────────────
  const addAnimation = () => {
    const id = nanoid();
    const anim: AnimationDef = {
      id, name: `Animation ${animations.length + 1}`, duration: 2, loop: true, autoPlay: false, keyframes: [],
    };
    saveProps({ animations: [...animations, anim] });
    setSelectedAnimId(id);
    setCurrentTime(0);
  };

  const deleteAnimation = (id: string) => {
    saveProps({ animations: animations.filter(a => a.id !== id) });
    if (selectedAnimId === id) setSelectedAnimId(null);
  };

  const updateAnim = (patch: Partial<AnimationDef>) => {
    if (!selectedAnim) return;
    const next = animations.map(a => a.id === selectedAnim.id ? { ...a, ...patch } : a);
    saveProps({ animations: next });
  };

  const importClip = useCallback((def: AnimationDef) => {
    const next = [...animations, def];
    saveProps({ animations: next });
    setSelectedAnimId(def.id);
    setTab("animations");
  }, [animations, saveProps]);

  // ── keyframe CRUD ─────────────────────────────────────────────────────────
  const addKeyframe = (trackKey: keyof Keyframe, time: number) => {
    if (!selectedAnim || !selectedObject) return;
    const t = Math.max(0, Math.min(selectedAnim.duration, time));
    const sample = sampleAnim(selectedAnim, t);
    let defaultVal: number;
    switch (trackKey) {
      case "px": defaultVal = (sample.px as number) ?? (selectedObject.positionX ?? 0); break;
      case "py": defaultVal = (sample.py as number) ?? (selectedObject.positionY ?? 0); break;
      case "pz": defaultVal = (sample.pz as number) ?? (selectedObject.positionZ ?? 0); break;
      case "rx": defaultVal = (sample.rx as number) ?? (selectedObject.rotationX ?? 0); break;
      case "ry": defaultVal = (sample.ry as number) ?? (selectedObject.rotationY ?? 0); break;
      case "rz": defaultVal = (sample.rz as number) ?? (selectedObject.rotationZ ?? 0); break;
      case "sx": defaultVal = (sample.sx as number) ?? (selectedObject.scaleX ?? 1); break;
      case "sy": defaultVal = (sample.sy as number) ?? (selectedObject.scaleY ?? 1); break;
      case "sz": defaultVal = (sample.sz as number) ?? (selectedObject.scaleZ ?? 1); break;
      default: defaultVal = 0;
    }
    const existing = selectedAnim.keyframes.find(k => Math.abs(k.time - t) < 0.01);
    let newKfs: Keyframe[];
    if (existing) {
      newKfs = selectedAnim.keyframes.map(k =>
        k.id === existing.id ? { ...k, [trackKey]: defaultVal } : k
      );
    } else {
      const newKf: Keyframe = { id: nanoid(), time: t, [trackKey]: defaultVal };
      newKfs = [...selectedAnim.keyframes, newKf];
    }
    saveProps({ animations: animations.map(a => a.id === selectedAnim.id ? { ...a, keyframes: newKfs } : a) });
  };

  const deleteKeyframe = (kfId: string) => {
    if (!selectedAnim) return;
    saveProps({
      animations: animations.map(a =>
        a.id === selectedAnim.id ? { ...a, keyframes: a.keyframes.filter(k => k.id !== kfId) } : a
      ),
    });
  };

  const updateKeyframeValue = (kfId: string, trackKey: keyof Keyframe, val: number) => {
    if (!selectedAnim) return;
    saveProps({
      animations: animations.map(a =>
        a.id === selectedAnim.id
          ? { ...a, keyframes: a.keyframes.map(k => k.id === kfId ? { ...k, [trackKey]: val } : k) }
          : a
      ),
    });
  };

  // ── joints CRUD ───────────────────────────────────────────────────────────
  const addJoint = () => {
    if (!newJointTarget) return;
    const j: JointDef = {
      id: nanoid(), name: `Joint ${joints.length + 1}`,
      targetObjectId: newJointTarget, type: newJointType,
      axis: [0, 1, 0], offsetX: 0, offsetY: 0, offsetZ: 0,
    };
    saveProps({ joints: [...joints, j] });
    setAddJointOpen(false);
    setNewJointTarget("");
  };

  const deleteJoint = (id: string) => {
    saveProps({ joints: joints.filter(j => j.id !== id) });
  };

  const updateJoint = (id: string, patch: Partial<JointDef>) => {
    saveProps({ joints: joints.map(j => j.id === id ? { ...j, ...patch } : j) });
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (!selectedObject) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 py-8 text-center">
        Select an object in the hierarchy to edit its animations and joints.
      </div>
    );
  }

  const hasModel = isModelObject(selectedObject);

  return (
    <div className="flex flex-col h-full text-sm overflow-hidden bg-[#0d0d0d]">
      {/* Tab switcher */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setTab("animations")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            tab === "animations" ? "text-white border-b-2 border-violet-500" : "text-muted-foreground hover:text-white"
          }`}
        >
          Keyframes
        </button>
        {hasModel && (
          <button
            onClick={() => setTab("gltf-clips")}
            className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              tab === "gltf-clips" ? "text-white border-b-2 border-violet-500" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Film className="w-3 h-3" />
            Model Clips
          </button>
        )}
        <button
          onClick={() => setTab("joints")}
          className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
            tab === "joints" ? "text-white border-b-2 border-violet-500" : "text-muted-foreground hover:text-white"
          }`}
        >
          Joints
        </button>
      </div>

      {/* ── GLTF CLIPS TAB ──────────────────────────────────────────────── */}
      {tab === "gltf-clips" && (
        <GltfClipsPanel
          selectedObject={selectedObject}
          onImportClip={importClip}
        />
      )}

      {/* ── ANIMATIONS TAB ──────────────────────────────────────────────── */}
      {tab === "animations" && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Animation list + controls */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0 bg-[#111]">
            <select
              value={selectedAnimId ?? ""}
              onChange={e => { setSelectedAnimId(e.target.value || null); setCurrentTime(0); stopPlayback(); }}
              className="flex-1 bg-[#1a1a1a] text-white text-xs rounded px-2 py-1 border border-[#333] outline-none"
            >
              <option value="">— Select animation —</option>
              {animations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button onClick={addAnimation} title="New animation" className="w-6 h-6 rounded bg-violet-600 hover:bg-violet-500 flex items-center justify-center shrink-0">
              <Plus className="w-3.5 h-3.5 text-white" />
            </button>
            {selectedAnim && (
              <button onClick={() => deleteAnimation(selectedAnim.id)} title="Delete animation" className="w-6 h-6 rounded bg-red-900/60 hover:bg-red-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            )}
          </div>

          {!selectedAnim ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-8">
              <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] flex items-center justify-center">
                <Zap className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-xs text-muted-foreground">
                No animation selected. Create a keyframe animation or
                {hasModel ? " import clips from the Model Clips tab." : " add one below."}
              </p>
              <button onClick={addAnimation} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Animation
              </button>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden flex-1">
              {/* Anim settings bar */}
              <div className="flex items-center gap-3 px-2 py-1.5 border-b border-border bg-[#111] shrink-0 flex-wrap">
                <input
                  value={selectedAnim.name}
                  onChange={e => updateAnim({ name: e.target.value })}
                  className="bg-transparent border-b border-[#333] text-white text-xs px-1 outline-none w-28"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Duration</span>
                  <input
                    type="number" min={0.1} max={60} step={0.1}
                    value={selectedAnim.duration}
                    onChange={e => updateAnim({ duration: parseFloat(e.target.value) || 1 })}
                    className="w-12 bg-[#1a1a1a] border border-[#333] rounded px-1 text-white text-xs outline-none"
                  />
                  <span>s</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={selectedAnim.loop} onChange={e => updateAnim({ loop: e.target.checked })} className="accent-violet-500" />
                  <span className="text-muted-foreground">Loop</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={selectedAnim.autoPlay} onChange={e => updateAnim({ autoPlay: e.target.checked })} className="accent-violet-500" />
                  <span className="text-muted-foreground">Auto-play</span>
                </label>
              </div>

              {/* Timeline area */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {/* Time ruler */}
                <div className="sticky top-0 z-20 bg-[#111] border-b border-border px-2 py-1 flex items-center gap-2 shrink-0">
                  <button onClick={() => setCurrentTime(0)} title="Reset" className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#222]">
                    <RotateCcw className="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    onClick={() => setPlaying(p => !p)}
                    className="w-6 h-6 flex items-center justify-center rounded bg-violet-600 hover:bg-violet-500"
                  >
                    {playing ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white" />}
                  </button>
                  <button onClick={stopPlayback} title="Stop" className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#222]">
                    <Square className="w-3 h-3 text-gray-400" />
                  </button>
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {currentTime.toFixed(2)}s / {selectedAnim.duration.toFixed(2)}s
                  </span>
                  <input
                    type="range" min={0} max={selectedAnim.duration} step={0.01}
                    value={currentTime}
                    onChange={e => { stopPlayback(); setCurrentTime(parseFloat(e.target.value)); }}
                    className="flex-1 accent-violet-500"
                  />
                </div>

                {/* Property tracks */}
                {TRACKS.map(trk => {
                  const kfsOnTrack = selectedAnim.keyframes.filter(k => (k as any)[trk.key] !== undefined);
                  const isExpanded = expandedTracks.has(trk.key);
                  const sampleVal = (sampleAnim(selectedAnim, currentTime) as any)[trk.key];

                  return (
                    <div key={trk.key} className="border-b border-[#1a1a1a]">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0d0d0d]">
                        <button
                          onClick={() => setExpandedTracks(s => {
                            const n = new Set(s);
                            n.has(trk.key) ? n.delete(trk.key) : n.add(trk.key);
                            return n;
                          })}
                          className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <div className="w-2.5 h-2.5 rounded-sm rotate-45 shrink-0" style={{ backgroundColor: trk.color }} />
                        <span className="text-xs text-gray-300 w-20 shrink-0">{trk.label}</span>
                        <span className="text-[10px] text-gray-600 font-mono w-16">
                          {sampleVal !== undefined ? sampleVal.toFixed(3) : "—"}
                        </span>
                        <div className="flex-1 pr-1">
                          <ScrubBar
                            duration={selectedAnim.duration}
                            currentTime={currentTime}
                            keyframes={selectedAnim.keyframes}
                            trackKey={trk.key}
                            color={trk.color}
                            onSeek={t => { stopPlayback(); setCurrentTime(t); }}
                            onAddKeyframe={t => addKeyframe(trk.key, t)}
                            onDeleteKeyframe={deleteKeyframe}
                          />
                        </div>
                        <button
                          onClick={() => addKeyframe(trk.key, currentTime)}
                          title="Add keyframe at current time"
                          className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#222] shrink-0"
                          style={{ color: trk.color }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {isExpanded && kfsOnTrack.length > 0 && (
                        <div className="ml-8 divide-y divide-[#1a1a1a]">
                          {kfsOnTrack.sort((a, b) => a.time - b.time).map(kf => (
                            <div key={kf.id} className="flex items-center gap-2 px-2 py-1 bg-[#0a0a0a] hover:bg-[#111]">
                              <span className="text-[10px] text-gray-500 font-mono w-10 shrink-0">{kf.time.toFixed(2)}s</span>
                              <input
                                type="number" step={0.001}
                                value={((kf as any)[trk.key] as number)?.toFixed(3) ?? ""}
                                onChange={e => updateKeyframeValue(kf.id, trk.key, parseFloat(e.target.value) || 0)}
                                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-xs font-mono text-white outline-none focus:border-violet-500/50"
                              />
                              <button onClick={() => { stopPlayback(); setCurrentTime(kf.time); }} title="Jump to time" className="text-gray-600 hover:text-gray-300">
                                <Play className="w-3 h-3" />
                              </button>
                              <button onClick={() => deleteKeyframe(kf.id)} title="Delete keyframe" className="text-gray-700 hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="px-3 py-2 text-[10px] text-gray-700 border-t border-[#1a1a1a]">
                  Double-click a track bar to add a keyframe · Right-click a diamond to delete · Drag the scrubber to preview
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── JOINTS TAB ──────────────────────────────────────────────────── */}
      {tab === "joints" && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#111] shrink-0">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Joints</span>
            <button
              onClick={() => setAddJointOpen(v => !v)}
              className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 text-white text-xs px-2 py-1 rounded-lg transition-colors"
            >
              <Link className="w-3 h-3" /> Add Joint
            </button>
          </div>

          {addJointOpen && (
            <div className="px-3 py-2 bg-[#111] border-b border-border space-y-2 shrink-0">
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-500 mb-1">Target Object</p>
                  <select
                    value={newJointTarget}
                    onChange={e => setNewJointTarget(e.target.value)}
                    className="w-full bg-[#1a1a1a] text-white text-xs rounded px-2 py-1.5 border border-[#333] outline-none"
                  >
                    <option value="">— select —</option>
                    {allObjects
                      .filter(o => o.id !== selectedObject.id && (o.container === "Workspace" || o.container === "Lighting"))
                      .map(o => <option key={o.id} value={o.id}>{o.name}</option>)
                    }
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Type</p>
                  <select
                    value={newJointType}
                    onChange={e => setNewJointType(e.target.value as JointDef["type"])}
                    className="bg-[#1a1a1a] text-white text-xs rounded px-2 py-1.5 border border-[#333] outline-none"
                  >
                    {JOINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addJoint} disabled={!newJointTarget} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg transition-colors">
                  Create Joint
                </button>
                <button onClick={() => setAddJointOpen(false)} className="px-3 text-xs text-gray-400 hover:text-white">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {joints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
                  <Link className="w-5 h-5 text-gray-600" />
                </div>
                <p className="text-xs text-muted-foreground">No joints yet. Add a joint to connect this object to another.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#1a1a1a]">
                {joints.map(j => {
                  const targetObj = allObjects.find(o => o.id === j.targetObjectId);
                  return (
                    <div key={j.id} className="px-3 py-2 hover:bg-[#111]">
                      <div className="flex items-center gap-2 mb-2">
                        <Link className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <input
                          value={j.name}
                          onChange={e => updateJoint(j.id, { name: e.target.value })}
                          className="flex-1 bg-transparent border-b border-[#333] text-white text-xs px-1 outline-none"
                        />
                        <button onClick={() => deleteJoint(j.id)} className="text-gray-700 hover:text-red-400">
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] pl-5">
                        <div className="text-gray-500">Target</div>
                        <div className="text-gray-300 truncate">{targetObj?.name ?? j.targetObjectId}</div>
                        <div className="text-gray-500">Type</div>
                        <select
                          value={j.type}
                          onChange={e => updateJoint(j.id, { type: e.target.value as JointDef["type"] })}
                          className="bg-[#1a1a1a] text-white text-[11px] rounded px-1 border border-[#2a2a2a] outline-none"
                        >
                          {JOINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {j.type !== "fixed" && (
                          <>
                            <div className="text-gray-500">Axis</div>
                            <div className="flex gap-1">
                              {(["x","y","z"] as const).map((ax, i) => (
                                <input
                                  key={ax}
                                  type="number" min={-1} max={1} step={0.1}
                                  value={(j.axis as number[])[i]}
                                  onChange={e => {
                                    const a = [...(j.axis as number[])] as [number,number,number];
                                    a[i] = parseFloat(e.target.value) || 0;
                                    updateJoint(j.id, { axis: a });
                                  }}
                                  className="w-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 text-white text-[10px] outline-none"
                                  placeholder={ax.toUpperCase()}
                                />
                              ))}
                            </div>
                          </>
                        )}
                        <div className="text-gray-500">Offset</div>
                        <div className="flex gap-1">
                          {(["offsetX","offsetY","offsetZ"] as const).map((k, i) => (
                            <input
                              key={k}
                              type="number" step={0.1}
                              value={(j as any)[k] ?? 0}
                              onChange={e => updateJoint(j.id, { [k]: parseFloat(e.target.value) || 0 })}
                              className="w-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 text-white text-[10px] outline-none"
                              placeholder={["X","Y","Z"][i]}
                            />
                          ))}
                        </div>
                        {(j.type === "hinge" || j.type === "slider") && (
                          <>
                            <div className="text-gray-500">Min angle</div>
                            <input
                              type="number" step={1}
                              value={(j as any).minAngle ?? -180}
                              onChange={e => updateJoint(j.id, { minAngle: parseFloat(e.target.value) } as any)}
                              className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 text-white text-[11px] outline-none"
                            />
                            <div className="text-gray-500">Max angle</div>
                            <input
                              type="number" step={1}
                              value={(j as any).maxAngle ?? 180}
                              onChange={e => updateJoint(j.id, { maxAngle: parseFloat(e.target.value) } as any)}
                              className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 text-white text-[11px] outline-none"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
