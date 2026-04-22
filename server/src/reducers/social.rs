//! Social graph: volgen, moods, reacties, likes.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::constants::{ALLOWED_MOODS, ALLOWED_REACTIONS};
use crate::helpers::{enforce_rate_limit, require_membership, require_user};
use crate::tables::{
    club, club_mood, follow, snack, snack_like, user, user_reaction, ClubMood, Follow,
    SnackLike, UserReaction,
};

#[reducer]
pub fn toggle_follow(ctx: &ReducerContext, to_user_id: u64) -> Result<(), String> {
    let me = require_user(ctx)?;
    if me.id == to_user_id {
        return Err("Je kan jezelf niet volgen".into());
    }
    if ctx.db.user().id().find(to_user_id).is_none() {
        return Err("Onbekende user".into());
    }
    enforce_rate_limit(ctx, "toggle_follow", 2)?;
    let existing = ctx.db.follow().iter()
        .find(|f| f.follower_id == me.id && f.followee_id == to_user_id);
    if let Some(e) = existing {
        ctx.db.follow().id().delete(e.id);
    } else {
        ctx.db.follow().insert(Follow {
            id: 0,
            follower_id: me.id,
            followee_id: to_user_id,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}

#[reducer]
pub fn vote_club_mood(
    ctx: &ReducerContext,
    club_id: u64,
    emoji: String,
) -> Result<(), String> {
    let me = require_user(ctx)?;
    if !ALLOWED_MOODS.iter().any(|e| *e == emoji) {
        return Err("Ongeldige mood".into());
    }
    if ctx.db.club().id().find(club_id).is_none() {
        return Err("Onbekende club".into());
    }
    require_membership(ctx, me.id, club_id)?;
    enforce_rate_limit(ctx, "vote_club_mood", 3)?;
    // Per-club cooldown extra: voorkomt dat één user 20 clubs binnen een
    // minuut met mood-emoji bombardeert (global cd slaagt, per-club niet).
    enforce_rate_limit(ctx, &format!("vote_club_mood_{}", club_id), 10)?;
    // Eén mood per (user, club) → upsert
    let existing = ctx.db.club_mood().iter()
        .find(|m| m.club_id == club_id && m.user_id == me.id);
    if let Some(mut m) = existing {
        m.emoji = emoji;
        m.created_at = ctx.timestamp;
        ctx.db.club_mood().id().update(m);
    } else {
        ctx.db.club_mood().insert(ClubMood {
            id: 0,
            club_id,
            user_id: me.id,
            emoji,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}

#[reducer]
pub fn clear_club_mood(ctx: &ReducerContext, club_id: u64) -> Result<(), String> {
    let me = require_user(ctx)?;
    enforce_rate_limit(ctx, "clear_club_mood", 2)?;
    let existing = ctx.db.club_mood().iter()
        .find(|m| m.club_id == club_id && m.user_id == me.id);
    if let Some(m) = existing {
        ctx.db.club_mood().id().delete(m.id);
    }
    Ok(())
}

#[reducer]
pub fn send_reaction(
    ctx: &ReducerContext,
    to_user_id: u64,
    emoji: String,
) -> Result<(), String> {
    let me = require_user(ctx)?;
    // Zelf-reactie zou de inbox volspammen zonder doel.
    if me.id == to_user_id {
        return Err("Je kan jezelf geen reactie sturen".into());
    }
    if !ALLOWED_REACTIONS.iter().any(|a| *a == emoji) {
        return Err("Ongeldige emoji".into());
    }
    if ctx.db.user().id().find(to_user_id).is_none() {
        return Err("Onbekende ontvanger".into());
    }
    // Globale rate-limit per identity — voorkomt emoji-rotatie spam.
    enforce_rate_limit(ctx, "send_reaction", 2)?;
    // Per-ontvanger cooldown: 1 user kan niet 30 verschillende targets
    // binnen een minuut bombarderen door met de globale 2s cd te rotateren.
    enforce_rate_limit(ctx, &format!("send_reaction_to_{}", to_user_id), 30)?;

    ctx.db.user_reaction().insert(UserReaction {
        id: 0,
        from_user_id: me.id,
        to_user_id,
        emoji,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn toggle_like(ctx: &ReducerContext, snack_id: u64) -> Result<(), String> {
    let user = require_user(ctx)?;
    let snack = ctx.db.snack().id().find(snack_id).ok_or("Onbekende snack")?;
    require_membership(ctx, user.id, snack.club_id)?;
    // Globale cooldown iets verhoogd (1s was wel heel kort); per-snack
    // cooldown voorkomt dat iemand alle snacks in de feed kan flip-floppen.
    enforce_rate_limit(ctx, "toggle_like", 2)?;
    enforce_rate_limit(ctx, &format!("toggle_like_{}", snack_id), 5)?;

    let existing = ctx.db.snack_like().iter()
        .find(|l| l.user_id == user.id && l.snack_id == snack_id);

    if let Some(e) = existing {
        ctx.db.snack_like().id().delete(e.id);
    } else {
        ctx.db.snack_like().insert(SnackLike {
            id: 0,
            user_id: user.id,
            snack_id,
            club_id: snack.club_id,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}
