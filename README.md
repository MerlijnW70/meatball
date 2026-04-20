# 🥩 Meatball — Kantine Snack Ratings

Realtime snack rating app voor Nederlandse amateurvoetbalclubs.
Mobile-first. Brutalism. SpacetimeDB realtime.

## Architectuur

```
meatball/
├── server/                     # Rust SpacetimeDB module
│   ├── Cargo.toml
│   └── src/lib.rs              # tables + reducers
└── client/                     # React + Vite + TS + Tailwind
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── router.tsx          # simple hash-based router
        ├── spacetime.ts        # connection + subscriptions
        ├── store.ts            # zustand store (session + UI)
        ├── hooks.ts            # useTable() reactive hooks
        ├── utils/
        │   ├── normalize.ts    # club name normalisatie (dedup)
        │   └── stats.ts        # avg, rankings
        ├── components/
        │   ├── BrutalButton.tsx
        │   ├── BrutalCard.tsx
        │   ├── BrutalInput.tsx
        │   ├── BrutalSelect.tsx
        │   ├── TagChip.tsx
        │   ├── SnackCard.tsx
        │   ├── ScorePill.tsx
        │   ├── ActivityItem.tsx
        │   ├── RatingModal.tsx
        │   ├── TopBar.tsx
        │   └── Leaderboard.tsx
        └── pages/
            ├── Splash.tsx
            ├── OnboardScreenname.tsx
            ├── OnboardProvince.tsx
            ├── OnboardCity.tsx
            ├── ClubPicker.tsx
            ├── AddClub.tsx
            ├── Home.tsx
            ├── ClubDetail.tsx
            ├── SnackDetail.tsx
            ├── AddSnack.tsx
            └── Leaderboard.tsx
```

## SpacetimeDB schema (tables)

| Tabel          | Belangrijke velden                                                      |
|----------------|-------------------------------------------------------------------------|
| `user`         | id, identity, screen_name (uniek), created_at                           |
| `province`     | id, name                                                                |
| `city`         | id, province_id, name                                                   |
| `club`         | id, name, name_normalized (uniek per stad), province_id, city_id, …     |
| `snack`        | id, club_id, name, name_normalized, created_by, created_at              |
| `rating`       | id, user_id, club_id, snack_id, score (1..10), review_text, created_at  |
| `rating_tag`   | id, rating_id, tag                                                      |
| `activity_event` | id, kind, club_id?, user_id?, snack_id?, payload, created_at          |
| `snack_stats`  | snack_id PK, club_id, avg_score, rating_count, rank_in_club             |

`snack_stats` is server-cached en wordt ge-update in reducers → cheap realtime leaderboards.

## Reducers

| Reducer            | Functie                                                              |
|--------------------|----------------------------------------------------------------------|
| `register_user`    | Unieke screenname claimen, koppelt aan identity                      |
| `seed_world`       | (one-shot) provincies + basis snacktemplates seeden                  |
| `add_city`         | Stad toevoegen onder provincie (dedup op normalized name)            |
| `add_club`         | Club toevoegen (dedup op normalized name + city)                     |
| `add_snack`        | Snack toevoegen aan club (dedup binnen club)                         |
| `submit_rating`    | Rating + tags plaatsen, `snack_stats` updaten, activity-event emitten |

## Subscriptions (client)

- `SELECT * FROM user`  → screenname lookup
- `SELECT * FROM province`
- `SELECT * FROM city WHERE province_id = :pid`
- `SELECT * FROM club WHERE city_id = :cid`
- `SELECT * FROM snack WHERE club_id = :cid`
- `SELECT * FROM rating WHERE club_id = :cid ORDER BY created_at DESC`
- `SELECT * FROM rating_tag WHERE rating_id IN (...)`
- `SELECT * FROM snack_stats WHERE club_id = :cid`
- `SELECT * FROM activity_event WHERE club_id = :cid ORDER BY created_at DESC LIMIT 50`

## Pagina overzicht

| # | Route                  | Pagina              |
|---|------------------------|---------------------|
| 1 | `/`                    | Splash              |
| 2 | `/onboard/name`        | Screenname          |
| 3 | `/onboard/province`    | Provincie kiezen    |
| 4 | `/onboard/city`        | Stad kiezen         |
| 5 | `/clubs`               | Club picker         |
| 6 | `/clubs/new`           | Club toevoegen      |
| 7 | `/home`                | Hoofd-feed          |
| 8 | `/club/:id`            | Club detail         |
| 9 | `/club/:id/snack/:sid` | Snack detail        |
| 10| `/club/:id/snack/new`  | Snack toevoegen     |
| 11| `/club/:id/top`        | Leaderboard         |

## Brutalism design tokens

- border: `4px solid #000`
- shadow: `8px 8px 0 #000` (hard, no blur)
- palette: paper `#FFFCF2`, ink `#0A0A0A`, hot `#FF3D2E`, pop `#FFE14D`, mint `#00D2A0`, sky `#4D7CFF`
- type: display `"Archivo Black"`, body `"Inter"`
- rotaties, grove rasters, vet, speels

## Dev

```bash
# server
cd server && spacetime publish meatball

# client
cd client && npm install && npm run dev
```
