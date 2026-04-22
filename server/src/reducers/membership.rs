//! Club-membership: join + leave.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::helpers::{ensure_membership, require_user};
use crate::tables::{club, club_membership, club_mood};

#[reducer]
pub fn join_club(ctx: &ReducerContext, club_id: u64) -> Result<(), String> {
    let me = require_user(ctx)?;
    if ctx.db.club().id().find(club_id).is_none() {
        return Err("Onbekende club".into());
    }
    ensure_membership(ctx, me.id, club_id);
    Ok(())
}

#[reducer]
pub fn leave_club(ctx: &ReducerContext, club_id: u64) -> Result<(), String> {
    let me = require_user(ctx)?;
    let row = ctx.db.club_membership().iter()
        .find(|m| m.user_id == me.id && m.club_id == club_id);
    if let Some(r) = row {
        ctx.db.club_membership().id().delete(r.id);
    }
    // Cascade: ruim mijn club_mood op voor deze club zodat ex-leden niet
    // onbedoeld bijdragen aan consensus-features.
    let mood_ids: Vec<u64> = ctx.db.club_mood().iter()
        .filter(|m| m.club_id == club_id && m.user_id == me.id)
        .map(|m| m.id)
        .collect();
    for id in mood_ids {
        ctx.db.club_mood().id().delete(id);
    }
    Ok(())
}
