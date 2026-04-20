/**
 * Sociale inbox op het profiel — twee tabs (volgers · reacties)
 * met top-N peek en een searchable full-list modal voor "+N meer".
 */
import { useEffect, useMemo, useState } from "react";
import {
  useFollowersList, useReactionsReceivedList,
  useUnreadFollowsCount, useUnreadReactionsCount,
} from "../hooks";
import { BrutalCard } from "./BrutalCard";
import { BrutalButton } from "./BrutalButton";
import { Avatar } from "./Avatar";
import { UserMenu } from "./UserMenu";
import { fmtRelative } from "../utils/format";

type Tab = "followers" | "reactions";
const TOP_PEEK = 5;

export function SocialInbox() {
  const [tab, setTab] = useState<Tab>("followers");
  const [seeAllTab, setSeeAllTab] = useState<Tab | null>(null);
  const followers = useFollowersList();
  const reactions = useReactionsReceivedList();
  const unFollows = useUnreadFollowsCount();
  const unRx = useUnreadReactionsCount();

  const tabs: { key: Tab; label: string; n: number; un: number }[] = [
    { key: "followers", label: "volgers", n: followers.length, un: unFollows },
    { key: "reactions", label: "reacties", n: reactions.length, un: unRx },
  ];

  return (
    <section>
      <h3 className="font-display text-2xl uppercase mb-2">inbox</h3>
      <div className="grid grid-cols-2 gap-1 mb-2">
        {tabs.map(({ key, label, n, un }) => {
          const active = tab === key;
          return (
            <button
              key={key} type="button" onClick={() => setTab(key)}
              aria-pressed={active}
              className={`brut-card !p-2 relative
                ${active ? "bg-ink text-paper" : "bg-paper"}
                active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
            >
              <p className="font-display text-xl leading-none">{n}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest mt-1 leading-none">
                {label}
              </p>
              {un > 0 && (
                <span className="absolute -top-2 -right-2 brut-card bg-hot text-paper
                                 text-[10px] font-display px-1.5 py-0 leading-tight
                                 border-2 shadow-brutSm">
                  {un > 99 ? "99+" : un}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "followers" && (
        <CappedInbox
          items={followers} cap={TOP_PEEK}
          empty="Nog geen volgers — ga raten + interactie aan op andere profielen."
          onSeeAll={() => setSeeAllTab("followers")}
          render={(f) => (
            <>
              <span className="font-display uppercase">
                <UserMenu userId={f.userId} name={f.name} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 ml-auto">
                volgt jou · {fmtRelative(f.at)}
              </span>
            </>
          )}
        />
      )}
      {tab === "reactions" && (
        <CappedInbox
          items={reactions} cap={TOP_PEEK}
          empty="Nog geen reacties ontvangen."
          onSeeAll={() => setSeeAllTab("reactions")}
          render={(r) => (
            <>
              <span className="text-2xl leading-none">{r.emoji}</span>
              <span className="font-display uppercase">
                <UserMenu userId={r.userId} name={r.name} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 ml-auto">
                {fmtRelative(r.at)}
              </span>
            </>
          )}
        />
      )}

      {seeAllTab && (
        <InboxFullModal
          tab={seeAllTab}
          followers={followers}
          reactions={reactions}
          onClose={() => setSeeAllTab(null)}
        />
      )}
    </section>
  );
}

type Item = { id: bigint; userId: bigint; isNew: boolean; name?: string };

function InboxList<T extends Item>({
  items, render,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => (
        <BrutalCard
          key={it.id.toString()}
          tone={it.isNew ? "pop" : "paper"}
          className="!p-2 flex items-center gap-2 flex-wrap"
        >
          <Avatar userId={it.userId} size="sm" />
          {render(it)}
        </BrutalCard>
      ))}
    </div>
  );
}

function CappedInbox<T extends Item>({
  items, cap, empty, onSeeAll, render,
}: {
  items: T[];
  cap: number;
  empty: string;
  onSeeAll: () => void;
  render: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <BrutalCard><p className="font-bold text-sm">{empty}</p></BrutalCard>;
  }
  const overflow = Math.max(0, items.length - cap);
  return (
    <div className="flex flex-col gap-2">
      <InboxList items={items.slice(0, cap)} render={render} />
      {overflow > 0 && (
        <BrutalButton onClick={onSeeAll} variant="ink" block>
          + {overflow} meer · bekijk alles
        </BrutalButton>
      )}
    </div>
  );
}

function InboxFullModal({
  tab, followers, reactions, onClose,
}: {
  tab: Tab;
  followers: ReturnType<typeof useFollowersList>;
  reactions: ReturnType<typeof useReactionsReceivedList>;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  const [q, setQ] = useState("");

  const title = tab === "followers" ? "volgers" : "reacties";

  const norm = (s: string) => s.trim().toLowerCase();
  const key = norm(q);

  const filteredFollowers = useMemo(
    () => key ? followers.filter((f) => norm(f.name).includes(key)) : followers,
    [followers, key],
  );
  const filteredReactions = useMemo(
    () => key ? reactions.filter((r) => norm(r.name).includes(key)) : reactions,
    [reactions, key],
  );

  const total = tab === "followers" ? followers.length : reactions.length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-4 rounded-none
                   max-h-dvh flex flex-col"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            {title} · {total}
          </p>
          <button
            type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg"
          >✕</button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="zoek op naam"
          className="brut-input mb-3"
          autoFocus
        />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {tab === "followers" && (
            <InboxList items={filteredFollowers} render={(f) => (
              <>
                <span className="font-display uppercase">
                  <UserMenu userId={f.userId} name={f.name} />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 ml-auto">
                  volgt jou · {fmtRelative(f.at)}
                </span>
              </>
            )} />
          )}
          {tab === "reactions" && (
            <InboxList items={filteredReactions} render={(r) => (
              <>
                <span className="text-2xl leading-none">{r.emoji}</span>
                <span className="font-display uppercase">
                  <UserMenu userId={r.userId} name={r.name} />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 ml-auto">
                  {fmtRelative(r.at)}
                </span>
              </>
            )} />
          )}
        </div>
      </div>
    </div>
  );
}
