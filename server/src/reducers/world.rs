//! World-bouwen: steden, clubs, snacks.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::constants::DEDUP_THRESHOLD;
use crate::helpers::{
    ensure_membership, enforce_rate_limit, normalize, push_activity, require_membership,
    require_user, similarity,
};
use crate::tables::{city, club, province, snack, ActivityKind, City, Club, Snack};

#[reducer]
pub fn add_city(ctx: &ReducerContext, province_id: u64, name: String) -> Result<(), String> {
    require_user(ctx)?;
    enforce_rate_limit(ctx, "add_city", 5)?;
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count == 0 { return Err("Plaatsnaam leeg".into()); }
    if char_count > 60 { return Err("Plaatsnaam te lang".into()); }
    if ctx.db.province().id().find(province_id).is_none() {
        return Err("Onbekende provincie".into());
    }
    let key = normalize(trimmed);
    if ctx.db.city().iter().any(|c| c.province_id == province_id && c.name_key == key) {
        return Ok(()); // bestaat al — idempotent
    }
    ctx.db.city().insert(City {
        id: 0,
        province_id,
        name: trimmed.to_string(),
        name_key: key,
    });
    Ok(())
}

#[reducer]
pub fn add_club(
    ctx: &ReducerContext,
    name: String,
    province_id: u64,
    city_id: u64,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "add_club", 10)?;
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count < 2 { return Err("Clubnaam te kort".into()); }
    if char_count > 60 { return Err("Clubnaam te lang".into()); }

    // city_id / province_id mogen 0 zijn (= "onbekend") zodat de UI deze
    // metadata kan overslaan. Anders moet de stad bij de provincie horen.
    let city_name = if city_id == 0 {
        "".to_string()
    } else {
        let city = ctx.db.city().id().find(city_id).ok_or("Onbekende stad")?;
        if province_id != 0 && city.province_id != province_id {
            return Err("Stad hoort niet bij deze provincie".into());
        }
        city.name
    };

    let key = normalize(trimmed);
    if let Some(existing) = ctx.db.club().iter()
        .find(|c| c.city_id == city_id && c.name_key == key)
    {
        log::info!("club dedup (exact key): {}", existing.name);
        return Ok(());
    }
    // Fuzzy dedup: als er al een club in dezelfde stad zit die >=85% lijkt,
    // niets doen (idempotent). Voorkomt "VV Gruno" vs "vv gruno.".
    if let Some(near) = ctx.db.club().iter()
        .filter(|c| c.city_id == city_id)
        .find(|c| similarity(&c.name, trimmed) >= DEDUP_THRESHOLD)
    {
        log::info!("club fuzzy dedup: '{}' ≈ '{}'", trimmed, near.name);
        return Ok(());
    }

    let club = ctx.db.club().insert(Club {
        id: 0,
        name: trimmed.to_string(),
        name_key: key,
        province_id,
        city_id,
        created_by: user.id,
        created_at: ctx.timestamp,
    });

    // Elke nieuwe club krijgt meteen een gehaktbal — het fundament.
    ctx.db.snack().insert(Snack {
        id: 0,
        club_id: club.id,
        name: "Gehaktbal".to_string(),
        name_key: "gehaktbal".to_string(),
        created_by: user.id,
        created_at: ctx.timestamp,
    });

    // Auto-join: de creator van de club staat 'm meteen in zijn lijst.
    ensure_membership(ctx, user.id, club.id);

    push_activity(
        ctx,
        ActivityKind::ClubAdded,
        club.id,
        user.id,
        0,
        if city_name.is_empty() {
            format!("Nieuwe club toegevoegd: {}", club.name)
        } else {
            format!("Nieuwe club toegevoegd: {} ({})", club.name, city_name)
        },
    );
    Ok(())
}

#[reducer]
pub fn add_snack(ctx: &ReducerContext, club_id: u64, name: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    require_membership(ctx, user.id, club_id)?;
    enforce_rate_limit(ctx, "add_snack", 5)?;
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count < 2 { return Err("Snackname te kort".into()); }
    if char_count > 40 { return Err("Snackname te lang".into()); }
    let club = ctx.db.club().id().find(club_id).ok_or("Onbekende club")?;

    let key = normalize(trimmed);
    if ctx.db.snack().iter().any(|s| s.club_id == club_id && s.name_key == key) {
        return Ok(()); // idempotent dedup
    }
    // Fuzzy dedup binnen de club — "Gehaktbal" vs "gehaktbaal".
    if ctx.db.snack().iter()
        .filter(|s| s.club_id == club_id)
        .any(|s| similarity(&s.name, trimmed) >= DEDUP_THRESHOLD)
    {
        return Ok(());
    }

    let snack = ctx.db.snack().insert(Snack {
        id: 0,
        club_id,
        name: trimmed.to_string(),
        name_key: key,
        created_by: user.id,
        created_at: ctx.timestamp,
    });

    push_activity(
        ctx,
        ActivityKind::SnackAdded,
        club_id,
        user.id,
        snack.id,
        format!("{} zette {} op de menukaart bij {}", user.screen_name, snack.name, club.name),
    );
    Ok(())
}
