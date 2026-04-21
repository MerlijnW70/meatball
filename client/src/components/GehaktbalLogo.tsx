/**
 * Gehaktbal SVG logo — warme bruine bol met peper-specks + shine.
 * Brutalistische stijl: dikke ink-rand past bij de rest van de app.
 * Schaalt netjes op elke grootte via de `size` prop.
 */
interface Props {
  size?: number;
  className?: string;
}

export function GehaktbalLogo({ size = 32, className = "" }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden
      role="presentation"
    >
      {/* Base sphere — warm brown */}
      <circle
        cx="24" cy="24" r="20"
        fill="#6B3A1F"
        stroke="#111111"
        strokeWidth="3"
      />

      {/* Subtiele top-light arc — lichter bruin */}
      <path
        d="M 8 20 Q 12 10 24 8 Q 36 10 40 20"
        fill="none"
        stroke="#B07447"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Glimlichtje — zacht crème */}
      <ellipse cx="16" cy="14" rx="3" ry="1.6" fill="#FFF6E0" opacity="0.85" />

      {/* Peper-specks voor karakter */}
      <circle cx="28" cy="30" r="1.4" fill="#111111" />
      <circle cx="18" cy="32" r="1.1" fill="#111111" />
      <circle cx="13" cy="26" r="1.0" fill="#111111" />
      <circle cx="33" cy="21" r="0.9" fill="#111111" />
      <circle cx="27" cy="18" r="0.7" fill="#111111" />
      <circle cx="22" cy="27" r="0.8" fill="#111111" />

      {/* Diepe schaduw onderaan voor 3D-suggestie */}
      <path
        d="M 10 30 Q 14 40 24 40 Q 34 40 38 30"
        fill="none"
        stroke="#2E1808"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
