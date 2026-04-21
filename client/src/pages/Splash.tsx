import { BrutalButton } from "../components/BrutalButton";
import { GehaktbalLogo } from "../components/GehaktbalLogo";
import { go } from "../router";
import { useStore } from "../store";

export function SplashPage() {
  const session = useStore((s) => s.session);

  // Geen auto-redirect: iedereen begint hier en tapt zelf "start".
  const start = () => {
    if (session.me) go("/home");
    else go("/onboard/name");
  };

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
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <BrutalButton onClick={start} variant="hot" size="lg" block>
            start
          </BrutalButton>
          {session.me && (
            <p className="text-center text-xs uppercase tracking-widest">
              welkom terug, {session.me.screen_name}
            </p>
          )}
        </div>
      </div>
      <footer className="brut-stripe h-6" />
    </div>
  );
}

