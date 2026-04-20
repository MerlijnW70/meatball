//! Ratings + tags + stats + votes.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::constants::ALLOWED_TAGS;
use crate::helpers::{
    current_top_snack, enforce_rate_limit, format_score, push_activity, require_membership,
    require_user,
};
use crate::tables::{
    club, rating, rating_tag, rating_vote, snack, snack_stats, ActivityKind, Rating,
    RatingTag, RatingVote, SnackStats,
};

#[reducer]
pub fn submit_rating(
    ctx: &ReducerContext,
    snack_id: u64,
    score: u8,
    review_text: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    if !(1..=10).contains(&score) {
        return Err("Score moet tussen 1 en 10 liggen".into());
    }
    if review_text.chars().count() > 280 {
        return Err("Review te lang (max 280)".into());
    }
    let snack = ctx.db.snack().id().find(snack_id).ok_or("Onbekende snack")?;
    let club = ctx.db.club().id().find(snack.club_id).ok_or("Onbekende club")?;

    // Membership is verplicht — user moet de kantine eerst aan zijn seizoen
    // toegevoegd hebben voor hij mag raten.
    require_membership(ctx, user.id, club.id)?;

    // Eén rating per (user, snack). Bestaat er al eentje → update, anders insert.
    let existing = ctx.db.rating().iter()
        .find(|r| r.user_id == user.id && r.snack_id == snack_id);

    // Anti-spam: bij update min. 30s sinds vorige edit.
    if let Some(prev) = existing.as_ref() {
        let prev_micros = prev.created_at.to_micros_since_unix_epoch();
        let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
        let secs_since = (now_micros.saturating_sub(prev_micros)) / 1_000_000;
        const COOLDOWN_SECS: i64 = 30;
        if secs_since < COOLDOWN_SECS {
            return Err(format!(
                "Te snel — wacht nog {}s voor je dezelfde rating wijzigt",
                COOLDOWN_SECS - secs_since,
            ));
        }
    }

    let prev_top = current_top_snack(ctx, snack.club_id);
    let (rating_id, old_score, is_update) = match existing {
        Some(mut r) => {
            let old = r.score;
            r.score = score;
            r.review_text = review_text.trim().to_string();
            r.created_at = ctx.timestamp;
            let id = r.id;
            ctx.db.rating().id().update(r);
            // verwijder oude tags
            let old_tag_ids: Vec<u64> = ctx.db.rating_tag().iter()
                .filter(|t| t.rating_id == id)
                .map(|t| t.id)
                .collect();
            for tid in old_tag_ids {
                ctx.db.rating_tag().id().delete(tid);
            }
            (id, old, true)
        }
        None => {
            let r = ctx.db.rating().insert(Rating {
                id: 0,
                user_id: user.id,
                club_id: snack.club_id,
                snack_id,
                score,
                review_text: review_text.trim().to_string(),
                created_at: ctx.timestamp,
            });
            (r.id, 0u8, false)
        }
    };

    // Tags opschonen & deduppen — voor zowel insert als update opnieuw zetten.
    let mut seen: Vec<String> = Vec::new();
    for t in tags {
        let k = t.trim().to_ascii_lowercase();
        if k.is_empty() || seen.contains(&k) { continue; }
        if !ALLOWED_TAGS.iter().any(|a| *a == k) { continue; }
        seen.push(k.clone());
        ctx.db.rating_tag().insert(RatingTag {
            id: 0,
            rating_id,
            snack_id,
            club_id: snack.club_id,
            tag: k,
        });
    }

    // Stats bijwerken. Checked arithmetic → log corruption i.p.v. stil wrappen.
    if is_update {
        if let Some(mut s) = ctx.db.snack_stats().snack_id().find(snack_id) {
            let after_sub = match s.sum_score.checked_sub(old_score as u64) {
                Some(v) => v,
                None => {
                    log::error!(
                        "snack_stats sum_score underflow (snack {}): sum={} old={}",
                        snack_id, s.sum_score, old_score,
                    );
                    0
                }
            };
            s.sum_score = after_sub.saturating_add(score as u64);
            if s.rating_count > 0 {
                s.avg_score_x100 = ((s.sum_score as u128 * 100) / s.rating_count as u128) as u32;
            }
            s.last_rated_at = ctx.timestamp;
            ctx.db.snack_stats().snack_id().update(s);
        }
    } else if let Some(mut s) = ctx.db.snack_stats().snack_id().find(snack_id) {
        s.sum_score = s.sum_score.saturating_add(score as u64);
        s.rating_count = s.rating_count.saturating_add(1);
        s.avg_score_x100 = ((s.sum_score as u128 * 100) / s.rating_count as u128) as u32;
        s.last_rated_at = ctx.timestamp;
        ctx.db.snack_stats().snack_id().update(s);
    } else {
        ctx.db.snack_stats().insert(SnackStats {
            snack_id,
            club_id: snack.club_id,
            sum_score: score as u64,
            rating_count: 1,
            avg_score_x100: (score as u32) * 100,
            last_rated_at: ctx.timestamp,
        });
    }
    let stats_count = ctx.db.snack_stats().snack_id().find(snack_id)
        .map(|s| s.rating_count).unwrap_or(0);

    let text = if is_update {
        format!(
            "{} paste rating {} aan naar {} bij {}",
            user.screen_name, snack.name, format_score(score), club.name
        )
    } else {
        format!(
            "{} gaf {} een {} bij {}",
            user.screen_name, snack.name, format_score(score), club.name
        )
    };
    push_activity(
        ctx,
        ActivityKind::RatingSubmitted,
        snack.club_id,
        user.id,
        snack_id,
        text,
    );

    // Klom de snack naar #1?
    let new_top = current_top_snack(ctx, snack.club_id);
    if let (Some(new), Some(prev)) = (new_top, prev_top) {
        if new != prev && new == snack_id && stats_count >= 2 {
            push_activity(
                ctx,
                ActivityKind::SnackClimbed,
                snack.club_id,
                0,
                snack_id,
                format!("🚀 {} stijgt naar #1 bij {}", snack.name, club.name),
            );
        }
    }

    Ok(())
}

#[reducer]
pub fn vote_rating(
    ctx: &ReducerContext,
    rating_id: u64,
    value: i8,
) -> Result<(), String> {
    let me = require_user(ctx)?;
    if value != 1 && value != -1 {
        return Err("Stem moet +1 of -1 zijn".into());
    }
    let target = ctx.db.rating().id().find(rating_id)
        .ok_or("Rating niet gevonden")?;
    if target.user_id == me.id {
        return Err("Je kan niet op je eigen rating stemmen".into());
    }
    require_membership(ctx, me.id, target.club_id)?;
    enforce_rate_limit(ctx, "vote_rating", 2)?;
    // Upsert / toggle
    let existing = ctx.db.rating_vote().iter()
        .find(|v| v.rating_id == rating_id && v.voter_user_id == me.id);
    if let Some(mut v) = existing {
        if v.value == value {
            // zelfde stem opnieuw → trek'm in
            ctx.db.rating_vote().id().delete(v.id);
        } else {
            v.value = value;
            v.created_at = ctx.timestamp;
            ctx.db.rating_vote().id().update(v);
        }
    } else {
        ctx.db.rating_vote().insert(RatingVote {
            id: 0,
            rating_id,
            voter_user_id: me.id,
            value,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}
