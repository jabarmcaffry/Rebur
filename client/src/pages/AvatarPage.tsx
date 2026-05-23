import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import StaticAvatarPreview from "@/components/StaticAvatarPreview";
import { getAvatarConfig, saveAvatarConfig } from "@/lib/avatarConfig";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronRight } from "lucide-react";

const SKIN_PRESETS = [
  { label: "Light", value: "#ffe0bd" },
  { label: "Warm", value: "#ffdbac" },
  { label: "Tan", value: "#d4a76a" },
  { label: "Medium", value: "#c68642" },
  { label: "Dark", value: "#8d5524" },
  { label: "Deep", value: "#4a2912" },
];

const SHIRT_PRESETS = [
  { label: "Teal", value: "#2b7a6e" },
  { label: "Crimson", value: "#c0392b" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Navy", value: "#1e3a5f" },
  { label: "Slate", value: "#475569" },
  { label: "Forest", value: "#166534" },
  { label: "Rose", value: "#be185d" },
  { label: "Amber", value: "#b45309" },
];

const PANTS_PRESETS = [
  { label: "Charcoal", value: "#2c3e50" },
  { label: "Black", value: "#111827" },
  { label: "Navy", value: "#1e3a5f" },
  { label: "Khaki", value: "#7c6d54" },
  { label: "Olive", value: "#4d5a2e" },
  { label: "Maroon", value: "#5b1a2e" },
];

function ColorPicker({ label, value, presets, onChange }: {
  label: string;
  value: string;
  presets: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border border-white/20" style={{ background: value }} />
          <span className="text-xs text-gray-400 font-mono">{value}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            title={p.label}
            className="relative w-9 h-9 rounded-full border-2 transition-all"
            style={{
              background: p.value,
              borderColor: value === p.value ? "white" : "transparent",
            }}
          >
            {value === p.value && (
              <Check className="w-3 h-3 text-white absolute inset-0 m-auto drop-shadow" />
            )}
          </button>
        ))}
        <label className="w-9 h-9 rounded-full border-2 border-[#333] flex items-center justify-center cursor-pointer hover:border-violet-500 transition-colors" title="Custom color">
          <span className="text-[10px] text-gray-400">+</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}

export default function AvatarPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState(getAvatarConfig());

  const update = (key: keyof typeof config) => (value: string) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const handleSave = () => {
    saveAvatarConfig(config);
    toast({ title: "Avatar saved!", description: "Your look will appear in all experiences." });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-4">
        <h1 className="text-2xl font-bold">My Avatar</h1>
        <p className="text-sm text-gray-400 mt-0.5">Customize how you look in all experiences</p>
      </div>

      {/* 3D Preview */}
      <div className="h-72 bg-gradient-to-b from-[#111] to-[#0a0a0a] relative">
        <StaticAvatarPreview
          skinColor={config.skinColor}
          shirtColor={config.shirtColor}
          pantsColor={config.pantsColor}
        />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 rounded-full text-xs text-gray-400">
          Drag to rotate
        </div>
      </div>

      {/* Customization */}
      <div className="px-4 pt-6">
        <div className="bg-[#141414] rounded-2xl p-4 border border-[#222]">
          <ColorPicker
            label="Skin Tone"
            value={config.skinColor}
            presets={SKIN_PRESETS}
            onChange={update("skinColor")}
          />
          <ColorPicker
            label="Shirt Color"
            value={config.shirtColor}
            presets={SHIRT_PRESETS}
            onChange={update("shirtColor")}
          />
          <ColorPicker
            label="Pants Color"
            value={config.pantsColor}
            presets={PANTS_PRESETS}
            onChange={update("pantsColor")}
          />
        </div>

        {/* Coming soon section */}
        <div className="mt-4 space-y-2">
          {["Hair & Face", "Accessories", "Emotes"].map((item) => (
            <div key={item} className="flex items-center justify-between bg-[#141414] rounded-xl p-4 border border-[#222]">
              <span className="text-sm font-medium">{item}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 bg-[#222] px-2 py-0.5 rounded-full">Coming soon</span>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </div>
            </div>
          ))}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-base hover:from-violet-500 hover:to-indigo-500 transition-all active:scale-[0.98]"
        >
          Save Avatar
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
