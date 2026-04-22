/**
 * "Krijtbord" boven de tile-grid. Roteert per weekdag van toon zodat
 * de app een ritme krijgt — gebruikers zien dezelfde app maar voelen
 * dat er iets gebeurt afhankelijk van de dag.
 *
 * Personaliseert met `session.me.screen_name` als er een user is.
 */
import { useStore } from "../../store";

const DAY_THEMES: { emoji: string; label: string; tagline: string }[] = [
  { emoji: "🌤️", label: "zondag",    tagline: "recap-dag — wie won 't weekend?" },
  { emoji: "☕",  label: "maandag",   tagline: "nieuwe week, nieuwe ratings" },
  { emoji: "🥨",  label: "dinsdag",   tagline: "boterham-dag · tussendoortje-moment" },
  { emoji: "⚖️",  label: "woensdag",  tagline: "halverwege — nog even volhouden" },
  { emoji: "🍟",  label: "donderdag", tagline: "dagmenu-day" },
  { emoji: "🎯",  label: "vrijdag",   tagline: "voorspel-vrijdag · morgen wedstrijd" },
  { emoji: "⚽",  label: "zaterdag",  tagline: "MATCH-DAY · live scores · gehaktbal-reviews" },
];

function pickTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 6)  return "goedenacht";
  if (h < 12) return "goedemorgen";
  if (h < 18) return "goedemiddag";
  return "goedenavond";
}

export function DailyHeader() {
  const me = useStore((s) => s.session.me);
  const now = new Date();
  const theme = DAY_THEMES[now.getDay()] ?? DAY_THEMES[0];
  const greeting = pickTimeGreeting();

  const nickname = me?.screen_name ?? "kantinegast";

  return (
    <div className="brut-card bg-ink text-paper !p-0 overflow-hidden -rotate-[0.5deg]">
      {/* Krijtbord-header met subtiel streep-patroon */}
      <div
        className="px-4 py-3 border-b-4 border-paper/20"
        style={{
          backgroundImage:
            `repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 3px, transparent 3px 9px)`,
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight">
          {greeting}, {nickname}
        </p>
        <p className="font-display text-2xl sm:text-3xl uppercase leading-none mt-0.5">
          <span className="text-3xl sm:text-4xl mr-1">{theme.emoji}</span>
          {theme.label}
        </p>
      </div>
      {/* Tagline */}
      <div className="px-4 py-2 bg-paper/5">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">
          {theme.tagline}
        </p>
      </div>
    </div>
  );
}
