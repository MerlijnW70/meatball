//! Shared helpers: normalisatie, validatie, rate-limit, activity, stats-utils.

use sha2::{Digest, Sha256};
use spacetimedb::{ReducerContext, Table};

use crate::constants::{
    ALLOWED_ACCENT_COLORS, ALLOWED_ACCENT_POSITIONS, ALLOWED_AVATAR_COLORS,
    ALLOWED_AVATAR_ICONS, ALLOWED_PATTERNS, ALLOWED_ROTATIONS,
};
use crate::tables::{
    activity_event, club_membership, rate_limit, snack_stats, user,
    ActivityEvent, ActivityKind, ClubMembership, RateLimit, User,
};

// ─── String-normalisatie & fuzzy dedup ───────────────────────────

pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for ch in s.trim().chars() {
        let c = ch.to_ascii_lowercase();
        if c.is_whitespace() {
            if !prev_space { out.push(' '); prev_space = true; }
        } else if c.is_alphanumeric() || c == '-' {
            out.push(c);
            prev_space = false;
        }
    }
    out
}

/// Bigram Dice-coefficient. 1.0 = identiek, 0 = geen overlap.
pub fn similarity(a: &str, b: &str) -> f32 {
    let x = normalize(a);
    let y = normalize(b);
    if x.is_empty() || y.is_empty() { return 0.0; }
    if x == y { return 1.0; }
    let grams = |s: &str| -> Vec<String> {
        let chars: Vec<char> = s.chars().collect();
        if chars.len() < 2 { return vec![s.to_string()]; }
        (0..chars.len() - 1)
            .map(|i| format!("{}{}", chars[i], chars[i + 1]))
            .collect()
    };
    let ga = grams(&x);
    let gb = grams(&y);
    let mut inter = 0;
    let mut gb_used = vec![false; gb.len()];
    for g in &ga {
        if let Some(j) = gb.iter().enumerate().find_map(|(j, h)| {
            if !gb_used[j] && g == h { Some(j) } else { None }
        }) {
            gb_used[j] = true;
            inter += 1;
        }
    }
    (2.0 * inter as f32) / (ga.len() + gb.len()) as f32
}

// ─── Auth / membership / rate limit ──────────────────────────────

pub fn require_user(ctx: &ReducerContext) -> Result<User, String> {
    ctx.db
        .user()
        .identity()
        .find(ctx.sender())
        .ok_or_else(|| "Geen user geregistreerd voor deze identity".to_string())
}

/// Check dat de user lid is van de club. SpacetimeDB reducers zijn single-threaded
/// atomic — check-then-act is veilig binnen één reducer.
pub fn require_membership(
    ctx: &ReducerContext,
    user_id: u64,
    club_id: u64,
) -> Result<(), String> {
    let is_member = ctx.db.club_membership().iter()
        .any(|m| m.user_id == user_id && m.club_id == club_id);
    if !is_member {
        return Err("Voeg deze kantine eerst toe aan jouw seizoen".into());
    }
    Ok(())
}

/// Per-identity per-action cooldown. Geeft Err als de call binnen `cooldown_secs`
/// na de vorige van dezelfde action komt; anders upsert en Ok.
pub fn enforce_rate_limit(
    ctx: &ReducerContext,
    action: &str,
    cooldown_secs: i64,
) -> Result<(), String> {
    let existing = ctx.db.rate_limit().iter()
        .find(|r| r.identity == ctx.sender() && r.action == action);
    if let Some(r) = existing.as_ref() {
        let last = r.last_at.to_micros_since_unix_epoch();
        let now = ctx.timestamp.to_micros_since_unix_epoch();
        let delta_secs = now.saturating_sub(last) / 1_000_000;
        if delta_secs < cooldown_secs {
            return Err(format!(
                "Rustig aan — nog {}s voor je weer mag",
                cooldown_secs - delta_secs,
            ));
        }
    }
    if let Some(mut r) = existing {
        r.last_at = ctx.timestamp;
        ctx.db.rate_limit().id().update(r);
    } else {
        ctx.db.rate_limit().insert(RateLimit {
            id: 0,
            identity: ctx.sender(),
            action: action.to_string(),
            last_at: ctx.timestamp,
        });
    }
    Ok(())
}

pub fn ensure_membership(ctx: &ReducerContext, user_id: u64, club_id: u64) {
    let exists = ctx.db.club_membership().iter()
        .any(|m| m.user_id == user_id && m.club_id == club_id);
    if !exists {
        ctx.db.club_membership().insert(ClubMembership {
            id: 0, user_id, club_id, joined_at: ctx.timestamp,
        });
    }
}

// ─── Activity feed ───────────────────────────────────────────────

pub fn push_activity(
    ctx: &ReducerContext,
    kind: ActivityKind,
    club_id: u64,
    user_id: u64,
    snack_id: u64,
    text: String,
) {
    ctx.db.activity_event().insert(ActivityEvent {
        id: 0,
        kind,
        club_id,
        user_id,
        snack_id,
        text,
        created_at: ctx.timestamp,
    });
}

pub fn format_score(s: u8) -> String {
    format!("{}", s)
}

/// Top-ranked snack in een club op basis van (avg, count, id).
pub fn current_top_snack(ctx: &ReducerContext, club_id: u64) -> Option<u64> {
    let mut best: Option<(u32, u64, u64)> = None; // (avg_x100, count, snack_id)
    for s in ctx.db.snack_stats().iter().filter(|s| s.club_id == club_id) {
        let key = (s.avg_score_x100, s.rating_count, s.snack_id);
        if best.map_or(true, |b| key > b) {
            best = Some(key);
        }
    }
    best.map(|(_, _, id)| id)
}

// ─── Avatar-helpers ──────────────────────────────────────────────

fn fnv1a(s: &str) -> u32 {
    s.chars().fold(2166136261u32, |acc, c| {
        (acc ^ c as u32).wrapping_mul(16777619)
    })
}

/// Crockford-style base32 zonder verwarrende glyphs (geen 0/O/1/I/L).
const INVITE_ALPHA: &[u8] = b"23456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Module-lokaal "pepper" — niet een security boundary maar maakt het seeden
/// van de hash uniek voor dit deployment. Als je wil wisselen bij rotatie.
const INVITE_PEPPER: &[u8] = b"meatball-invite-v1";

/// 6-char invite code afgeleid van SHA-256 over (pepper, sender identity bytes,
/// timestamp micros, group_id, salt). Cryptografisch moeilijk te raden zelfs
/// als aanvaller alle publieke inputs observeert: SHA-256 is preimage-resistant,
/// dus codes lekken niet uit eerdere outputs. Gecombineerd met de private
/// `invite_secret` tabel + 2s rate-limit op accept, is brute-forcen infeasible.
pub fn gen_invite_code(ctx: &ReducerContext, group_id: u64, salt: u32) -> String {
    let sender_hex = ctx.sender().to_hex().to_string();
    let mut hasher = Sha256::new();
    hasher.update(INVITE_PEPPER);
    hasher.update(sender_hex.as_bytes());
    hasher.update(ctx.timestamp.to_micros_since_unix_epoch().to_le_bytes());
    hasher.update(group_id.to_le_bytes());
    hasher.update(salt.to_le_bytes());
    let digest = hasher.finalize(); // 32 bytes

    // Pak de eerste 15 bytes (120 bits) en map naar 6 chars uit een 30-char alpha.
    // 6 * log2(30) ≈ 29.4 bits nodig; 120 bits is ruim zat voor een uniforme
    // distributie.
    let mut bits: u128 = 0;
    for (i, b) in digest.iter().take(15).enumerate() {
        bits |= (*b as u128) << (i * 8);
    }
    let n = INVITE_ALPHA.len() as u128;
    let mut out = String::with_capacity(6);
    for _ in 0..6 {
        let idx = (bits % n) as usize;
        out.push(INVITE_ALPHA[idx] as char);
        bits /= n;
    }
    out
}

pub fn validate_decor(decor: &str) -> Result<(), String> {
    let parts: Vec<&str> = decor.split('|').collect();
    if parts.len() != 3 { return Err("Ongeldige avatar-decor".into()); }
    if !ALLOWED_PATTERNS.iter().any(|x| *x == parts[0]) {
        return Err("Ongeldig patroon".into());
    }
    let accent = parts[1];
    if accent != "none" {
        let mut ok = false;
        for c in ALLOWED_ACCENT_COLORS {
            for p in ALLOWED_ACCENT_POSITIONS {
                if accent == &format!("{}-{}", c, p) { ok = true; break; }
            }
            if ok { break; }
        }
        if !ok { return Err("Ongeldig accent".into()); }
    }
    if !ALLOWED_ROTATIONS.iter().any(|x| *x == parts[2]) {
        return Err("Ongeldige rotatie".into());
    }
    Ok(())
}

pub fn default_avatar_for(key: &str) -> (&'static str, &'static str, String) {
    let h = fnv1a(key);
    let c = ALLOWED_AVATAR_COLORS[(h as usize) % ALLOWED_AVATAR_COLORS.len()];
    let i = ALLOWED_AVATAR_ICONS[((h >> 8) as usize) % ALLOWED_AVATAR_ICONS.len()];
    let pat = ALLOWED_PATTERNS[((h >> 16) as usize) % ALLOWED_PATTERNS.len()];
    let accent_c = ALLOWED_ACCENT_COLORS[((h >> 20) as usize) % ALLOWED_ACCENT_COLORS.len()];
    let accent_p = ALLOWED_ACCENT_POSITIONS[((h >> 22) as usize) % ALLOWED_ACCENT_POSITIONS.len()];
    let rot = ALLOWED_ROTATIONS[((h >> 24) as usize) % ALLOWED_ROTATIONS.len()];
    let accent = if (h % 4) == 0 {
        "none".to_string()
    } else {
        format!("{}-{}", accent_c, accent_p)
    };
    (c, i, format!("{}|{}|{}", pat, accent, rot))
}
