const KEY = "rebur_avatar_config";

export interface AvatarConfig {
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
}

const DEFAULTS: AvatarConfig = {
  skinColor: "#ffdbac",
  shirtColor: "#2b7a6e",
  pantsColor: "#2c3e50",
};

export function getAvatarConfig(): AvatarConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function saveAvatarConfig(config: AvatarConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config));
}
