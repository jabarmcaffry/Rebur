interface AvatarPortraitProps {
  skinColor?: string;
  shirtColor?: string;
  size?: number;
  className?: string;
}

export default function AvatarPortrait({
  skinColor = "#ffdbac",
  shirtColor = "#2b7a6e",
  size = 72,
  className = "",
}: AvatarPortraitProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "50%", overflow: "hidden", display: "block" }}
    >
      {/* Dark background fill */}
      <circle cx="50" cy="50" r="50" fill="#111" />

      {/* Shirt body — fills lower 60% */}
      <ellipse cx="50" cy="105" rx="48" ry="36" fill={shirtColor} />
      {/* Left shoulder */}
      <ellipse cx="12" cy="82" rx="20" ry="16" fill={shirtColor} />
      {/* Right shoulder */}
      <ellipse cx="88" cy="82" rx="20" ry="16" fill={shirtColor} />
      {/* Torso fill (overlap to smooth) */}
      <rect x="22" y="76" width="56" height="30" fill={shirtColor} />

      {/* Neck */}
      <ellipse cx="50" cy="68" rx="8" ry="10" fill={skinColor} />

      {/* Head */}
      <circle cx="50" cy="50" r="22" fill={skinColor} />

      {/* Hair cap (dark rounded top) */}
      <ellipse cx="50" cy="34" rx="22" ry="14" fill="#2a1a10" />
      <rect x="28" y="34" width="44" height="8" fill="#2a1a10" />
    </svg>
  );
}

/** Friend portrait with preset colors based on name hash */
const FRIEND_COMBOS = [
  { skin: "#f5c5a3", shirt: "#e11d48" },
  { skin: "#d4a76a", shirt: "#ea580c" },
  { skin: "#ffdbac", shirt: "#0d9488" },
  { skin: "#c68642", shirt: "#3b82f6" },
  { skin: "#f5c5a3", shirt: "#7c3aed" },
  { skin: "#8d5524", shirt: "#16a34a" },
];

export function FriendPortrait({ name, size = 72 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % FRIEND_COMBOS.length;
  const { skin, shirt } = FRIEND_COMBOS[idx];
  return <AvatarPortrait skinColor={skin} shirtColor={shirt} size={size} />;
}
