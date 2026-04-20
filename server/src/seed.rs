//! Seed-data voor Nederlandse amateurvoetbalclubs.
//!
//! Dit is een **starter-set** — uitbreiden door de SEED_CLUBS-lijst aan te
//! vullen of (later) een import-reducer te bouwen die een officiële KNVB
//! dataset inleest. Idempotent: dubbele runs voegen niks extra toe.

use spacetimedb::{ReducerContext, Table};

use crate::helpers::normalize;
use crate::seed_generated::WIKIDATA_CLUBS;
use crate::tables::{city, club, province, snack, City, Club, Snack};

/// Idempotent — find-or-create city + club + default gehaktbal-snack.
pub fn seed_cities_and_clubs(ctx: &ReducerContext) {
    let mut created_clubs = 0u32;
    for (club_name, city_name, province_name) in WIKIDATA_CLUBS {
        let Some(province) = ctx.db.province().name().find(province_name.to_string()) else {
            log::warn!(
                "seed: provincie '{}' niet gevonden — sla '{}' over",
                province_name, club_name,
            );
            continue;
        };

        // Stad — find-or-create.
        let city_key = normalize(city_name);
        let city_id = match ctx.db.city().iter()
            .find(|c| c.province_id == province.id && c.name_key == city_key)
        {
            Some(c) => c.id,
            None => ctx.db.city().insert(City {
                id: 0,
                province_id: province.id,
                name: (*city_name).to_string(),
                name_key: city_key,
            }).id,
        };

        // Club — find-or-create.
        let club_key = normalize(club_name);
        let exists = ctx.db.club().iter()
            .any(|c| c.city_id == city_id && c.name_key == club_key);
        if exists { continue; }

        let inserted = ctx.db.club().insert(Club {
            id: 0,
            name: (*club_name).to_string(),
            name_key: club_key,
            province_id: province.id,
            city_id,
            created_by: 0, // 0 = system-seed
            created_at: ctx.timestamp,
        });

        // Gehaktbal — default snack per club (zoals add_club ook doet).
        ctx.db.snack().insert(Snack {
            id: 0,
            club_id: inserted.id,
            name: "Gehaktbal".to_string(),
            name_key: "gehaktbal".to_string(),
            created_by: 0,
            created_at: ctx.timestamp,
        });

        created_clubs += 1;
    }
    if created_clubs > 0 {
        log::info!("seed: {} nieuwe amateurclubs toegevoegd", created_clubs);
    }
}
