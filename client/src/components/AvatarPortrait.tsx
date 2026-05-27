interface AvatarPortraitProps {
  skinColor?: string;
  shirtColor?: string;
  pantsColor?: string;
  size?: number;
  className?: string;
}

export default function AvatarPortrait({
  skinColor = "#ffdbac",
  shirtColor = "#2b7a6e",
  pantsColor = "#374151",
  size = 72,
  className = "",
}: AvatarPortraitProps) {
  const hairColor = "#2a1a10";

  return (
    <svg
      viewBox="0 0 100 110"
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`bgGrad-${size}`} cx="50%" cy="60%" r="70%">
          <stop offset="0%" stopColor="#1e1e2e" />
          <stop offset="100%" stopColor="#0d0d14" />
        </radialGradient>
        <radialGradient id={`skinShade-${size}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
        </radialGradient>
        <radialGradient id={`shirtShade-${size}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </radialGradient>
        <clipPath id={`circle-${size}`}>
          <circle cx="50" cy="55" r="50" />
        </clipPath>
      </defs>

      {/* Background */}
      <circle cx="50" cy="55" r="50" fill={`url(#bgGrad-${size})`} />

      {/* Pants / lower body (peeking at very bottom) */}
      <rect x="30" y="98" width="40" height="14" rx="3" fill={pantsColor} clipPath={`url(#circle-${size})`} />

      {/* Left arm */}
      <ellipse cx="17" cy="84" rx="11" ry="18" fill={shirtColor} clipPath={`url(#circle-${size})`} />
      {/* Right arm */}
      <ellipse cx="83" cy="84" rx="11" ry="18" fill={shirtColor} clipPath={`url(#circle-${size})`} />

      {/* Torso */}
      <rect x="29" y="70" width="42" height="34" rx="4" fill={shirtColor} clipPath={`url(#circle-${size})`} />
      {/* Shoulder caps */}
      <ellipse cx="30" cy="73" rx="13" ry="9" fill={shirtColor} clipPath={`url(#circle-${size})`} />
      <ellipse cx="70" cy="73" rx="13" ry="9" fill={shirtColor} clipPath={`url(#circle-${size})`} />
      {/* Shirt shading for depth */}
      <rect x="29" y="70" width="42" height="34" rx="4" fill={`url(#shirtShade-${size})`} clipPath={`url(#circle-${size})`} />

      {/* Neck */}
      <rect x="43" y="63" width="14" height="10" rx="3" fill={skinColor} />

      {/* Head */}
      <ellipse cx="50" cy="47" rx="21" ry="23" fill={skinColor} />
      {/* Skin shading */}
      <ellipse cx="50" cy="47" rx="21" ry="23" fill={`url(#skinShade-${size})`} />

      {/* Hair — top cap */}
      <ellipse cx="50" cy="30" rx="21" ry="13" fill={hairColor} />
      <rect x="29" y="30" width="42" height="10" fill={hairColor} />
      {/* Side hair */}
      <ellipse cx="30" cy="41" rx="5" ry="9" fill={hairColor} />
      <ellipse cx="70" cy="41" rx="5" ry="9" fill={hairColor} />

      {/* Eyes — whites */}
      <ellipse cx="43" cy="48" rx="3.5" ry="3" fill="white" />
      <ellipse cx="57" cy="48" rx="3.5" ry="3" fill="white" />
      {/* Irises */}
      <circle cx="43.5" cy="49" r="2" fill="#3d2b1f" />
      <circle cx="57.5" cy="49" r="2" fill="#3d2b1f" />
      {/* Pupils */}
      <circle cx="43.5" cy="49" r="1" fill="#1a0f07" />
      <circle cx="57.5" cy="49" r="1" fill="#1a0f07" />
      {/* Eye shine */}
      <circle cx="44.2" cy="48.2" r="0.7" fill="rgba(255,255,255,0.9)" />
      <circle cx="58.2" cy="48.2" r="0.7" fill="rgba(255,255,255,0.9)" />

      {/* Nose (subtle) */}
      <ellipse cx="50" cy="54" rx="2" ry="1.3" fill="rgba(0,0,0,0.12)" />

      {/* Mouth */}
      <path d="M45.5 59.5 Q50 63.5 54.5 59.5" stroke={hairColor} strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Subtle vignette ring */}
      <circle cx="50" cy="55" r="50" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="6" />
    </svg>
  );
}

/** Colored initial circle for friends/leaderboard */
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
