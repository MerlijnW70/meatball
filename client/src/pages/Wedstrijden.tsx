/**
 * Wedstrijden-page: alle komende & recent-afgelopen fixtures voor teams
 * waar je in zit, met de voorspellings-UI per fixture.
 */
import { TopBar } from "../components/TopBar";
import { UpcomingFixturesSection } from "../components/feed/UpcomingFixturesSection";

export function WedstrijdenPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Wedstrijden" back="/home" />
      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-6">
        <UpcomingFixturesSection />
      </main>
    </div>
  );
}
