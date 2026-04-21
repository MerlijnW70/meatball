/**
 * Gehaktbal SVG logo — fotografische look met radial gradient shading,
 * specular highlight, rim shadow en peper-specks. Scherp op elke grootte.
 * Instance-unieke gradient IDs zodat meerdere logo's op één pagina
 * niet elkaar's fills overschrijven.
 */
import { useId } from "react";

interface Props {
  size?: number;
  className?: string;
}

export function GehaktbalLogo({ size = 32, className = "" }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradBody = `gb-body-${uid}`;
  const gradShine = `gb-shine-${uid}`;
  const gradRim = `gb-rim-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
      role="presentation"
    >
      <defs>
        {/* Hoofdgradient: lichte top-left, donkere bottom-right — volume-suggestie */}
        <radialGradient id={gradBody} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#C88456" />
          <stop offset="35%" stopColor="#8B4A23" />
          <stop offset="72%" stopColor="#5A2D12" />
          <stop offset="100%" stopColor="#2E1608" />
        </radialGradient>

        {/* Shine: klein fel crème hotspot */}
        <radialGradient id={gradShine} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF3D6" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#FFE4A8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFE4A8" stopOpacity="0" />
        </radialGradient>

        {/* Rim: warme glow aan de onderrand (bounce-light) */}
        <radialGradient id={gradRim} cx="50%" cy="85%" r="60%">
          <stop offset="0%" stopColor="#9E5630" stopOpacity="0" />
          <stop offset="80%" stopColor="#9E5630" stopOpacity="0" />
          <stop offset="100%" stopColor="#C77344" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* Basis-bol met gradient */}
      <circle
        cx="32" cy="32" r="28"
        fill={`url(#${gradBody})`}
        stroke="#111111"
        strokeWidth="3.5"
      />

      {/* Rim-light (warm bounce op onderrand) */}
      <circle
        cx="32" cy="32" r="28"
        fill={`url(#${gradRim})`}
      />

      {/* Specular shine hotspot (links-boven) */}
      <ellipse
        cx="22" cy="19" rx="9" ry="5.5"
        fill={`url(#${gradShine})`}
      />

      {/* Kleine scherpe highlight in hotspot */}
      <ellipse cx="20" cy="17" rx="3" ry="1.4" fill="#FFFFFF" opacity="0.75" />

      {/* Peper-specks — verspreid, verschillend formaat, lichte schaduw voor diepte */}
      <g fill="#0D0702">
        <circle cx="40" cy="38" r="1.8" />
        <circle cx="30" cy="44" r="1.5" />
        <circle cx="20" cy="37" r="1.3" />
        <circle cx="45" cy="28" r="1.2" />
        <circle cx="36" cy="23" r="1.0" />
        <circle cx="28" cy="34" r="1.1" />
        <circle cx="15" cy="32" r="0.9" />
        <circle cx="42" cy="46" r="0.9" />
      </g>
      <g fill="#8A4A20" opacity="0.55">
        {/* subtle spec-shadows voor depth */}
        <circle cx="40.5" cy="39" r="1.8" />
        <circle cx="30.5" cy="45" r="1.5" />
        <circle cx="20.5" cy="38" r="1.3" />
      </g>

      {/* Bottom-contact shadow (zachtste donkere rand) */}
      <path
        d="M 12 42 Q 20 58 32 58 Q 44 58 52 42"
        fill="none"
        stroke="#1A0B04"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
