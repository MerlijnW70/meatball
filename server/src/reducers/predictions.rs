//! Voorspellings-pool voor real-life wedstrijden.
//!
//! Flow:
//! - Trainer maakt MatchFixture aan (tegenstander + datum)
//! - Team-leden submitten voor kickoff hun voorspelde score
//! - Na de wedstrijd voert Trainer de echte uitslag in
//! - Server kent punten toe aan elke voorspelling

use spacetimedb::{reducer, ReducerContext, Table};

use crate::helpers::{enforce_rate_limit, require_user};
use crate::tables::{
    group, group_membership, match_fixture, match_prediction,
    MatchFixture, MatchPrediction,
};

// Buffer vóór kickoff waarin voorspellingen nog geaccepteerd worden.
// 60s buffer voor race-conditions (server-clock vs user-device-clock).
const PREDICTION_LOCKOUT_MICROS: i64 = 60_000_000;

// Max minuten vooruit dat een fixture ingepland mag worden (anti-spam).
const MAX_FIXTURE_FUTURE_DAYS: i64 = 30;

/// Trainer maakt een fixture aan voor een komende wedstrijd.
#[reducer]
pub fn create_match_fixture(
    ctx: &ReducerContext,
    group_id: u64,
    opponent_club_id: u64,
    we_are_home: bool,
    kickoff_at: spacetimedb::Timestamp,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "create_match_fixture", 5)?;

    let group = ctx.db.group().id().find(group_id).ok_or("Team niet gevonden")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de Trainer mag wedstrijden plannen".into());
    }

    // Kickoff moet in de toekomst liggen en binnen een redelijke horizon.
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let kickoff = kickoff_at.to_micros_since_unix_epoch();
    if kickoff <= now {
        return Err("Kickoff moet in de toekomst liggen".into());
    }
    let max_future = now.saturating_add(MAX_FIXTURE_FUTURE_DAYS * 86_400 * 1_000_000);
    if kickoff > max_future {
        return Err(format!(
            "Max {} dagen vooruit inplannen", MAX_FIXTURE_FUTURE_DAYS
        ));
    }

    ctx.db.match_fixture().insert(MatchFixture {
        id: 0,
        group_id,
        opponent_club_id,
        we_are_home,
        kickoff_at,
        created_by: user.id,
        created_at: ctx.timestamp,
        final_home_score: 0,
        final_away_score: 0,
        final_entered: false,
    });
    Ok(())
}

/// Team-lid submit een voorspelling voor een fixture. Alleen geldig
/// tot 60s voor kickoff. Als deze user al een voorspelling heeft voor
/// deze fixture wordt de bestaande overschreven (tot lockout).
#[reducer]
pub fn submit_prediction(
    ctx: &ReducerContext,
    fixture_id: u64,
    home_score: u32,
    away_score: u32,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "submit_prediction", 3)?;

    if home_score > 20 || away_score > 20 {
        return Err("Onrealistische score".into());
    }

    let fixture = ctx.db.match_fixture().id().find(fixture_id)
        .ok_or("Fixture niet gevonden")?;

    // Moet lid zijn van het team waar deze fixture bij hoort.
    let is_member = ctx.db.group_membership().iter()
        .any(|m| m.group_id == fixture.group_id && m.user_id == user.id);
    if !is_member {
        return Err("Alleen team-leden mogen voorspellen".into());
    }

    // Lockout vóór kickoff.
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let kickoff = fixture.kickoff_at.to_micros_since_unix_epoch();
    if now > kickoff.saturating_sub(PREDICTION_LOCKOUT_MICROS) {
        return Err("Voorspellingen zijn gesloten (kickoff te dichtbij)".into());
    }

    if fixture.final_entered {
        return Err("Wedstrijd is al afgelopen".into());
    }

    // Bestaande voorspelling? → update. Anders → insert.
    let existing = ctx.db.match_prediction().iter()
        .find(|p| p.fixture_id == fixture_id && p.user_id == user.id);
    if let Some(mut p) = existing {
        p.home_score = home_score;
        p.away_score = away_score;
        p.submitted_at = ctx.timestamp;
        ctx.db.match_prediction().id().update(p);
    } else {
        ctx.db.match_prediction().insert(MatchPrediction {
            id: 0,
            fixture_id,
            user_id: user.id,
            home_score,
            away_score,
            points_awarded: 0,
            scored: false,
            submitted_at: ctx.timestamp,
        });
    }
    Ok(())
}

/// Trainer voert de echte uitslag in. Server rekent punten toe aan alle
/// voorspellingen volgens:
///   - exacte score: 10 pt
///   - juiste winnaar + goaldiff: 5 pt
///   - juiste winnaar: 3 pt
///   - anders: 0 pt
#[reducer]
pub fn enter_match_result(
    ctx: &ReducerContext,
    fixture_id: u64,
    home_score: u32,
    away_score: u32,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    let mut fixture = ctx.db.match_fixture().id().find(fixture_id)
        .ok_or("Fixture niet gevonden")?;

    let group = ctx.db.group().id().find(fixture.group_id)
        .ok_or("Team verdwenen")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de Trainer mag de uitslag invoeren".into());
    }

    if fixture.final_entered {
        return Err("Uitslag is al ingevoerd".into());
    }
    if home_score > 50 || away_score > 50 {
        return Err("Onrealistische score".into());
    }

    // Uitslag vastleggen.
    fixture.final_home_score = home_score;
    fixture.final_away_score = away_score;
    fixture.final_entered = true;
    ctx.db.match_fixture().id().update(fixture);

    // Scoren van alle voorspellingen voor deze fixture.
    let pred_ids: Vec<u64> = ctx.db.match_prediction().iter()
        .filter(|p| p.fixture_id == fixture_id)
        .map(|p| p.id)
        .collect();
    for pid in pred_ids {
        if let Some(mut pred) = ctx.db.match_prediction().id().find(pid) {
            pred.points_awarded = score_prediction(
                pred.home_score, pred.away_score, home_score, away_score,
            );
            pred.scored = true;
            ctx.db.match_prediction().id().update(pred);
        }
    }
    Ok(())
}

/// Trainer kan een fixture verwijderen (bv. wedstrijd afgelast), ALLEEN
/// als er nog geen uitslag is ingevoerd en er geen voorspellingen zijn.
/// Na uitslag-entry wordt de fixture onderdeel van de geschiedenis.
#[reducer]
pub fn delete_match_fixture(
    ctx: &ReducerContext,
    fixture_id: u64,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    let fixture = ctx.db.match_fixture().id().find(fixture_id)
        .ok_or("Fixture niet gevonden")?;
    let group = ctx.db.group().id().find(fixture.group_id)
        .ok_or("Team verdwenen")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de Trainer mag verwijderen".into());
    }
    if fixture.final_entered {
        return Err("Afgelopen wedstrijden kunnen niet verwijderd worden".into());
    }
    // Verwijder ook alle voorspellingen.
    let pred_ids: Vec<u64> = ctx.db.match_prediction().iter()
        .filter(|p| p.fixture_id == fixture_id)
        .map(|p| p.id)
        .collect();
    for pid in pred_ids {
        ctx.db.match_prediction().id().delete(pid);
    }
    ctx.db.match_fixture().id().delete(fixture_id);
    Ok(())
}

fn score_prediction(
    pred_home: u32, pred_away: u32,
    final_home: u32, final_away: u32,
) -> u32 {
    // Exact juist
    if pred_home == final_home && pred_away == final_away {
        return 10;
    }
    let pred_diff = pred_home as i32 - pred_away as i32;
    let final_diff = final_home as i32 - final_away as i32;
    let pred_winner = pred_diff.signum();
    let final_winner = final_diff.signum();
    if pred_winner == final_winner {
        // Juiste winnaar + zelfde goaldiff
        if pred_diff == final_diff {
            return 5;
        }
        return 3;
    }
    0
}
