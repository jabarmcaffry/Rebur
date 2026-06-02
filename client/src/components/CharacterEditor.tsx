import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { User, Shirt, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JOINT_NAMES, JOINT_LABEL, JOINT_COLOR } from "@/lib/character-types";

// ─── Colour presets ───────────────────────────────────────────────────────────

const SKIN_PRESETS = ["#FDDBB4", "#F0C27F", "#C68642", "#8D5524", "#4A2912"];
const SHIRT_PRESETS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#1e293b", "#e5e7eb"];
const PANTS_PRESETS = ["#1e293b", "#374151", "#92400e", "#1d4ed8", "#064e3b", "#7c3aed"];

// ─── Static avatar preview inside a Canvas ───────────────────────────────────

function AvatarPreview({ skinColor, shirtColor, pantsColor }: { skinColor: string; shirtColor: string; pantsColor: string }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={0.9} />
      <directionalLight position={[-2, 2, -2]} intensity={0.2} />

      {/* Character rig (static T-pose) */}
      <group position={[0, 1.8, 0]}>
        {/* Torso / shirt */}
        <mesh castShadow>
          <boxGeometry args={[0.9, 1.2, 0.5]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.3, 20, 16]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.09, 1.0, 0.28]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.09, 1.0, 0.28]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>

        {/* Left arm */}
        <group position={[-0.6, 0.4, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.6, 12]} />
            <meshStandardMaterial color={shirtColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.85, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.1, 0.5, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
        </group>

        {/* Right arm */}
        <group position={[0.6, 0.4, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.6, 12]} />
            <meshStandardMaterial color={shirtColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.85, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.1, 0.5, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
        </group>

        {/* Left leg */}
        <group position={[-0.25, -0.6, 0]}>
          <mesh position={[0, -0.325, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.65, 12]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.925, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.13, 0.55, 12]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
        </group>

        {/* Right leg */}
        <group position={[0.25, -0.6, 0]}>
          <mesh position={[0, -0.325, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.65, 12]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.925, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.13, 0.55, 12]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
        </group>
      </group>

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#111111" />
      </mesh>

      <OrbitControls makeDefault target={[0, 1.5, 0]} minDistance={2} maxDistance={7} />
    </>
  );
}

// ─── Colour swatch picker ─────────────────────────────────────────────────────

function SwatchRow({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: string[];
  onChange: (c: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-5 rounded border border-[#333] cursor-pointer bg-transparent"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${
              value === c ? "border-white scale-110" : "border-transparent"
            }`}
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Body part list ───────────────────────────────────────────────────────────

const BODY_PARTS = [
  { id: "head", label: "Head", icon: "🟡" },
  { id: "torso", label: "Torso", icon: "⬜" },
  { id: "leftUpperArm", label: "L. Upper Arm", icon: "🔵" },
  { id: "leftLowerArm", label: "L. Lower Arm", icon: "🔵" },
  { id: "rightUpperArm", label: "R. Upper Arm", icon: "🔴" },
  { id: "rightLowerArm", label: "R. Lower Arm", icon: "🔴" },
  { id: "leftUpperLeg", label: "L. Upper Leg", icon: "🟢" },
  { id: "leftLowerLeg", label: "L. Lower Leg", icon: "🟢" },
  { id: "rightUpperLeg", label: "R. Upper Leg", icon: "🟣" },
  { id: "rightLowerLeg", label: "R. Lower Leg", icon: "🟣" },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

const CONFIG_KEY = "rebur_char_config_v1";

interface CharConfig {
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
}

function loadConfig(): CharConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { skinColor: "#FDDBB4", shirtColor: "#3b82f6", pantsColor: "#1e293b" };
}

function saveConfig(cfg: CharConfig) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CharacterEditor() {
  const [config, setConfig] = useState<CharConfig>(loadConfig);
  const [activeSection, setActiveSection] = useState<"appearance" | "rig">("appearance");

  const update = (patch: Partial<CharConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
  };

  const reset = () => {
    const def: CharConfig = { skinColor: "#FDDBB4", shirtColor: "#3b82f6", pantsColor: "#1e293b" };
    setConfig(def);
    saveConfig(def);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: 3D preview */}
      <div className="flex-1 bg-[#0a0a0a] relative min-w-0">
        <Canvas
          shadows
          camera={{ position: [0, 2, 4.5], fov: 45 }}
          className="w-full h-full"
        >
          <AvatarPreview {...config} />
        </Canvas>
        <div className="absolute top-2 left-2 bg-black/60 text-white/60 text-[9px] px-2 py-0.5 rounded pointer-events-none uppercase tracking-wide">
          Character Preview — T-Pose
        </div>
      </div>

      {/* Right: Controls */}
      <div className="w-64 shrink-0 border-l border-border bg-[#0d0d0d] flex flex-col">
        {/* Section tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveSection("appearance")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${
              activeSection === "appearance" ? "text-foreground border-b-2 border-indigo-500" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shirt className="w-3.5 h-3.5" /> Appearance
          </button>
          <button
            onClick={() => setActiveSection("rig")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${
              activeSection === "rig" ? "text-foreground border-b-2 border-indigo-500" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Rig Parts
          </button>
        </div>

        <ScrollArea className="flex-1">
          {activeSection === "appearance" ? (
            <div className="p-3">
              <SwatchRow
                label="Skin"
                value={config.skinColor}
                presets={SKIN_PRESETS}
                onChange={(c) => update({ skinColor: c })}
              />
              <SwatchRow
                label="Shirt"
                value={config.shirtColor}
                presets={SHIRT_PRESETS}
                onChange={(c) => update({ shirtColor: c })}
              />
              <SwatchRow
                label="Pants"
                value={config.pantsColor}
                presets={PANTS_PRESETS}
                onChange={(c) => update({ pantsColor: c })}
              />
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-muted-foreground text-xs"
                onClick={reset}
              >
                <RefreshCw className="w-3 h-3 mr-1.5" /> Reset defaults
              </Button>
            </div>
          ) : (
            <div className="p-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1 py-1.5">
                Body Parts Hierarchy
              </div>
              {BODY_PARTS.map((part) => (
                <div
                  key={part.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors cursor-default"
                >
                  <span className="text-[10px]">{part.icon}</span>
                  <span>{part.label}</span>
                </div>
              ))}
              <div className="mt-3 px-2 py-2 rounded-md bg-indigo-950/30 border border-indigo-800/30 text-[10px] text-indigo-300/70 leading-relaxed">
                Motor6D joints and attachment points are defined in the Animate tab. Custom model upload coming soon.
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="px-3 py-2 border-t border-border shrink-0 text-[9px] text-muted-foreground/50 text-center">
          Colors auto-saved · Applied in Play Mode
        </div>
      </div>
    </div>
  );
}
