//! Init + client-lifecycle + rating-intent presence.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::constants::NL_PROVINCES;
use crate::helpers::{
    default_avatar_for, enforce_rate_limit, generate_auto_screen_name, require_user,
};
use crate::seed::seed_cities_and_clubs;
use crate::tables::{
    province, rating_intent, session, snack, user,
    Province, RatingIntent, Session, User,
};

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    for name in NL_PROVINCES {
        if ctx.db.province().name().find(name.to_string()).is_none() {
            ctx.db.province().insert(Province { id: 0, name: (*name).to_string() });
        }
    }
    seed_cities_and_clubs(ctx);
}

/// Idempotent seed voor bestaande databases (init fires alleen op fresh DB).
/// Auth-vereist (anti-spam: anonymous + rotating-identity kon anders de
/// 4k-club-scan spammen). Per-user rate-limit 60s.
#[reducer]
pub fn seed_clubs(ctx: &ReducerContext) -> Result<(), String> {
    require_user(ctx)?;
    enforce_rate_limit(ctx, "seed_clubs", 60)?;
    seed_cities_and_clubs(ctx);
    Ok(())
}

/// Nieuwe connectie → zorg dat er een `User` is voor deze identity (auto-
/// aanmaken met default naam + avatar als 'ie er nog niet is) en zet de
/// `session`-row. Geen registratie-gate meer voor nieuwe bezoekers; ze
/// kunnen meteen raten, voorspellen, mee-spelen. Later kunnen ze via
/// `register_user` hun naam zelf kiezen.
#[reducer(client_connected)]
pub fn on_client_connected(ctx: &ReducerContext) {
    let uid = match ctx.db.user().identity().find(ctx.sender()) {
        Some(u) => u.id,
        None => {
            let (name, key) = generate_auto_screen_name(ctx);
            let (color, icon, decor) = default_avatar_for(&key);
            let u = ctx.db.user().insert(User {
                id: 0,
                identity: ctx.sender(),
                screen_name: name,
                screen_name_key: key,
                created_at: ctx.timestamp,
                avatar_color: color.to_string(),
                avatar_icon: icon.to_string(),
                avatar_decor: decor,
            });
            u.id
        }
    };

    if let Some(mut s) = ctx.db.session().identity().find(ctx.sender()) {
        s.user_id = uid;
        s.connected_at = ctx.timestamp;
        ctx.db.session().identity().update(s);
    } else {
        ctx.db.session().insert(Session {
            identity: ctx.sender(),
            user_id: uid,
            connected_at: ctx.timestamp,
        });
    }
}

#[reducer(client_disconnected)]
pub fn on_client_disconnected(ctx: &ReducerContext) {
    ctx.db.session().identity().delete(ctx.sender());
    ctx.db.rating_intent().identity().delete(ctx.sender());
}

#[reducer]
pub fn begin_rating(ctx: &ReducerContext, snack_id: u64) -> Result<(), String> {
    let user = require_user(ctx)?;
    // Snack moet bestaan — anders krijgen we intents die naar ghost-snacks
    // wijzen (geen crash, wel rommelige presence-data).
    if ctx.db.snack().id().find(snack_id).is_none() {
        return Err("Snack niet gevonden".into());
    }
    // oude intent weg (kan maar één tegelijk)
    ctx.db.rating_intent().identity().delete(ctx.sender());
    ctx.db.rating_intent().insert(RatingIntent {
        identity: ctx.sender(),
        user_id: user.id,
        snack_id,
        started_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn end_rating(ctx: &ReducerContext) -> Result<(), String> {
    ctx.db.rating_intent().identity().delete(ctx.sender());
    Ok(())
}
