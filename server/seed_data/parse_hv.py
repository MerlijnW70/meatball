#!/usr/bin/env python3
"""
Parse hollandsevelden.nl letter pages (hv_pages/a.html .. z.html) into
a flat list of {name, city_slug}. Province comes later via Wikidata cross-ref.

Pattern per club:
    <li><a href="/clubs/L/SLUG/"><img
       alt="Clublogo voetbalvereniging NAME"
       src="/images/icon64/club_logo_van_voetbalvereniging_SLUG_uit_CITY.webp"
       ...>
    </a>&nbsp;<a href="/clubs/L/SLUG/">ANCHOR</a></li>

De `alt` heeft de canonical naam (zonder "Clublogo voetbalvereniging " prefix),
de image-src heeft de city-slug via "uit_CITY.webp".
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
PAGES = ROOT / "hv_pages"
OUT = ROOT / "hv_clubs.json"

# alt="Clublogo voetbalvereniging NAME"
NAME_RE = re.compile(r'alt="Clublogo voetbalvereniging ([^"]+)"')
# src=".../club_logo_van_voetbalvereniging_SLUG_uit_CITY.webp"
CITY_RE = re.compile(
    r'club_logo_van_voetbalvereniging_[^"]*_uit_([a-z0-9-]+)\.(?:webp|png|jpg)',
    re.IGNORECASE,
)


def slug_to_title(s: str) -> str:
    """city-slug 'oostwold-westerkwartier' -> 'Oostwold Westerkwartier'"""
    s = s.replace("-", " ").strip()
    return " ".join(w.capitalize() for w in s.split())


def parse_letter(html: str):
    # Elke club staat in een <li> met een <img> binnen een <a>.
    # We scannen met simple regex: de alt + de bijbehorende src.
    out = []
    # Match een <li> block, pak dan beide attrs.
    LI_RE = re.compile(r"<li>(.*?)</li>", re.DOTALL)
    for m in LI_RE.finditer(html):
        block = m.group(1)
        name_m = NAME_RE.search(block)
        city_m = CITY_RE.search(block)
        if not (name_m and city_m):
            continue
        name = name_m.group(1).strip()
        city = slug_to_title(city_m.group(1))
        out.append({"name": name, "city": city})
    return out


def main():
    all_clubs = []
    for letter in "abcdefghijklmnopqrstuvwxyz":
        p = PAGES / f"{letter}.html"
        if not p.exists():
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        clubs = parse_letter(html)
        print(f"  /clubs/{letter}/ : {len(clubs):4d}")
        all_clubs.extend(clubs)

    # Dedupe op (name_lower, city_lower)
    seen = set()
    unique = []
    for c in all_clubs:
        k = (c["name"].lower().strip(), c["city"].lower().strip())
        if k in seen:
            continue
        seen.add(k)
        unique.append(c)

    OUT.write_text(json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nTotal unique: {len(unique)}  -> {OUT}")


if __name__ == "__main__":
    main()
