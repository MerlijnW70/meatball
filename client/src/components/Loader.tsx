export function Loader({ label = "LADEN…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="brut-card bg-pop px-4 py-2 animate-pulse">
        <span className="font-display uppercase">{label}</span>
      </div>
    </div>
  );
}
