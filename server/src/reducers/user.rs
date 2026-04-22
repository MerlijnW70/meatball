//! User registration + avatar.

use spacetimedb::{reducer, ReducerContext, Table};

use crate::constants::{
    ALLOWED_AVATAR_COLORS, ALLOWED_AVATAR_ICONS, ALLOWED_POSITIONS,
    BLOCKED_SUBSTRINGS, RESERVED_NAMES,
};
use crate::helpers::{
    default_avatar_for, enforce_rate_limit, push_activity, require_user, validate_decor,
};
use crate::tables::{session, user, user_position, ActivityKind, User, UserPosition};

/// Registreer of hergebruik screenname voor de huidige identity.
#[reducer]
pub fn register_user(ctx: &ReducerContext, screen_name: String) -> Result<(), String> {
    enforce_rate_limit(ctx, "register_user", 5)?;
    let trimmed = screen_name.trim();

    // Lengte
    let char_count = trimmed.chars().count();
    if char_count < 2 {
        return Err("Minimaal 2 tekens".into());
    }
    if char_count > 24 {
        return Err("Maximaal 24 tekens".into());
    }

    // ASCII-alfanumeriek + _ / - (unicode-letters uitgesloten → geen homoglyph attacks)
    if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Alleen a–z, 0–9, _ en - toegestaan".into());
    }

    // Geen leading/trailing separator
    let first = trimmed.chars().next().unwrap();
    let last = trimmed.chars().last().unwrap();
    if first == '-' || first == '_' || last == '-' || last == '_' {
        return Err("Mag niet beginnen of eindigen met _ of -".into());
    }

    let key = trimmed.to_ascii_lowercase();

    if RESERVED_NAMES.iter().any(|r| *r == key) {
        return Err("Dit woord is gereserveerd".into());
    }
    if BLOCKED_SUBSTRINGS.iter().any(|b| key.contains(*b)) {
        return Err("Niet toegestaan".into());
    }

    // Bestaat deze identity al? → update screenname indien gewenst.
    if let Some(mut existing) = ctx.db.user().identity().find(ctx.sender()) {
        if existing.screen_name_key == key {
            return Ok(());
        }
        // Naam wijziging — botsing check.
        if ctx.db.user().screen_name().find(trimmed.to_string()).is_some() {
            return Err("Screenname is al bezet".into());
        }
        existing.screen_name = trimmed.to_string();
        existing.screen_name_key = key;
        ctx.db.user().id().update(existing);
        return Ok(());
    }

    // Nieuw. Uniqueness op zowel exact als lowercase.
    if ctx.db.user().screen_name().find(trimmed.to_string()).is_some() {
        return Err("Screenname is al bezet".into());
    }
    // Extra check tegen case-varianten ("Merlin" vs "merlin").
    if ctx.db.user().iter().any(|u| u.screen_name_key == key) {
        return Err("Screenname is al bezet".into());
    }

    // Default-avatar: deterministisch afgeleid van de hash van de schermnaam
    // zodat elke nieuwe user direct een herkenbaar plaatje heeft.
    let (def_color, def_icon, def_decor) = default_avatar_for(&key);

    let u = ctx.db.user().insert(User {
        id: 0,
        identity: ctx.sender(),
        screen_name: trimmed.to_string(),
        screen_name_key: key,
        created_at: ctx.timestamp,
        avatar_color: def_color.to_string(),
        avatar_icon: def_icon.to_string(),
        avatar_decor: def_decor,
    });

    // Koppel de user aan de live session (zodat online-count de screenname heeft).
    if let Some(mut sess) = ctx.db.session().identity().find(ctx.sender()) {
        sess.user_id = u.id;
        ctx.db.session().identity().update(sess);
    }

    push_activity(
        ctx,
        ActivityKind::UserRegistered,
        0,
        u.id,
        0,
        format!("{} kwam binnen 🥩", u.screen_name),
    );
    Ok(())
}

#[reducer]
pub fn set_avatar(
    ctx: &ReducerContext,
    color: String,
    icon: String,
    decor: String,
) -> Result<(), String> {
    let mut user = require_user(ctx)?;
    if !ALLOWED_AVATAR_COLORS.iter().any(|c| *c == color) {
        return Err("Ongeldige kleur".into());
    }
    if !ALLOWED_AVATAR_ICONS.iter().any(|i| *i == icon) {
        return Err("Ongeldige icon".into());
    }
    // Hard byte-cap voor vóór-parse — voorkomt dat een zeer lange
    // string die toevallig "valid|valid|valid" als suffix heeft
    // alsnog het avatar-decor veld laat exploderen (storage + replication).
    if decor.len() > 128 {
        return Err("Decor te lang".into());
    }
    validate_decor(&decor)?;
    user.avatar_color = color;
    user.avatar_icon = icon;
    user.avatar_decor = decor;
    ctx.db.user().id().update(user);
    Ok(())
}

/// Upsert de speler-positie. Position moet één van ALLOWED_POSITIONS zijn.
#[reducer]
pub fn set_position(ctx: &ReducerContext, position: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "set_position", 2)?;
    // Normaliseer: trim + lowercase zodat client-varianten ("Keeper", " keeper ")
    // ook werken. ALLOWED_POSITIONS is lowercase dus dit is canonicaal.
    let normalized = position.trim().to_ascii_lowercase();
    if !ALLOWED_POSITIONS.iter().any(|p| *p == normalized) {
        return Err("Ongeldige positie".into());
    }
    if let Some(mut existing) = ctx.db.user_position().user_id().find(user.id) {
        existing.position = normalized;
        existing.updated_at = ctx.timestamp;
        ctx.db.user_position().user_id().update(existing);
    } else {
        ctx.db.user_position().insert(UserPosition {
            user_id: user.id,
            position: normalized,
            updated_at: ctx.timestamp,
        });
    }
    Ok(())
}
