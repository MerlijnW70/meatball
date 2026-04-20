import {
  ALLOWED_AVATAR_COLORS, ALLOWED_AVATAR_ICONS, ALLOWED_AVATAR_PATTERNS,
  ALLOWED_AVATAR_ACCENT_COLORS, ALLOWED_AVATAR_ACCENT_POSITIONS,
  ALLOWED_AVATAR_ROTATIONS,
} from "../types";

/** FNV-1a 32-bit hash — gelijk aan server-side `default_avatar_for`. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface AvatarSpec {
  color: string;
  icon: string;
  pattern: string;
  accent: string;     // "none" of "{color}-{tl|tr|bl|br}"
  rotation: string;   // "0" | "90" | "180" | "270"
}

export function parseDecor(decor: string): {
  pattern: string; accent: string; rotation: string;
} {
  const [pattern = "none", accent = "none", rotation = "0"] = decor.split("|");
  return { pattern, accent, rotation };
}

export const formatDecor = (s: Pick<AvatarSpec, "pattern" | "accent" | "rotation">) =>
  `${s.pattern}|${s.accent}|${s.rotation}`;

/** Volledig bepaald avatar uit screenname-key — zelfde algoritme als server. */
export function defaultAvatarFor(rawName: string): AvatarSpec {
  const key = rawName.trim().toLowerCase();
  if (!key) return { color: "pop", icon: "🥩", pattern: "none", accent: "none", rotation: "0" };
  const h = fnv1a(key);
  const color = ALLOWED_AVATAR_COLORS[h % ALLOWED_AVATAR_COLORS.length];
  const icon  = ALLOWED_AVATAR_ICONS[((h >>> 8) >>> 0) % ALLOWED_AVATAR_ICONS.length];
  const pattern = ALLOWED_AVATAR_PATTERNS[((h >>> 16) >>> 0) % ALLOWED_AVATAR_PATTERNS.length];
  const accentC = ALLOWED_AVATAR_ACCENT_COLORS[((h >>> 20) >>> 0) % ALLOWED_AVATAR_ACCENT_COLORS.length];
  const accentP = ALLOWED_AVATAR_ACCENT_POSITIONS[((h >>> 22) >>> 0) % ALLOWED_AVATAR_ACCENT_POSITIONS.length];
  const rotation = ALLOWED_AVATAR_ROTATIONS[((h >>> 24) >>> 0) % ALLOWED_AVATAR_ROTATIONS.length];
  const accent = (h % 4) === 0 ? "none" : `${accentC}-${accentP}`;
  return { color, icon, pattern, accent, rotation };
}

/** Volledig random avatar (bv. voor 🎲-knop). */
export function randomAvatar(): AvatarSpec {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const wantAccent = Math.random() > 0.25;
  return {
    color: pick(ALLOWED_AVATAR_COLORS),
    icon: pick(ALLOWED_AVATAR_ICONS),
    pattern: pick(ALLOWED_AVATAR_PATTERNS),
    accent: wantAccent
      ? `${pick(ALLOWED_AVATAR_ACCENT_COLORS)}-${pick(ALLOWED_AVATAR_ACCENT_POSITIONS)}`
      : "none",
    rotation: pick(ALLOWED_AVATAR_ROTATIONS),
  };
}

export const TONE_BG: Record<string, string> = {
  pop:    "bg-pop",
  hot:    "bg-hot",
  mint:   "bg-mint",
  sky:    "bg-sky",
  bruise: "bg-bruise",
  ink:    "bg-ink",
  paper:  "bg-paper",
  lime:   "bg-[#C7F25E]",
};

export const TONE_FG: Record<string, string> = {
  pop:    "text-ink",
  hot:    "text-paper",
  mint:   "text-ink",
  sky:    "text-paper",
  bruise: "text-ink",
  ink:    "text-paper",
  paper:  "text-ink",
  lime:   "text-ink",
};

export const ACCENT_BG: Record<string, string> = {
  pop: "bg-pop", hot: "bg-hot", mint: "bg-mint",
  sky: "bg-sky", bruise: "bg-bruise", ink: "bg-ink",
};

/** Kant-en-klare CSS background-image string voor een patroon. */
export function patternStyle(pattern: string, scale: number): React.CSSProperties {
  const px = (n: number) => `${n * scale}px`;
  switch (pattern) {
    case "stripes-h":
      return {
        backgroundImage: `repeating-linear-gradient(0deg, rgba(10,10,10,0.18) 0 ${px(2)}, transparent ${px(2)} ${px(6)})`,
      };
    case "stripes-v":
      return {
        backgroundImage: `repeating-linear-gradient(90deg, rgba(10,10,10,0.18) 0 ${px(2)}, transparent ${px(2)} ${px(6)})`,
      };
    case "dots":
      return {
        backgroundImage: `radial-gradient(rgba(10,10,10,0.25) ${px(1.5)}, transparent ${px(1.5)})`,
        backgroundSize: `${px(8)} ${px(8)}`,
      };
    case "grid":
      return {
        backgroundImage:
          `linear-gradient(0deg, rgba(10,10,10,0.18) ${px(1)}, transparent ${px(1)}),` +
          `linear-gradient(90deg, rgba(10,10,10,0.18) ${px(1)}, transparent ${px(1)})`,
        backgroundSize: `${px(8)} ${px(8)}`,
      };
    case "checker":
      return {
        backgroundImage:
          `linear-gradient(45deg, rgba(10,10,10,0.18) 25%, transparent 25%, transparent 75%, rgba(10,10,10,0.18) 75%)`,
        backgroundSize: `${px(8)} ${px(8)}`,
      };
    default: return {};
  }
}
