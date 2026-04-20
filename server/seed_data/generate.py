#!/usr/bin/env python3
"""
Generate server/src/seed_generated.rs from:
  - clubs.sparql.json (Wikidata SPARQL dump, primary source)
  - supplemental.json (handmatige aanvullingen)

Dedupeert op (lowercased name, lowercased city). Wikidata entries winnen
bij collisions; supplement vult alleen de gaten.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
WIKIDATA_SRC = ROOT / "clubs.sparql.json"
HV_SRC = ROOT / "hv_clubs_enriched.json"
SUPPL_SRC = ROOT / "supplemental.json"
OUT = ROOT.parent / "src" / "seed_generated.rs"


def lbl(b, k):
    v = b.get(k, {}).get("value", "")
    return v if v and not v.startswith("Q") else None


def main():
    # Wikidata laag
    d = json.loads(WIKIDATA_SRC.read_text(encoding="utf-8"))
    wd_entries = []
    for b in d["results"]["bindings"]:
        name = lbl(b, "clubLabel")
        city = lbl(b, "cityLabel")
        prov = lbl(b, "provinceLabel")
        if name and city and prov:
            wd_entries.append((name, city, prov))

    seen = set()
    merged = []
    for n, c, p in wd_entries:
        k = (n.lower().strip(), c.lower().strip())
        if k in seen:
            continue
        seen.add(k)
        merged.append((n, c, p, "wikidata"))
    wd_count = len(merged)

    # HollandseVelden (2900+ clubs, na provincie-enrich via Wikidata places)
    hv_added = 0
    if HV_SRC.exists():
        hv = json.loads(HV_SRC.read_text(encoding="utf-8"))
        for item in hv:
            n = item["name"].strip()
            c = item["city"].strip()
            p = item["province"].strip()
            k = (n.lower(), c.lower())
            if k in seen:
                continue
            seen.add(k)
            merged.append((n, c, p, "hollandsevelden"))
            hv_added += 1

    # Supplement (handmatige aanvullingen, laatste bron)
    added = 0
    if SUPPL_SRC.exists():
        supp = json.loads(SUPPL_SRC.read_text(encoding="utf-8"))
        for item in supp.get("clubs", []):
            n = item["name"].strip()
            c = item["city"].strip()
            p = item["province"].strip()
            k = (n.lower(), c.lower())
            if k in seen:
                continue
            seen.add(k)
            merged.append((n, c, p, "supplement"))
            added += 1

    # Stable sort: provincie, stad, naam
    merged.sort(key=lambda x: (x[2], x[1], x[0]))

    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')

    lines = [
        "//! AUTO-GENERATED via server/seed_data/generate.py.",
        "//! Bronnen: Wikidata SPARQL + hollandsevelden.nl scrape + supplemental.json.",
        f"//! {len(merged)} clubs totaal ({wd_count} Wikidata, {hv_added} HV, {added} supplement).",
        "//! Niet met de hand bewerken - herregeneren bij update.",
        "",
        "/// (club_name, city_name, province_name).",
        "pub const WIKIDATA_CLUBS: &[(&str, &str, &str)] = &[",
    ]
    for n, c, p, _src in merged:
        lines.append(f'    ("{esc(n)}", "{esc(c)}", "{esc(p)}"),')
    lines.append("];")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(merged)} clubs to {OUT} ({added} uit supplement)")


if __name__ == "__main__":
    main()
