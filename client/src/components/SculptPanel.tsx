/**
 * SculptPanel — basic vertex-displacement sculpting for primitive meshes.
 *
 * Works by storing a displacement map (noise/wave settings + per-axis push values)
 * in the object's `properties.sculpt` field, then applying them in the 3D viewport
 * via a SculptedMesh component that deforms geometry at render time.
 *
 * Limitations:
 *   - Only works on primitive types (cube, sphere, cylinder, plane).
 *   - GLB models are unaffected (GLTF geometry is managed by Three.js / the GLTF loader).
 *   - "Sculpt" here is parametric (noise fields), not brush-based.
 *     True per-vertex brush sculpting would require a custom R3F raycaster loop.
 */

import { useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GameObject } from "@shared/schema";
import { Waves, RefreshCw, Sliders } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

export interface SculptDef {
  /** 0 = no displacement, 1 = full */
  noiseStrength: number;
  /** frequency of the noise pattern (higher = tighter ripples) */
  noiseScale: number;
  /** axis-aligned push in world-space units */
  pushX: number;
  pushY: number;
  pushZ: number;
  /** inflate / deflate all vertices along their normals */
  inflate: number;
  /** smooth / round the silhouette (0 = no change, 1 = max round) */
  smooth: number;
  /** wave ripple amplitude (0 = none) */
  waveAmplitude: number;
  /** wave frequency */
  waveFrequency: number;
}

const DEFAULT_SCULPT: SculptDef = {
  noiseStrength: 0,
  noiseScale: 1,
  pushX: 0,
  pushY: 0,
  pushZ: 0,
  inflate: 0,
  smooth: 0,
  waveAmplitude: 0,
  waveFrequency: 1,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function Row({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[11px] text-gray-400 w-28 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-violet-500 h-1"
      />
      <input
        type="number" min={min} max={max} step={step}
        value={value.toFixed(step < 0.1 ? 3 : 2)}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500/50"
      />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  selectedObject: GameObject | null;
  gameId: string;
  onObjectUpdate?: (obj: GameObject) => void;
}

export default function SculptPanel({ selectedObject, gameId, onObjectUpdate }: Props) {
  const isPrimitive =
    selectedObject &&
    selectedObject.type !== "model" &&
    selectedObject.type !== "light" &&
    selectedObject.type !== "audio" &&
    selectedObject.type !== "folder";

  const sculpt: SculptDef = {
    ...DEFAULT_SCULPT,
    ...((selectedObject?.properties as any)?.sculpt ?? {}),
  };

  const save = useCallback(async (patch: Partial<SculptDef>) => {
    if (!selectedObject) return;
    const next = { ...sculpt, ...patch };
    const existing = (selectedObject.properties ?? {}) as Record<string, unknown>;
    const merged = { ...existing, sculpt: next };
    await apiRequest("PATCH", `/api/objects/${selectedObject.id}`, { properties: merged });
    queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
    if (onObjectUpdate) onObjectUpdate({ ...selectedObject, properties: merged as any });
  }, [selectedObject, sculpt, gameId, onObjectUpdate]);

  const reset = useCallback(async () => {
    if (!selectedObject) return;
    const existing = (selectedObject.properties ?? {}) as Record<string, unknown>;
    const merged = { ...existing, sculpt: DEFAULT_SCULPT };
    await apiRequest("PATCH", `/api/objects/${selectedObject.id}`, { properties: merged });
    queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
    if (onObjectUpdate) onObjectUpdate({ ...selectedObject, properties: merged as any });
  }, [selectedObject, gameId, onObjectUpdate]);

  if (!selectedObject) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        Select an object to sculpt it.
      </div>
    );
  }

  if (!isPrimitive) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
        <Waves className="w-7 h-7 text-gray-700" />
        <p className="text-xs text-muted-foreground">
          Sculpt displacement works on primitive shapes (cube, sphere, cylinder, plane).
          For imported models, edit the mesh in your 3D app (Blender, Maya, etc.) and re-upload.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium text-white">Displacement</span>
        </div>
        <button
          onClick={reset}
          title="Reset all sculpt values"
          className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Reset
        </button>
      </div>

      <div className="px-3 py-1 space-y-0.5">
        {/* Inflate / Deflate */}
        <p className="text-[10px] text-gray-600 pt-1 pb-0.5 uppercase tracking-widest">Shape</p>
        <Row label="Inflate" value={sculpt.inflate} min={-1} max={1} step={0.01}
          onChange={v => save({ inflate: v })} />
        <Row label="Smooth" value={sculpt.smooth} min={0} max={1} step={0.01}
          onChange={v => save({ smooth: v })} />

        {/* Axis push */}
        <p className="text-[10px] text-gray-600 pt-2 pb-0.5 uppercase tracking-widest">Push / Pull</p>
        <Row label="Push X" value={sculpt.pushX} min={-2} max={2} step={0.01}
          onChange={v => save({ pushX: v })} />
        <Row label="Push Y" value={sculpt.pushY} min={-2} max={2} step={0.01}
          onChange={v => save({ pushY: v })} />
        <Row label="Push Z" value={sculpt.pushZ} min={-2} max={2} step={0.01}
          onChange={v => save({ pushZ: v })} />

        {/* Noise */}
        <p className="text-[10px] text-gray-600 pt-2 pb-0.5 uppercase tracking-widest">Surface Noise</p>
        <Row label="Strength" value={sculpt.noiseStrength} min={0} max={1} step={0.01}
          onChange={v => save({ noiseStrength: v })} />
        <Row label="Scale" value={sculpt.noiseScale} min={0.1} max={10} step={0.1}
          onChange={v => save({ noiseScale: v })} />

        {/* Wave */}
        <p className="text-[10px] text-gray-600 pt-2 pb-0.5 uppercase tracking-widest">Wave Ripple</p>
        <Row label="Amplitude" value={sculpt.waveAmplitude} min={0} max={1} step={0.01}
          onChange={v => save({ waveAmplitude: v })} />
        <Row label="Frequency" value={sculpt.waveFrequency} min={0.1} max={20} step={0.1}
          onChange={v => save({ waveFrequency: v })} />
      </div>

      <div className="px-3 py-2 mt-1 border-t border-[#1a1a1a]">
        <p className="text-[10px] text-gray-600">
          Displacement is applied per-vertex in the viewport. Increase subdivisions via scale
          for more detail — higher-resolution geometry reacts more smoothly.
        </p>
      </div>
    </div>
  );
}
