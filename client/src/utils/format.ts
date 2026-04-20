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

export const scoreColor = (x100: number | null | undefined): string => {
  if (x100 == null) return "bg-paper";
  const v = x100 / 100;
  if (v >= 8) return "bg-mint";
  if (v >= 6.5) return "bg-pop";
  if (v >= 5) return "bg-sky text-paper";
  return "bg-hot text-paper";
};
