//! Voetbalwedstrijd-simulator — server-authoritative met realistic
//! ball-carrier model.
//!
//! Twee scheduled tick-loops:
//! - `tick_match`  (~333ms = 3Hz): emit highlight-events + update score
//! - `tick_sim`    (~100ms = 10Hz): continuous sim — wie heeft de bal,
//!   passen, dribbelen, posities van spelers, positie van bal
//!
//! Belangrijk: tick_sim is de continu-actie; tick_match is de hoogtepunten.
//! Wanneer tick_match een event emit, pauzeert hij tick_sim kort (~700ms)
//! zodat de dramatische bal-beweging zichtbaar is voordat de sim verder gaat.

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
const TICK_MICROS: i64 = 333_000;       // tick_match (events)
const POS_TICK_MICROS: i64 = 100_000;    // tick_sim (positions + carrier), 10Hz
const EVENT_PAUSE_MICROS: i64 = 700_000; // sim-pause na een highlight-event

const FIELD_SLOTS: &[&str] = &[
    "keeper",
    "lb", "lcb", "rcb", "rb",
    "lm", "cm", "rm",
    "lw", "st", "rw",
];

// Alle bots delen dezelfde look — donker tegen de levendige user-avatars,
// zodat humans visueel eruit springen.
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
    h.update(b"meatball-match-v5");
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

// ── Veld / slots ────────────────────────────────────────────────

fn slot_index(slot: &str) -> usize {
    FIELD_SLOTS.iter().position(|s| *s == slot).unwrap_or(0)
}

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

fn lerp(a: f32, b: f32, t: f32) -> f32 { a + (b - a) * t }
fn dist(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt()
}

// ── Lineup voor event-simulatie (tick_match) ────────────────────

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

// ── Opbouw lineup + initial positions ───────────────────────────

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
                avatar_color: color, avatar_icon: icon, x, y,
            });
        } else {
            bot_counter += 1;
            ctx.db.match_player().insert(MatchPlayer {
                id: 0, match_id, side: side.to_string(), slot: (*slot).to_string(),
                user_id: 0, bot_slot: bot_counter,
                display_name: format!("Bot #{}", bot_counter),
                avatar_color: BOT_COLOR.to_string(),
                avatar_icon: BOT_ICON.to_string(),
                x, y,
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

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let day_ago = now_micros.saturating_sub(86_400 * 1_000_000);
    let todays = ctx.db.football_match().iter()
        .filter(|m| m.created_by == user.id
            && m.created_at.to_micros_since_unix_epoch() >= day_ago)
        .count() as u64;
    if todays >= MAX_MATCHES_PER_DAY {
        return Err("Je hebt vandaag al genoeg wedstrijden gespeeld".into());
    }

    let seed = seed_from(home_id, away_id, now_micros);
    let match_row = ctx.db.football_match().insert(FootballMatch {
        id: 0,
        home_club_id: home_id, away_club_id: away_id,
        home_is_group, away_is_group,
        home_score: 0, away_score: 0, seed,
        created_by: user.id, created_at: ctx.timestamp,
        ball_x: 50.0, ball_y: 50.0, ball_target_x: 50.0, ball_target_y: 50.0,
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

    // Geef home team possessie bij aftrap (center mid).
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

// ── tick_match — events ──────────────────────────────────────────

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
        // Kickoff-reset: center, home has ball weer
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            m.ball_target_x = 50.0; m.ball_target_y = 50.0;
            m.phase = "neutral".into(); m.phase_set_at = ctx.timestamp;
            m.ball_carrier_id = 0; m.possession_side = "home".into();
            m.sim_paused_until = ctx.timestamp + TimeDuration::from_micros(EVENT_PAUSE_MICROS);
            ctx.db.football_match().id().update(m);
        }
    }

    let mut home_score = match_row.home_score;
    let mut away_score = match_row.away_score;
    run_minute(ctx, match_id, minute, &home, &away, &mut rng,
        &mut home_score, &mut away_score);

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
    let _ = club_name; // helper blijft beschikbaar voor andere events
    Ok(())
}

fn run_minute(
    ctx: &ReducerContext, match_id: u64, minute: u32,
    home: &Lineup, away: &Lineup, rng: &mut Rng,
    home_score: &mut u32, away_score: &mut u32,
) {
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

    // Draag bal-attack over aan scorer → sim volgt dat vanzelf.
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
        // Pause sim tijdens goal-animatie.
        if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
            m.ball_target_x = 50.0; m.ball_target_y = goal_y;
            m.ball_carrier_id = 0;
            m.possession_side = opp_side_str.into(); // tegenstander gaat aftrap doen
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
        // Keeper pakt de bal.
        if keeper_id != 0 {
            if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
                m.ball_carrier_id = keeper_id;
                m.possession_side = opp_side_str.into();
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
        // Tackle: possession flips naar defender.
        if tid != 0 {
            if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
                m.ball_carrier_id = tid;
                m.possession_side = opp_side_str.into();
                m.next_decision_at = ctx.timestamp + TimeDuration::from_micros(500_000);
                ctx.db.football_match().id().update(m);
            }
        }
        insert_event(ctx, match_id, minute, MatchEventKind::Tackle,
            opp_side_str, tid,
            &format!("🦵 {} tackelt door", tname));
    }
}

// ── tick_sim (was tick_positions) — 10Hz continuous sim ──────────

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

    // 1. Ball-carrier decisions (alleen als sim niet gepauzeerd)
    let mut new_carrier = match_row.ball_carrier_id;
    let mut new_possession = match_row.possession_side.clone();
    let mut new_ball_target = (match_row.ball_target_x, match_row.ball_target_y);
    let mut new_next_decision = match_row.next_decision_at;
    let mut new_phase = match_row.phase.clone();
    let mut new_phase_set_at = match_row.phase_set_at;

    let players: Vec<MatchPlayer> = ctx.db.match_player().iter()
        .filter(|p| p.match_id == match_id).collect();

    if !paused {
        let mut rng = Rng::new(seed_for_sim(match_row.seed, now_micros));

        // (a) Als bal in flight → check of 'ie aangekomen is → wijs nieuwe carrier aan
        if match_row.ball_carrier_id == 0 {
            let arrived = dist(match_row.ball_x, match_row.ball_y,
                match_row.ball_target_x, match_row.ball_target_y) < 3.5;
            if arrived {
                if let Some(nearest) = nearest_player(&players,
                    match_row.ball_x, match_row.ball_y)
                {
                    new_carrier = nearest.id;
                    new_possession = nearest.side.clone();
                    new_next_decision = ctx.timestamp
                        + TimeDuration::from_micros(500_000 + (rng.range(700) as i64 * 1000));
                }
            }
        } else if now_micros >= match_row.next_decision_at.to_micros_since_unix_epoch() {
            // (b) Carrier moet beslissen
            if let Some(carrier) = players.iter().find(|p| p.id == match_row.ball_carrier_id) {
                let roll = rng.range(100);

                // Kies actie: 55% pass, 12% turnover, 33% blijven dribbelen
                if roll < 55 {
                    // Pass naar nabije teammate (vooruit indien mogelijk).
                    let mut candidates: Vec<&MatchPlayer> = players.iter()
                        .filter(|p| p.side == carrier.side && p.id != carrier.id
                            && p.slot != "keeper")
                        .filter(|p| dist(carrier.x, carrier.y, p.x, p.y) < 35.0)
                        .collect();
                    // Geef voorkeur aan vooruit-passes
                    candidates.sort_by(|a, b| {
                        let a_fwd = if carrier.side == "home" { carrier.y - a.y } else { a.y - carrier.y };
                        let b_fwd = if carrier.side == "home" { carrier.y - b.y } else { b.y - carrier.y };
                        b_fwd.partial_cmp(&a_fwd).unwrap_or(std::cmp::Ordering::Equal)
                    });
                    // Pak bovenste 3 en kies random — mix van doelgericht + variatie
                    let top: Vec<&MatchPlayer> = candidates.into_iter().take(3).collect();
                    if !top.is_empty() {
                        let pick_idx = rng.range(top.len() as u32) as usize;
                        let receiver = top[pick_idx];
                        new_ball_target = (receiver.x, receiver.y);
                        new_carrier = 0; // in flight
                        new_next_decision = ctx.timestamp
                            + TimeDuration::from_micros(400_000);
                    } else {
                        // Geen kandidaat: blijf dribbelen
                        new_next_decision = ctx.timestamp + TimeDuration::from_micros(400_000);
                    }
                } else if roll < 67 {
                    // Turnover: naaste opponent pikt hem af
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
                            new_ball_target = (opp.x, opp.y);
                            new_next_decision = ctx.timestamp
                                + TimeDuration::from_micros(600_000);
                        } else {
                            new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                        }
                    } else {
                        new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                    }
                } else {
                    // Blijf dribbelen
                    new_next_decision = ctx.timestamp + TimeDuration::from_micros(500_000);
                }
            }
        }

        // Fase updaten obv possession
        let desired_phase = match new_possession.as_str() {
            "home" => "home_attack",
            "away" => "away_attack",
            _ => "neutral",
        };
        if desired_phase != new_phase.as_str() {
            new_phase = desired_phase.to_string();
            new_phase_set_at = ctx.timestamp;
        }

        // Bal-target: follows carrier tijdens dribbel.
        if new_carrier != 0 {
            if let Some(c) = players.iter().find(|p| p.id == new_carrier) {
                new_ball_target = (c.x, c.y);
            }
        }
    }

    // 2. Spelers updaten (alleen posities, niet carrier)
    for p in &players {
        let (tx, ty) = compute_target(
            p, &new_phase, &new_possession, new_carrier, now_micros, &players,
            match_row.ball_x, match_row.ball_y,
        );
        let dx = tx - p.x; let dy = ty - p.y;
        let distv = (dx * dx + dy * dy).sqrt();
        // Carrier + opponents sprinten; rest loopt rustiger.
        let is_active = p.id == new_carrier
            || (new_carrier != 0 && p.side != new_possession && distv < 25.0);
        let factor = if distv > 8.0 {
            if is_active { 0.30 } else { 0.20 }
        } else {
            if is_active { 0.18 } else { 0.10 }
        };
        let nx = (p.x + dx * factor).clamp(1.0, 99.0);
        let ny = (p.y + dy * factor).clamp(1.0, 99.0);
        if let Some(mut upd) = ctx.db.match_player().id().find(p.id) {
            upd.x = nx; upd.y = ny;
            ctx.db.match_player().id().update(upd);
        }
    }

    // 3. Bal lerpen — in flight sneller dan dribbel.
    let in_flight = new_carrier == 0;
    let ball_factor = if in_flight { 0.45 } else { 0.35 };
    let new_bx = lerp(match_row.ball_x, new_ball_target.0, ball_factor);
    let new_by = lerp(match_row.ball_y, new_ball_target.1, ball_factor);

    // 4. Alles persisteren
    if let Some(mut m) = ctx.db.football_match().id().find(match_id) {
        m.ball_x = new_bx; m.ball_y = new_by;
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

fn nearest_player<'a>(players: &'a [MatchPlayer], x: f32, y: f32) -> Option<&'a MatchPlayer> {
    players.iter()
        .filter(|p| p.slot != "keeper")
        .min_by(|a, b| {
            dist(a.x, a.y, x, y)
                .partial_cmp(&dist(b.x, b.y, x, y))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

/// Bepaalt waar een speler heen zou moeten. Gelaagd:
///  - Keeper: lateraal mee met bal, uit doel bij diepe aanval tegenpartij
///  - Carrier: sprint naar opponent doel
///  - Possession team: aanvallers/midden pushen op, defense houdt de lijn
///  - Defending team: zakt in, pressure op carrier (binnen 22u)
///  - Support-teammate: loopt richting carrier voor speelopties
///  - Off-ball aanvallers: random runs naar voren (~30% van de tijd)
///  - Smooth sine-wander: 2u subtiele micro-motion
fn compute_target(
    p: &MatchPlayer,
    phase: &str,
    possession_side: &str,
    carrier_id: u64,
    now_micros: i64,
    players: &[MatchPlayer],
    ball_x: f32, ball_y: f32,
) -> (f32, f32) {
    let (bx, by) = base_coord(&p.side, &p.slot);
    let line = slot_line(&p.slot);
    let is_carrier = p.id == carrier_id;
    let we_have_ball = possession_side == p.side;
    let _ = phase; // fase is redundant geworden, possession_side drijft dit nu

    // Keeper logic
    if line == "gk" {
        // Lateraal mee met bal, geclamped op keeper-zone.
        let mut x = bx + (ball_x - bx) * 0.35;
        x = x.clamp(bx - 10.0, bx + 10.0);
        // Off-line als bal diep in tegenhelft zit (tegenstander in aanval)
        let ball_deep_opp = if p.side == "home" { ball_y < 30.0 }
                              else { ball_y > 70.0 };
        let y = if ball_deep_opp {
            if p.side == "home" { 88.0 } else { 12.0 } // 7 off the line
        } else { by };
        return (x.clamp(2.0, 98.0), y);
    }

    // Ball carrier → sprint naar opponent goal
    if is_carrier {
        let goal_y = if p.side == "home" { 8.0 } else { 92.0 };
        let tx = bx * 0.5 + ball_x * 0.5; // lichte neiging naar eigen zone-x
        let ty = by + (goal_y - by) * 0.4;
        // Simple sine wander voor natuurlijke dribbel
        let now_s = (now_micros as f32) / 1_000_000.0;
        let seed = ((p.id % 997) as f32) * 0.137;
        let wx = 1.5 * (now_s * 1.5 + seed).sin();
        return ((tx + wx).clamp(2.0, 98.0), ty.clamp(2.0, 98.0));
    }

    let mut tx = bx;
    let mut ty = by;

    // Possession-shift (vervangt oude phase-shift)
    if we_have_ball {
        match line {
            "att" => ty += if p.side == "home" { -10.0 } else { 10.0 },
            "mid" => ty += if p.side == "home" { -6.0 } else { 6.0 },
            "def" => ty += if p.side == "home" { -3.0 } else { 3.0 },
            _ => {}
        }
    } else if possession_side != "" {
        // Verdedigen — hele team zakt in richting eigen doel
        match line {
            "att" => ty += if p.side == "home" { 8.0 } else { -8.0 },
            "mid" => ty += if p.side == "home" { 5.0 } else { -5.0 },
            "def" => ty += if p.side == "home" { 2.0 } else { -2.0 },
            _ => {}
        }
    }

    // Pressure op carrier (alleen opponent)
    if !we_have_ball && carrier_id != 0 {
        if let Some(c) = players.iter().find(|pp| pp.id == carrier_id) {
            let dx = c.x - tx; let dy = c.y - ty;
            let d = (dx * dx + dy * dy).sqrt();
            if d < 22.0 {
                let f = ((22.0 - d) / 22.0) * 0.40;
                tx += dx * f; ty += dy * f;
            }
        }
    }

    // Support-run: possession-teammate binnen 20u beweegt richting carrier
    if we_have_ball && carrier_id != 0 && p.id != carrier_id {
        if let Some(c) = players.iter().find(|pp| pp.id == carrier_id) {
            let dx = c.x - tx; let dy = c.y - ty;
            let d = (dx * dx + dy * dy).sqrt();
            if d < 20.0 {
                tx += dx * 0.18; ty += dy * 0.18;
            }
        }
    }

    // Off-ball attacker runs: als we de bal hebben en speler is aanvaller,
    // 30% van de tijd een run naar voren (naar opponent goal).
    if we_have_ball && line == "att" && !is_carrier {
        let bucket = (now_micros / 1_500_000) as u64;
        let mut h = Sha256::new();
        h.update(b"run"); h.update(p.id.to_le_bytes()); h.update(bucket.to_le_bytes());
        let d = h.finalize();
        if d[0] < 77 {  // ~30% kans
            let goal_y = if p.side == "home" { 10.0 } else { 90.0 };
            ty += (goal_y - ty) * 0.28;
        }
    }

    // Continue sine-wander — smooth micro-motion.
    let now_s = (now_micros as f32) / 1_000_000.0;
    let seed = ((p.id % 997) as f32) * 0.137;
    let wx = 2.0 * ((now_s * 0.45 + seed).sin()
        + 0.4 * (now_s * 1.3 + seed * 2.1).sin());
    let wy = 1.6 * ((now_s * 0.35 + seed * 1.3).cos()
        + 0.4 * (now_s * 0.9 + seed * 2.5).cos());
    tx += wx; ty += wy;

    (tx.clamp(2.0, 98.0), ty.clamp(2.0, 98.0))
}

// ── Helpers ─────────────────────────────────────────────────────

fn schedule_match_tick(ctx: &ReducerContext, match_id: u64, minute: u32) {
    let next_at = ctx.timestamp + TimeDuration::from_micros(TICK_MICROS);
    ctx.db.match_tick().insert(MatchTick {
        scheduled_id: 0, scheduled_at: ScheduleAt::Time(next_at),
        match_id, minute,
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

fn club_name(ctx: &ReducerContext, club_id: u64) -> String {
    ctx.db.club().id().find(club_id).map(|c| c.name).unwrap_or_else(|| "club".into())
}

/// Naam van een wedstrijd-entiteit (kantine óf team).
fn entity_name(ctx: &ReducerContext, id: u64, is_group: bool) -> Option<String> {
    if is_group {
        ctx.db.group().id().find(id).map(|g| g.name)
    } else {
        ctx.db.club().id().find(id).map(|c| c.name)
    }
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
