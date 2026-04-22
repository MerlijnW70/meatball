//! Voetbalwedstrijd-simulator — server-authoritative, realistic physics.
//!
//! Motion-model:
//! - Momentum: elke speler heeft velocity; accelereert naar desired-velocity
//!   met beperkte versnelling + max-speed per role.
//! - Ball physics: constante velocity + friction i.p.v. exponential lerp.
//! - Line discipline: alleen dichtstbijzijnde opponent prest de carrier;
//!   rest houdt formatie.
//! - Collision avoidance: soft repulsion als spelers binnen 3u van elkaar zijn.
//! - Receiver anticipation: speler dicht bij bal-in-flight loopt ernaar toe.

use sha2::{Digest, Sha256};
use spacetimedb::{reducer, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::helpers::{enforce_rate_limit, require_user};
use crate::tables::{
    club, club_membership, football_match, group, group_membership, match_event,
    match_player, match_pos_tick, match_tick, user, user_position, FootballMatch,
    MatchEvent, MatchEventKind, MatchPlayer, MatchPosTick, MatchTick,
};

const MATCH_MINUTES: u32 = 90;
const MAX_MATCHES_PER_DAY: u64 = 30;
/// Max tegelijk-live matches met deze entity (club of team) aan één kant.
/// Voorkomt dat 10 users samen 100 live wedstrijden tegen één kantine
/// starten en zo subscription-broadcasts + scheduled-ticks floodden.
const MAX_ACTIVE_MATCHES_PER_ENTITY: usize = 3;
// Wall-clock: 90 game-minutes in 60s (was 30s) → rustiger tempo.
const TICK_MICROS: i64 = 666_000;               // ~1.5 events per sec
const POS_TICK_MICROS: i64 = 100_000;           // 10Hz — motion blijft smooth
const DT: f32 = 0.1;
const EVENT_PAUSE_MICROS: i64 = 900_000;        // iets langer pauze na goals

// Motion-parameters — gehalveerd zodat dots minder rennen, meer realistisch.
const MAX_ACCEL: f32 = 28.0;                    // u/s²
const WALK_SPEED: f32 = 5.0;                    // u/s
const JOG_SPEED: f32 = 8.0;
const SPRINT_SPEED: f32 = 14.0;
const COLLISION_RADIUS: f32 = 2.8;
const BALL_FRICTION: f32 = 0.92;                // iets meer drag = bal rolt rustiger uit
const BALL_CATCH_RADIUS: f32 = 3.0;
const PASS_BASE_SPEED: f32 = 25.0;              // zachtere passes
const PASS_DIST_SPEED: f32 = 0.8;
const PASS_MAX_SPEED: f32 = 55.0;               // shots nog steeds duidelijk sneller

const FIELD_SLOTS: &[&str] = &[
    "keeper",
    "lb", "lcb", "rcb", "rb",
    "lm", "cm", "rm",
    "lw", "st", "rw",
];

const BOT_COLOR: &str = "ink";
const BOT_ICON: &str = "🤖";

// ── RNG ─────────────────────────────────────────────────────────

struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self { Self(if seed == 0 { 0xDEAD_BEEF_CAFE_BABE } else { seed }) }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0; x ^= x << 13; x ^= x >> 7; x ^= x << 17; self.0 = x; x
    }
    fn range(&mut self, n: u32) -> u32 {
        if n == 0 { 0 } else { (self.next_u64() % n as u64) as u32 }
    }
    fn chance(&mut self, pct: u32) -> bool { self.range(100) < pct.min(100) }
    fn pick<T: Copy>(&mut self, xs: &[T]) -> Option<T> {
        if xs.is_empty() { None } else { Some(xs[self.range(xs.len() as u32) as usize]) }
    }
}

fn seed_from(home_id: u64, away_id: u64, ts: i64) -> u64 {
    let mut h = Sha256::new();
    h.update(b"meatball-match-v6");
    h.update(home_id.to_le_bytes()); h.update(away_id.to_le_bytes()); h.update(ts.to_le_bytes());
    let d = h.finalize();
    u64::from_le_bytes([d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]])
}

fn seed_for_minute(match_seed: u64, minute: u32) -> u64 {
    let mut h = Sha256::new();
    h.update(b"minute"); h.update(match_seed.to_le_bytes()); h.update(minute.to_le_bytes());
    let d = h.finalize();
    u64::from_le_bytes([d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]])
}

fn seed_for_sim(match_seed: u64, sim_tick_micros: i64) -> u64 {
    let mut h = Sha256::new();
    h.update(b"sim"); h.update(match_seed.to_le_bytes()); h.update(sim_tick_micros.to_le_bytes());
    let d = h.finalize();
    u64::from_le_bytes([d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]])
}

// ── Coord helpers ───────────────────────────────────────────────

fn slot_index(slot: &str) -> usize { FIELD_SLOTS.iter().position(|s| *s == slot).unwrap_or(0) }

fn slot_line(slot: &str) -> &'static str {
    match slot {
        "keeper" => "gk",
        "lb" | "lcb" | "rcb" | "rb" => "def",
        "lm" | "cm" | "rm" => "mid",
        "lw" | "st" | "rw" => "att",
        _ => "bench",
    }
}

fn base_coord(side: &str, slot: &str) -> (f32, f32) {
    const HOME: [(f32, f32); 11] = [
        (50.0, 95.0),
        (20.0, 82.0), (38.0, 82.0), (62.0, 82.0), (80.0, 82.0),
        (25.0, 70.0), (50.0, 70.0), (75.0, 70.0),
        (25.0, 58.0), (50.0, 58.0), (75.0, 58.0),
    ];
    const AWAY: [(f32, f32); 11] = [
        (50.0, 5.0),
        (80.0, 18.0), (62.0, 18.0), (38.0, 18.0), (20.0, 18.0),
        (75.0, 30.0), (50.0, 30.0), (25.0, 30.0),
        (75.0, 42.0), (50.0, 42.0), (25.0, 42.0),
    ];
    let idx = slot_index(slot);
    if side == "home" { HOME[idx] } else { AWAY[idx] }
}

fn dist(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}

// ── Lineup (voor event simulatie) ───────────────────────────────

#[derive(Copy, Clone)]
struct LineupRow { match_player_id: u64, slot_index: usize }

struct Lineup { players: Vec<LineupRow> }
impl Lineup {
    fn keeper(&self) -> Option<LineupRow> { self.players.iter().find(|p| p.slot_index == 0).copied() }
    fn defenders(&self) -> Vec<LineupRow> {
        self.players.iter().filter(|p| (1..=4).contains(&p.slot_index)).copied().collect()
    }
    fn midfielders(&self) -> Vec<LineupRow> {
        self.players.iter().filter(|p| (5..=7).contains(&p.slot_index)).copied().collect()
    }
    fn attackers(&self) -> Vec<LineupRow> {
        self.players.iter().filter(|p| (8..=10).contains(&p.slot_index)).copied().collect()
    }
    fn attack_power(&self) -> u32 {
        (self.attackers().len() as u32) * 2 + (self.midfielders().len() as u32) + 1
    }
    fn defense_power(&self) -> u32 {
        (self.defenders().len() as u32) * 2 + (self.midfielders().len() as u32)
            + if self.keeper().is_some() { 3 } else { 0 } + 1
    }
}

fn rebuild_lineup(ctx: &ReducerContext, match_id: u64, side: &str) -> Lineup {
    let mut players = Vec::with_capacity(11);
    for mp in ctx.db.match_player().iter()
        .filter(|p| p.match_id == match_id && p.side == side)
    {
        players.push(LineupRow {
            match_player_id: mp.id, slot_index: slot_index(&mp.slot),
        });
    }
    Lineup { players }
}

// ── Opbouw lineup + initial state ───────────────────────────────

fn build_and_insert_lineup(
    ctx: &ReducerContext, match_id: u64, entity_id: u64, is_group: bool, side: &str,
) {
    let mut member_ids: Vec<u64> = if is_group {
        ctx.db.group_membership().iter()
            .filter(|m| m.group_id == entity_id).map(|m| m.user_id).collect()
    } else {
        ctx.db.club_membership().iter()
            .filter(|m| m.club_id == entity_id).map(|m| m.user_id).collect()
    };
    member_ids.sort_unstable();

    let mut slot_owner: [Option<u64>; 11] = [None; 11];
    for uid in &member_ids {
        let pos = match ctx.db.user_position().user_id().find(*uid) {
            Some(p) => p.position, None => continue,
        };
        if let Some(idx) = FIELD_SLOTS.iter().position(|s| *s == pos) {
            if slot_owner[idx].is_none() { slot_owner[idx] = Some(*uid); }
        }
    }

    let mut bot_counter: u32 = 0;
    for (idx, slot) in FIELD_SLOTS.iter().enumerate() {
        let (x, y) = base_coord(side, slot);
        if let Some(uid) = slot_owner[idx] {
            let u = ctx.db.user().id().find(uid);
            let (name, color, icon) = u
                .map(|u| (u.screen_name, u.avatar_color, u.avatar_icon))
                .unwrap_or_else(|| ("speler".into(), "pop".into(), "🥩".into()));
            ctx.db.match_player().insert(MatchPlayer {
                id: 0, match_id, side: side.to_string(), slot: (*slot).to_string(),
                user_id: uid, bot_slot: 0, display_name: name,
                avatar_color: color, avatar_icon: icon,
                x, y, vx: 0.0, vy: 0.0,
            });
        } else {
            bot_counter += 1;
            ctx.db.match_player().insert(MatchPlayer {
                id: 0, match_id, side: side.to_string(), slot: (*slot).to_string(),
                user_id: 0, bot_slot: bot_counter,
                display_name: format!("Bot #{}", bot_counter),
                avatar_color: BOT_COLOR.to_string(),
                avatar_icon: BOT_ICON.to_string(),
                x, y, vx: 0.0, vy: 0.0,
            });
        }
    }
}

// ── simulate_match ───────────────────────────────────────────────

#[reducer]
pub fn simulate_match(
    ctx: &ReducerContext,
    home_id: u64, home_is_group: bool,
    away_id: u64, away_is_group: bool,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "simulate_match", 10)?;
    if home_id == away_id && home_is_group == away_is_group {
        return Err("Kies een andere tegenstander".into());
    }
    let home_name = entity_name(ctx, home_id, home_is_group)
        .ok_or("Thuis-team/kantine niet gevonden")?;
    let away_name = entity_name(ctx, away_id, away_is_group)
        .ok_or("Uit-team/kantine niet gevonden")?;

    // Authorization: user moet met minstens één van beide zijden verbonden
    // zijn (lid van het team óf lid van de kantine). Voorkomt dat random
    // users server-werk kunnen triggeren voor entiteiten die ze niet kennen.
    let is_member_of = |id: u64, is_group: bool| -> bool {
        if is_group {
            ctx.db.group_membership().iter()
                .any(|m| m.group_id == id && m.user_id == user.id)
        } else {
            ctx.db.club_membership().iter()
                .any(|m| m.club_id == id && m.user_id == user.id)
        }
    };
    if !is_member_of(home_id, home_is_group) && !is_member_of(away_id, away_is_group) {
        return Err("Kies minstens één team of kantine waar jij bij hoort".into());
    }

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let day_ago = now_micros.saturating_sub(86_400 * 1_000_000);
    let todays = ctx.db.football_match().iter()
        .filter(|m| m.created_by == user.id
            && m.created_at.to_micros_since_unix_epoch() >= day_ago)
        .count() as u64;
    if todays >= MAX_MATCHES_PER_DAY {
        return Err("Je hebt vandaag al genoeg wedstrijden gespeeld".into());
    }

    // Per-entity cap op tegelijk-live matches — geldt voor zowel home als away.
    let count_live = |id: u64, is_group: bool| -> usize {
        ctx.db.football_match().iter()
            .filter(|m| m.is_live
                && ((m.home_club_id == id && m.home_is_group == is_group)
                    || (m.away_club_id == id && m.away_is_group == is_group)))
            .count()
    };
    if count_live(home_id, home_is_group) >= MAX_ACTIVE_MATCHES_PER_ENTITY {
        return Err("Thuis-entity zit al in te veel live wedstrijden".into());
    }
    if count_live(away_id, away_is_group) >= MAX_ACTIVE_MATCHES_PER_ENTITY {
        return Err("Uit-entity zit al in te veel live wedstrijden".into());
    }

    let seed = seed_from(home_id, away_id, now_micros);
    let match_row = ctx.db.football_match().insert(FootballMatch {
        id: 0,
        home_club_id: home_id, away_club_id: away_id,
        home_is_group, away_is_group,
        home_score: 0, away_score: 0, seed,
        created_by: user.id, created_at: ctx.timestamp,
        ball_x: 50.0, ball_y: 50.0,
        ball_vx: 0.0, ball_vy: 0.0,
        ball_target_x: 50.0, ball_target_y: 50.0,
        phase: "neutral".into(), phase_set_at: ctx.timestamp,
        last_action_player_id: 0, last_action_side: "".into(),
        ball_carrier_id: 0, possession_side: "".into(),
        next_decision_at: ctx.timestamp,
        sim_paused_until: ctx.timestamp,
        is_live: true,
    });
    let match_id = match_row.id;

    build_and_insert_lineup(ctx, match_id, home_id, home_is_group, "home");
    build_and_insert_lineup(ctx, match_id, away_id, away_is_group, "away");

    insert_event(ctx, match_id, 0, MatchEventKind::KickOff, "", 0,
        &format!("Aftrap: {} – {}", home_name, away_name));

    // Home center-mid start met de bal.
    if let Some(cm) = ctx.db.match_player().iter()
        .find(|p| p.match_id == match_id && p.side == "home" && p.slot == "cm")
    {
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            m.ball_carrier_id = cm.id;
            m.possession_side = "home".into();
            m.next_decision_at = ctx.timestamp + TimeDuration::from_micros(600_000);
            ctx.db.football_match().id().update(m);
        }
    }

    schedule_match_tick(ctx, match_id, 1);
    schedule_pos_tick(ctx, match_id);
    Ok(())
}

// ── tick_match ──────────────────────────────────────────────────

#[reducer]
pub fn tick_match(ctx: &ReducerContext, tick: MatchTick) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("tick_match mag alleen via de scheduler".into());
    }
    let match_id = tick.match_id;
    let minute = tick.minute;
    let match_row = match ctx.db.football_match().id().find(match_id) {
        Some(m) => m, None => return Ok(()),
    };
    if !match_row.is_live { return Ok(()); }

    let home = rebuild_lineup(ctx, match_id, "home");
    let away = rebuild_lineup(ctx, match_id, "away");
    let mut rng = Rng::new(seed_for_minute(match_row.seed, minute));

    if minute == 45 {
        let home_name = match_entity_name(ctx, &match_row, true);
        let away_name = match_entity_name(ctx, &match_row, false);
        insert_event(ctx, match_id, 45, MatchEventKind::HalfTime, "", 0,
            &format!("Rust: {} {}-{} {}",
                home_name, match_row.home_score, match_row.away_score, away_name));
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            m.ball_target_x = 50.0; m.ball_target_y = 50.0;
            m.ball_vx = 0.0; m.ball_vy = 0.0;
            m.phase = "neutral".into(); m.phase_set_at = ctx.timestamp;
            m.ball_carrier_id = 0; m.possession_side = "home".into();
            m.sim_paused_until = ctx.timestamp + TimeDuration::from_micros(EVENT_PAUSE_MICROS);
            ctx.db.football_match().id().update(m);
        }
    }

    let mut home_score = match_row.home_score;
    let mut away_score = match_row.away_score;
    run_minute(ctx, &mut MinuteArgs {
        match_id, minute,
        home: &home, away: &away,
        rng: &mut rng,
        home_score: &mut home_score,
        away_score: &mut away_score,
    });

    if home_score != match_row.home_score || away_score != match_row.away_score {
        if let Some(mut upd) = ctx.db.football_match().id().find(match_id) {
            upd.home_score = home_score; upd.away_score = away_score;
            ctx.db.football_match().id().update(upd);
        }
    }

    if minute < MATCH_MINUTES {
        schedule_match_tick(ctx, match_id, minute + 1);
    } else {
        let home_name = match_entity_name(ctx, &match_row, true);
        let away_name = match_entity_name(ctx, &match_row, false);
        insert_event(ctx, match_id, MATCH_MINUTES, MatchEventKind::FullTime, "", 0,
            &format!("Einde: {} {}-{} {}",
                home_name, home_score, away_score, away_name));
        if let Some(mut upd) = ctx.db.football_match().id().find(match_id) {
            upd.is_live = false; upd.phase = "neutral".into();
            ctx.db.football_match().id().update(upd);
        }
    }
    Ok(())
}

/// Argumenten van `run_minute`, gegroepeerd om arg-count beheersbaar te houden.
struct MinuteArgs<'a> {
    match_id: u64,
    minute: u32,
    home: &'a Lineup,
    away: &'a Lineup,
    rng: &'a mut Rng,
    home_score: &'a mut u32,
    away_score: &'a mut u32,
}

fn run_minute(ctx: &ReducerContext, m: &mut MinuteArgs<'_>) {
    let match_id = m.match_id;
    let minute = m.minute;
    let home = m.home;
    let away = m.away;
    let rng = &mut *m.rng;
    let home_score = &mut *m.home_score;
    let away_score = &mut *m.away_score;
    let home_att = home.attack_power(); let home_def = home.defense_power();
    let away_att = away.attack_power(); let away_def = away.defense_power();
    if !rng.chance(55) { return; }

    let home_edge = home_att * 100 / (home_att + away_def).max(1);
    let side_home = rng.chance(home_edge);
    let (att_lu, opp_def) = if side_home { (home, away_def) } else { (away, home_def) };
    let att_power = if side_home { home_att } else { away_att };
    let shot_goal_pct = (att_power * 55 / (att_power + opp_def).max(1)).clamp(8, 30);

    let scorer = pick_attacker(rng, att_lu);
    let scorer_id = scorer.map(|r| r.match_player_id).unwrap_or(0);
    let scorer_name = player_name(ctx, scorer_id);
    let side_str = if side_home { "home" } else { "away" };
    let opp_side_str = if side_home { "away" } else { "home" };
    let opp_lu = if side_home { away } else { home };

    if scorer_id != 0 {
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            m.ball_carrier_id = scorer_id;
            m.possession_side = side_str.into();
            m.next_decision_at = ctx.timestamp + TimeDuration::from_micros(400_000);
            ctx.db.football_match().id().update(m);
        }
    }
    set_phase(ctx, match_id, &format!("{}_attack", side_str), scorer_id, side_str);

    if rng.chance(shot_goal_pct) {
        if side_home { *home_score += 1; } else { *away_score += 1; }
        let goal_y = if side_home { 2.0 } else { 98.0 };
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            // Shot = ball vliegt met constante velocity richting doel
            let dx = 50.0 - m.ball_x;
            let dy = goal_y - m.ball_y;
            let dist = (dx * dx + dy * dy).sqrt().max(0.01);
            m.ball_vx = dx / dist * PASS_MAX_SPEED;
            m.ball_vy = dy / dist * PASS_MAX_SPEED;
            m.ball_target_x = 50.0; m.ball_target_y = goal_y;
            m.ball_carrier_id = 0;
            m.possession_side = opp_side_str.into();
            m.sim_paused_until = ctx.timestamp + TimeDuration::from_micros(EVENT_PAUSE_MICROS);
            ctx.db.football_match().id().update(m);
        }
        insert_event(ctx, match_id, minute, MatchEventKind::Goal, side_str, scorer_id,
            &format!("⚽ GOAL! {} scoort ({}-{})",
                scorer_name, home_score, away_score));
    } else if rng.chance(55) {
        let keeper = opp_lu.keeper();
        let keeper_id = keeper.map(|r| r.match_player_id).unwrap_or(0);
        let kname = player_name(ctx, keeper_id);
        if keeper_id != 0 {
            if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
                m.ball_carrier_id = keeper_id;
                m.possession_side = opp_side_str.into();
                m.ball_vx = 0.0; m.ball_vy = 0.0;
                m.next_decision_at = ctx.timestamp + TimeDuration::from_micros(700_000);
                m.sim_paused_until = ctx.timestamp + TimeDuration::from_micros(400_000);
                ctx.db.football_match().id().update(m);
            }
        }
        insert_event(ctx, match_id, minute, MatchEventKind::SaveByKeeper,
            opp_side_str, keeper_id,
            &format!("🧤 {} redt een schot", kname));
    } else if rng.chance(50) {
        insert_event(ctx, match_id, minute, MatchEventKind::Miss, side_str, scorer_id,
            &format!("😬 {} mist naast het doel", scorer_name));
    } else {
        insert_event(ctx, match_id, minute, MatchEventKind::Corner, side_str, 0,
            "🚩 Hoekschop");
    }

    if rng.chance(18) {
        let defs = opp_lu.defenders();
        let tackler = rng.pick(&defs);
        let tid = tackler.map(|r| r.match_player_id).unwrap_or(0);
        let tname = player_name(ctx, tid);
        if tid != 0 {
            if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
                m.ball_carrier_id = tid;
                m.possession_side = opp_side_str.into();
                m.ball_vx = 0.0; m.ball_vy = 0.0;
                m.next_decision_at = ctx.timestamp + TimeDuration::from_micros(500_000);
                ctx.db.football_match().id().update(m);
            }
        }
        insert_event(ctx, match_id, minute, MatchEventKind::Tackle,
            opp_side_str, tid,
            &format!("🦵 {} tackelt door", tname));
    }
}

// ── tick_positions — continuous sim met momentum + physics ──────

#[reducer]
pub fn tick_positions(ctx: &ReducerContext, tick: MatchPosTick) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("tick_positions mag alleen via de scheduler".into());
    }
    let match_id = tick.match_id;
    let match_row = match ctx.db.football_match().id().find(match_id) {
        Some(m) => m, None => return Ok(()),
    };
    if !match_row.is_live { return Ok(()); }

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let paused = now_micros < match_row.sim_paused_until.to_micros_since_unix_epoch();

    let players: Vec<MatchPlayer> = ctx.db.match_player().iter()
        .filter(|p| p.match_id == match_id).collect();

    // Carrier / decision state
    let mut new_carrier = match_row.ball_carrier_id;
    let mut new_possession = match_row.possession_side.clone();
    let mut new_next_decision = match_row.next_decision_at;
    let mut new_phase = match_row.phase.clone();
    let mut new_phase_set_at = match_row.phase_set_at;
    let mut new_ball_vx = match_row.ball_vx;
    let mut new_ball_vy = match_row.ball_vy;
    let mut new_ball_target = (match_row.ball_target_x, match_row.ball_target_y);

    if !paused {
        let mut rng = Rng::new(seed_for_sim(match_row.seed, now_micros));

        if match_row.ball_carrier_id == 0 {
            // Ball in flight — check of een speler dichtbij genoeg is
            let nearest = players.iter()
                .filter(|p| p.slot != "keeper" || is_keeper_catch(match_row.ball_x, match_row.ball_y, p))
                .min_by(|a, b| dist(a.x, a.y, match_row.ball_x, match_row.ball_y)
                    .partial_cmp(&dist(b.x, b.y, match_row.ball_x, match_row.ball_y))
                    .unwrap_or(std::cmp::Ordering::Equal));
            if let Some(n) = nearest {
                let d = dist(n.x, n.y, match_row.ball_x, match_row.ball_y);
                let ball_slow = (match_row.ball_vx.powi(2) + match_row.ball_vy.powi(2)).sqrt() < 5.0;
                // Speler vangt als binnen radius OF bal bijna stilstaat
                if d < BALL_CATCH_RADIUS || (ball_slow && d < 6.0) {
                    new_carrier = n.id;
                    new_possession = n.side.clone();
                    new_ball_vx = 0.0; new_ball_vy = 0.0;
                    new_next_decision = ctx.timestamp
                        + TimeDuration::from_micros(500_000 + (rng.range(700) as i64 * 1000));
                }
            }
        } else if now_micros >= match_row.next_decision_at.to_micros_since_unix_epoch() {
            // Carrier beslist
            if let Some(carrier) = players.iter().find(|p| p.id == match_row.ball_carrier_id) {
                let roll = rng.range(100);
                if roll < 55 {
                    // Pass richting voorwaartse teammate
                    let mut candidates: Vec<&MatchPlayer> = players.iter()
                        .filter(|p| p.side == carrier.side && p.id != carrier.id
                            && p.slot != "keeper")
                        .filter(|p| dist(carrier.x, carrier.y, p.x, p.y) < 35.0)
                        .collect();
                    candidates.sort_by(|a, b| {
                        let a_fwd = if carrier.side == "home" { carrier.y - a.y } else { a.y - carrier.y };
                        let b_fwd = if carrier.side == "home" { carrier.y - b.y } else { b.y - carrier.y };
                        b_fwd.partial_cmp(&a_fwd).unwrap_or(std::cmp::Ordering::Equal)
                    });
                    let top: Vec<&MatchPlayer> = candidates.into_iter().take(3).collect();
                    if !top.is_empty() {
                        let receiver = top[rng.range(top.len() as u32) as usize];
                        let dx = receiver.x - carrier.x;
                        let dy = receiver.y - carrier.y;
                        let d = (dx * dx + dy * dy).sqrt().max(0.01);
                        let pass_speed = (PASS_BASE_SPEED + d * PASS_DIST_SPEED).min(PASS_MAX_SPEED);
                        new_ball_vx = dx / d * pass_speed;
                        new_ball_vy = dy / d * pass_speed;
                        new_ball_target = (receiver.x, receiver.y);
                        new_carrier = 0;
                        new_next_decision = ctx.timestamp
                            + TimeDuration::from_micros(400_000);
                    } else {
                        new_next_decision = ctx.timestamp + TimeDuration::from_micros(400_000);
                    }
                } else if roll < 67 {
                    // Turnover — dichtsbijzijnde opponent tackelt
                    let nearest_opp = players.iter()
                        .filter(|p| p.side != carrier.side && p.slot != "keeper")
                        .min_by(|a, b| {
                            dist(carrier.x, carrier.y, a.x, a.y)
                                .partial_cmp(&dist(carrier.x, carrier.y, b.x, b.y))
                                .unwrap_or(std::cmp::Ordering::Equal)
                        });
                    if let Some(opp) = nearest_opp {
                        if dist(carrier.x, carrier.y, opp.x, opp.y) < 18.0 {
                            new_carrier = opp.id;
                            new_possession = opp.side.clone();
                            new_ball_vx = 0.0; new_ball_vy = 0.0;
                            new_next_decision = ctx.timestamp
                                + TimeDuration::from_micros(600_000);
                        } else {
                            new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                        }
                    } else {
                        new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                    }
                } else {
                    // Dribbel verder
                    new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                }
            }
        }

        // Fase updaten
        let desired_phase = match new_possession.as_str() {
            "home" => "home_attack",
            "away" => "away_attack",
            _ => "neutral",
        };
        if desired_phase != new_phase.as_str() {
            new_phase = desired_phase.to_string();
            new_phase_set_at = ctx.timestamp;
        }
    }

    // ── Bereken closest presser (line discipline) ────────────────
    let carrier_ref = if new_carrier != 0 {
        players.iter().find(|p| p.id == new_carrier)
    } else { None };
    let presser_id: u64 = if let Some(c) = carrier_ref {
        players.iter()
            .filter(|p| p.side != c.side && p.slot != "keeper")
            .min_by(|a, b| dist(a.x, a.y, c.x, c.y)
                .partial_cmp(&dist(b.x, b.y, c.x, c.y))
                .unwrap_or(std::cmp::Ordering::Equal))
            .map(|p| p.id).unwrap_or(0)
    } else { 0 };

    // Ball in flight? Intended receiver = dichtsbijzijnde teammate van possession-side
    // die richting bal-target beweegt.
    let interceptor_id: u64 = if new_carrier == 0 && !new_possession.is_empty() {
        players.iter()
            .filter(|p| p.side == new_possession && p.slot != "keeper")
            .min_by(|a, b| {
                dist(a.x, a.y, new_ball_target.0, new_ball_target.1)
                    .partial_cmp(&dist(b.x, b.y, new_ball_target.0, new_ball_target.1))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|p| p.id).unwrap_or(0)
    } else { 0 };

    // ── Phase-strength: ramp van 0 → 1 over ~1.5s zodat korte
    //     possession-flips geen full team-swing triggeren (was 'wave-effect').
    let phase_age_micros = now_micros
        - new_phase_set_at.to_micros_since_unix_epoch();
    let phase_age_s = (phase_age_micros as f32) / 1_000_000.0;
    let phase_strength: f32 = if phase_age_s < 0.4 {
        0.0 // hele korte flip: nog geen shift
    } else if phase_age_s < 1.8 {
        // smoothstep tussen 0.4s en 1.8s
        let t = (phase_age_s - 0.4) / 1.4;
        t * t * (3.0 - 2.0 * t)
    } else {
        1.0
    };

    // ── Compute new pos+velocity for each player ─────────────────
    let mut new_state: Vec<(u64, f32, f32, f32, f32)> = Vec::with_capacity(players.len());
    let tctx = TargetCtx {
        phase: &new_phase,
        possession_side: &new_possession,
        carrier_id: new_carrier,
        presser_id,
        interceptor_id,
        now_micros,
        players: &players,
        ball_x: match_row.ball_x,
        ball_y: match_row.ball_y,
        ball_vx: match_row.ball_vx,
        ball_vy: match_row.ball_vy,
        ball_target: new_ball_target,
        phase_strength,
    };
    for p in &players {
        let target = compute_target(p, &tctx);
        let max_speed = max_speed_for(p, new_carrier, presser_id, interceptor_id);
        let (nvx, nvy) = advance_velocity(p.vx, p.vy, target, (p.x, p.y), max_speed);
        let nx = (p.x + nvx * DT).clamp(1.0, 99.0);
        let ny = (p.y + nvy * DT).clamp(1.0, 99.0);
        new_state.push((p.id, nx, ny, nvx, nvy));
    }

    // ── Collision avoidance (pairwise, symmetric) ────────────────
    apply_collisions(&mut new_state);

    // ── Persist per-player state ─────────────────────────────────
    for (id, nx, ny, nvx, nvy) in &new_state {
        if let Some(mut upd) = ctx.db.match_player().id().find(*id) {
            upd.x = *nx; upd.y = *ny; upd.vx = *nvx; upd.vy = *nvy;
            ctx.db.match_player().id().update(upd);
        }
    }

    // ── Ball physics update ──────────────────────────────────────
    let (new_bx, new_by, final_bvx, final_bvy) = if new_carrier != 0 {
        // Dribble: bal plakt aan carrier (met lichte voorsprong richting doel)
        if let Some(c) = new_state.iter().find(|(id, _, _, _, _)| *id == new_carrier) {
            let (_, cx, cy, _, _) = c;
            // Lerp ball naar carrier (snelle catch-up)
            let bx = match_row.ball_x + (cx - match_row.ball_x) * 0.55;
            let by = match_row.ball_y + (cy - match_row.ball_y) * 0.55;
            (bx, by, 0.0, 0.0)
        } else {
            (match_row.ball_x, match_row.ball_y, 0.0, 0.0)
        }
    } else {
        // Vrije bal: velocity + friction
        let bx = (match_row.ball_x + new_ball_vx * DT).clamp(1.0, 99.0);
        let by = (match_row.ball_y + new_ball_vy * DT).clamp(1.0, 99.0);
        let fvx = new_ball_vx * BALL_FRICTION;
        let fvy = new_ball_vy * BALL_FRICTION;
        (bx, by, fvx, fvy)
    };

    // ── Persist match row ────────────────────────────────────────
    if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
        m.ball_x = new_bx; m.ball_y = new_by;
        m.ball_vx = final_bvx; m.ball_vy = final_bvy;
        m.ball_target_x = new_ball_target.0;
        m.ball_target_y = new_ball_target.1;
        m.ball_carrier_id = new_carrier;
        m.possession_side = new_possession;
        m.next_decision_at = new_next_decision;
        m.phase = new_phase;
        m.phase_set_at = new_phase_set_at;
        ctx.db.football_match().id().update(m);
    }

    schedule_pos_tick(ctx, match_id);
    Ok(())
}

fn is_keeper_catch(ball_x: f32, ball_y: f32, keeper: &MatchPlayer) -> bool {
    // Alleen eigen doel-zone
    let own_goal_y = if keeper.side == "home" { 95.0 } else { 5.0 };
    let in_zone = (ball_y - own_goal_y).abs() < 18.0;
    in_zone && dist(ball_x, ball_y, keeper.x, keeper.y) < 8.0
}

fn max_speed_for(
    p: &MatchPlayer, carrier_id: u64, presser_id: u64, interceptor_id: u64,
) -> f32 {
    if p.slot == "keeper" { return WALK_SPEED; }
    if p.id == carrier_id { return SPRINT_SPEED; }
    if p.id == presser_id { return SPRINT_SPEED; }
    if p.id == interceptor_id { return SPRINT_SPEED; }
    JOG_SPEED
}

/// Momentum-model: velocity accelereert naar desired richting met beperkte
/// acceleration. Zorgt dat spelers niet direct van richting wisselen.
fn advance_velocity(
    cur_vx: f32, cur_vy: f32, target: (f32, f32), pos: (f32, f32), max_speed: f32,
) -> (f32, f32) {
    let dx = target.0 - pos.0;
    let dy = target.1 - pos.1;
    let d = (dx * dx + dy * dy).sqrt();

    // Desired velocity = richting × max_speed (met zachte zone voor dicht-bij)
    let (dvx, dvy) = if d < 0.5 {
        (0.0, 0.0)
    } else if d < 3.0 {
        // Decelereer als we dichtbij zijn — voorkom overshoot
        let factor = d / 3.0;
        (dx / d * max_speed * factor, dy / d * max_speed * factor)
    } else {
        (dx / d * max_speed, dy / d * max_speed)
    };

    // Accelereer naar desired, gecapt op MAX_ACCEL * DT per stap
    let delta_vx = dvx - cur_vx;
    let delta_vy = dvy - cur_vy;
    let delta_mag = (delta_vx * delta_vx + delta_vy * delta_vy).sqrt();
    let max_delta = MAX_ACCEL * DT;
    let (final_vx, final_vy) = if delta_mag <= max_delta || delta_mag < 0.001 {
        (cur_vx + delta_vx, cur_vy + delta_vy)
    } else {
        let f = max_delta / delta_mag;
        (cur_vx + delta_vx * f, cur_vy + delta_vy * f)
    };
    (final_vx, final_vy)
}

/// Pairwise collision resolution. Spelers worden zachtjes uit elkaar geduwd
/// als ze binnen COLLISION_RADIUS komen. Geoptimaliseerd: axis-cull + squared
/// distance comparison skipt sqrt voor niet-botsende pairs (meeste gevallen).
fn apply_collisions(state: &mut [(u64, f32, f32, f32, f32)]) {
    let n = state.len();
    let r = COLLISION_RADIUS;
    let r_sq = r * r;
    for i in 0..n {
        for j in (i + 1)..n {
            let (_, ix, iy, _, _) = state[i];
            let (_, jx, jy, _, _) = state[j];
            let dx = ix - jx;
            let dy = iy - jy;
            // Cheap axis-cull: als één dimensie al te ver, skip meteen
            if dx.abs() > r || dy.abs() > r { continue; }
            let dist_sq = dx * dx + dy * dy;
            if dist_sq > r_sq { continue; }
            if dist_sq <= 0.0001 {
                // Exact op elkaar — pseudo-random spread
                state[i].1 += 0.5;
                state[j].1 -= 0.5;
                continue;
            }
            // Alleen nu sqrt berekenen (zeldzame botsing)
            let d = dist_sq.sqrt();
            let push = (r - d) * 0.5;
            let ux = dx / d;
            let uy = dy / d;
            state[i].1 += ux * push;
            state[i].2 += uy * push;
            state[j].1 -= ux * push;
            state[j].2 -= uy * push;
        }
    }
    // Clamp na collisions
    for s in state.iter_mut() {
        s.1 = s.1.clamp(1.0, 99.0);
        s.2 = s.2.clamp(1.0, 99.0);
    }
}

/// Context voor `compute_target` — wordt per tick één keer opgebouwd en
/// hergebruikt voor alle 22 spelers.
struct TargetCtx<'a> {
    phase: &'a str,
    possession_side: &'a str,
    carrier_id: u64,
    presser_id: u64,
    interceptor_id: u64,
    now_micros: i64,
    players: &'a [MatchPlayer],
    ball_x: f32,
    ball_y: f32,
    ball_vx: f32,
    ball_vy: f32,
    ball_target: (f32, f32),
    /// 0.0 bij vers possession-flip, ramp smooth naar 1.0 over ~1.5s.
    /// Voorkomt dat korte possession-hikjes het hele team terug-en-weer
    /// laten deinen ("wave-effect"). Stabiel bezit = volle team-advance.
    phase_strength: f32,
}

/// Target van een speler. Gelaagd:
///  - Keeper: lateraal mee met bal, komt van lijn bij diepe aanval
///  - Carrier: sprint naar opponent doel
///  - Presser (één per fase): drukt op carrier
///  - Interceptor (bij bal-in-flight): loopt naar receiver-spot
///  - Possession team: aanvalsformatie (aanvallers pushen op)
///  - Defending team: dipt in richting eigen doel, rest houdt lijn
///  - Off-ball aanvaller: maakt runs naar voren (~30% van de tijd)
///  - Sine-wander: 1.5u subtiele micro-motion
fn compute_target(p: &MatchPlayer, tc: &TargetCtx<'_>) -> (f32, f32) {
    let (bx, by) = base_coord(&p.side, &p.slot);
    let line = slot_line(&p.slot);
    let is_carrier = p.id == tc.carrier_id;
    let we_have_ball = tc.possession_side == p.side;
    let carrier_id = tc.carrier_id;
    let presser_id = tc.presser_id;
    let interceptor_id = tc.interceptor_id;
    let now_micros = tc.now_micros;
    let players = tc.players;
    let ball_x = tc.ball_x;
    let ball_y = tc.ball_y;
    let ball_vx = tc.ball_vx;
    let ball_vy = tc.ball_vy;
    let ball_target = tc.ball_target;
    let possession_side = tc.possession_side;
    let _ = tc.phase;

    // ── Keeper: normale lateraal-tracking + duik op shots ────────
    if line == "gk" {
        let own_goal_y = if p.side == "home" { 95.0 } else { 5.0 };
        // Detecteer een schot: bal beweegt snel richting ons doel.
        let ball_speed_sq = ball_vx * ball_vx + ball_vy * ball_vy;
        let approaching_own_goal = if p.side == "home" { ball_vy > 20.0 }
                                   else { ball_vy < -20.0 };
        let ball_deep_opp = if p.side == "home" { ball_y < 30.0 }
                            else { ball_y > 70.0 };
        let (x, y) = if ball_speed_sq > 900.0 && approaching_own_goal
            && (ball_y - own_goal_y).abs() < 25.0
        {
            // DUIK: volledig committen naar bal-x om shot te blokkeren
            let projected_x = ball_x + ball_vx * 0.3; // waar de bal heen vliegt
            (projected_x.clamp(30.0, 70.0), by)
        } else if ball_deep_opp {
            // Bal diep in tegenhelft → van doellijn komen voor sweeper-rol
            let x = bx + (ball_x - bx) * 0.25;
            let off_line_y = if p.side == "home" { 88.0 } else { 12.0 };
            (x.clamp(bx - 12.0, bx + 12.0), off_line_y)
        } else {
            // Standaard: lateraal mee met bal, op eigen lijn
            let x = bx + (ball_x - bx) * 0.35;
            (x.clamp(bx - 10.0, bx + 10.0), by)
        };
        return (x.clamp(2.0, 98.0), y);
    }

    // ── Carrier: sprint naar doel + dribble-evasion bij presser ──
    if is_carrier {
        let goal_y = if p.side == "home" { 8.0 } else { 92.0 };
        let mut tx = bx * 0.4 + ball_x * 0.6;
        let mut ty = by + (goal_y - by) * 0.45;

        // Dribble-evasion: als presser dichtbij, zwenk lateraal weg
        if presser_id != 0 {
            if let Some(presser) = players.iter().find(|pp| pp.id == presser_id) {
                let d = dist(p.x, p.y, presser.x, presser.y);
                if d < 7.0 {
                    // Swerve weg van presser (kies de kant met meer ruimte)
                    let away_x = if presser.x > p.x { p.x - 6.0 } else { p.x + 6.0 };
                    tx = tx * 0.4 + away_x * 0.6;
                    // Bij zware druk, ga even meer lateraal dan voorwaarts
                    ty = ty * 0.7 + p.y * 0.3;
                }
            }
        }

        // Subtiele dribbel-wiggle
        let now_s = (now_micros as f32) / 1_000_000.0;
        let seed = ((p.id % 997) as f32) * 0.137;
        let wx = 1.2 * (now_s * 2.0 + seed).sin();
        return ((tx + wx).clamp(2.0, 98.0), ty.clamp(2.0, 98.0));
    }

    // ── Interceptor: naar ball-target ────────────────────────────
    if p.id == interceptor_id {
        let sine_s = (now_micros as f32) / 1_000_000.0;
        let seed = ((p.id % 997) as f32) * 0.137;
        let w = 0.8 * (sine_s * 1.5 + seed).sin();
        return ((ball_target.0 + w).clamp(2.0, 98.0), ball_target.1.clamp(2.0, 98.0));
    }

    let mut tx = bx;
    let mut ty = by;

    // ── Formatie-shift op basis van possession, gedempt door phase_strength.
    //     Korte possession-flips produceren bijna geen shift (strength ≈ 0).
    //     Stabiel bezit > 1.8s produceert volle team-advance (strength = 1).
    let ws = tc.phase_strength;
    if we_have_ball {
        match line {
            "att" => ty += ws * if p.side == "home" { -14.0 } else { 14.0 },
            "mid" => ty += ws * if p.side == "home" { -9.0 } else { 9.0 },
            "def" => ty += ws * if p.side == "home" { -4.0 } else { 4.0 },
            _ => {}
        }
    } else if !possession_side.is_empty() {
        match line {
            "att" => ty += ws * if p.side == "home" { 10.0 } else { -10.0 },
            "mid" => ty += ws * if p.side == "home" { 6.0 } else { -6.0 },
            "def" => ty += ws * if p.side == "home" { 3.0 } else { -3.0 },
            _ => {}
        }
    }

    // ── Pressure (line-discipline): alleen de aangewezen presser ─
    // Verdedigers pressen NIET — die houden de lijn, zelfs onder druk.
    // Midfielder/attacker mag presser-rol wel oppakken.
    if p.id == presser_id && carrier_id != 0 && line != "def" {
        if let Some(c) = players.iter().find(|pp| pp.id == carrier_id) {
            tx = c.x; ty = c.y;
        }
    }

    // ── Support-run naar carrier (maar niet door def om lijn niet te breken) ─
    if we_have_ball && carrier_id != 0 && p.id != carrier_id && line != "def" {
        if let Some(c) = players.iter().find(|pp| pp.id == carrier_id) {
            let dx = c.x - tx; let dy = c.y - ty;
            let d = (dx * dx + dy * dy).sqrt();
            if d > 22.0 {
                tx += dx * 0.25; ty += dy * 0.25;
            } else if d < 8.0 {
                tx -= dx * 0.20; ty -= dy * 0.20;
            }
        }
    }

    // ── Space-aware off-ball runs voor aanvallers ────────────────
    // In plaats van random naar voren: zoek ruimte aan de kant van het veld
    // weg van de bal-x, zodat we breedte creëren voor de carrier.
    if we_have_ball && line == "att" && !is_carrier && p.id != presser_id {
        let bucket = (now_micros / 1_500_000) as u64;
        let mut h = Sha256::new();
        h.update(b"run"); h.update(p.id.to_le_bytes()); h.update(bucket.to_le_bytes());
        let d = h.finalize();
        if d[0] < 77 {
            // Run naar voren
            let goal_y = if p.side == "home" { 10.0 } else { 90.0 };
            ty += (goal_y - ty) * 0.28;
            // Drijf naar de buitenkant (far van ball_x) voor breedte
            let wide_x = if ball_x < 50.0 { 80.0 } else { 20.0 };
            tx += (wide_x - tx) * 0.15;
        }
    }

    // ── Line cohesion (defense): blijf dicht bij phase-shifted base-y ─
    if line == "def" {
        let phase_by = by + ws * if we_have_ball {
            if p.side == "home" { -4.0 } else { 4.0 }
        } else if !possession_side.is_empty() {
            if p.side == "home" { 3.0 } else { -3.0 }
        } else { 0.0 };
        ty = ty.clamp(phase_by - 4.0, phase_by + 4.0);
    }

    // ── Smooth sine-wander ───────────────────────────────────────
    let now_s = (now_micros as f32) / 1_000_000.0;
    let seed = ((p.id % 997) as f32) * 0.137;
    let wx = 1.4 * (now_s * 0.45 + seed).sin();
    let wy = 1.1 * (now_s * 0.35 + seed * 1.3).cos();
    tx += wx; ty += wy;

    (tx.clamp(2.0, 98.0), ty.clamp(2.0, 98.0))
}

// ── Helpers ─────────────────────────────────────────────────────

fn schedule_match_tick(ctx: &ReducerContext, match_id: u64, minute: u32) {
    let next_at = ctx.timestamp + TimeDuration::from_micros(TICK_MICROS);
    ctx.db.match_tick().insert(MatchTick {
        scheduled_id: 0, scheduled_at: ScheduleAt::Time(next_at), match_id, minute,
    });
}

fn schedule_pos_tick(ctx: &ReducerContext, match_id: u64) {
    let next_at = ctx.timestamp + TimeDuration::from_micros(POS_TICK_MICROS);
    ctx.db.match_pos_tick().insert(MatchPosTick {
        scheduled_id: 0, scheduled_at: ScheduleAt::Time(next_at), match_id,
    });
}

fn set_phase(ctx: &ReducerContext, match_id: u64, phase: &str,
    actor_id: u64, actor_side: &str)
{
    if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
        m.phase = phase.to_string();
        m.phase_set_at = ctx.timestamp;
        m.last_action_player_id = actor_id;
        m.last_action_side = actor_side.to_string();
        ctx.db.football_match().id().update(m);
    }
    let _ = Timestamp::from_micros_since_unix_epoch;
}

fn entity_name(ctx: &ReducerContext, id: u64, is_group: bool) -> Option<String> {
    if is_group { ctx.db.group().id().find(id).map(|g| g.name) }
    else { ctx.db.club().id().find(id).map(|c| c.name) }
}

fn match_entity_name(ctx: &ReducerContext, match_row: &FootballMatch, is_home: bool) -> String {
    let (id, is_group) = if is_home {
        (match_row.home_club_id, match_row.home_is_group)
    } else {
        (match_row.away_club_id, match_row.away_is_group)
    };
    entity_name(ctx, id, is_group).unwrap_or_else(|| "team".into())
}

fn pick_attacker(rng: &mut Rng, lu: &Lineup) -> Option<LineupRow> {
    let att = lu.attackers();
    if !att.is_empty() { return rng.pick(&att); }
    let mid = lu.midfielders();
    if !mid.is_empty() { return rng.pick(&mid); }
    let def = lu.defenders();
    if !def.is_empty() { return rng.pick(&def); }
    None
}

fn player_name(ctx: &ReducerContext, match_player_id: u64) -> String {
    if match_player_id == 0 { return "iemand".into(); }
    ctx.db.match_player().id().find(match_player_id)
        .map(|p| p.display_name).unwrap_or_else(|| "speler".into())
}

fn insert_event(
    ctx: &ReducerContext, match_id: u64, minute: u32,
    kind: MatchEventKind, side: &str, match_player_id: u64, text: &str,
) {
    ctx.db.match_event().insert(MatchEvent {
        id: 0, match_id, minute, kind,
        team_side: side.to_string(),
        match_player_id, text: text.to_string(),
    });
}
