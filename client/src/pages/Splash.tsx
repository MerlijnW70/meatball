import { useEffect } from "react";
import { GehaktbalLogo } from "../components/GehaktbalLogo";
import { go } from "../router";
import { useStore } from "../store";

/**
 * Brand-moment tijdens de WS-handshake. Zodra de server een user heeft
 * aangemaakt of hergevonden (session.me set) schuift de splash automatisch
 * door naar Home — geen "tap start" meer.
 *
 * Dit matcht de no-auth visie: iedereen komt direct in de app.
 */
export function SplashPage() {
  const me = useStore((s) => s.session.me);

  useEffect(() => {
    if (me) {
      // Korte delay zodat het logo nog even zichtbaar is — anders voelt 't
      // alsof de splash skipt en je gelijk in de Feed staat.
      const t = setTimeout(() => go("/home"), 500);
      return () => clearTimeout(t);
    }
  }, [me]);

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="brut-card bg-hot text-paper -rotate-2 px-4 py-2 shadow-brutLg">
          <span className="font-display uppercase text-sm tracking-widest">
            kantine snack ratings
          </span>
        </div>
        <GehaktbalLogo size={120} className="drop-shadow-[6px_6px_0_#111]" />
        <h1 className="font-display text-7xl sm:text-8xl uppercase text-center leading-none">
          MEAT<br/>BALL
        </h1>
        <p className="text-center text-lg font-bold max-w-xs">
          Welke kantine heeft de <span className="bg-pop px-1">lekkerste gehaktbal</span> van Nederland?
          Vind het uit. Live.
        </p>
        <p className="text-center text-xs uppercase tracking-widest opacity-60 animate-pulse">
          {me ? `welkom ${me.screen_name}…` : "verbinden…"}
        </p>
      </div>
      <footer className="brut-stripe h-6" />
    </div>
  );
}

