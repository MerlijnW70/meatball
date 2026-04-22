export const fmtScore = (x100: number) => (x100 / 100).toFixed(1);

export function fmtRelative(microseconds: number | bigint): string {
  const now = Date.now();
  const then = Number(BigInt(microseconds) / 1000n);
  const diff = now - then;
  if (diff < 60_000) return "zojuist";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}u`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

const DAYS_NL = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
const MONTHS_NL = [
  "JAN", "FEB", "MRT", "APR", "MEI", "JUN",
  "JUL", "AUG", "SEP", "OKT", "NOV", "DEC",
];
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Format kickoff-micros → { when: "ZAT 27 APR · 14:00", relative: "over 3 dagen" }.
 * Eén plek voor de conversie micros → ms → Date, zodat we niet per-module
 * verschillende afrondingsstrategieën hebben.
 */
export function formatKickoff(microseconds: number | bigint): {
  when: string;
  relative: string;
} {
  const ms = Number(BigInt(microseconds) / 1000n);
  const d = new Date(ms);
  const when =
    `${DAYS_NL[d.getDay()]} ${d.getDate()} ${MONTHS_NL[d.getMonth()]}` +
    ` · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const diffMs = d.getTime() - Date.now();
  const absHours = Math.abs(diffMs) / (1000 * 60 * 60);
  let relative: string;
  if (diffMs < 0) {
    relative = "wacht op uitslag";
  } else if (absHours < 1) {
    relative = "binnen 1 uur";
  } else if (absHours < 24) {
    relative = `over ${Math.round(absHours)} uur`;
  } else {
    const days = Math.round(absHours / 24);
    relative = `over ${days} dag${days === 1 ? "" : "en"}`;
  }
  return { when, relative };
}

export const scoreColor = (x100: number | null | undefined): string => {
  if (x100 == null) return "bg-paper";
  const v = x100 / 100;
  if (v >= 8) return "bg-mint";
  if (v >= 6.5) return "bg-pop";
  if (v >= 5) return "bg-sky text-paper";
  return "bg-hot text-paper";
};
