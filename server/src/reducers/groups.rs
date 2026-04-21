//! Crew-groepen: invite-only verzameling van gehaktbal-liefhebbers.

use spacetimedb::{reducer, ReducerContext, Table, Timestamp};

use crate::constants::DEDUP_THRESHOLD;
use crate::helpers::{
    enforce_rate_limit, ensure_membership, gen_invite_code, normalize, require_user,
    similarity,
};
use crate::tables::{
    club_membership, group, group_invite, group_invite_reveal, group_membership,
    invite_secret, Group, GroupInvite, GroupInviteReveal, GroupMembership, InviteSecret,
};

/// Reveal-plaintext blijft zichtbaar voor de creator voor 5 min.
const REVEAL_TTL_SECS: i64 = 300;

const MAX_INVITE_CODE_RETRIES: u32 = 8;

#[reducer]
pub fn create_group(ctx: &ReducerContext, name: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "create_group", 10)?;
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count < 3 { return Err("Team-naam te kort".into()); }
    if char_count > 40 { return Err("Team-naam te lang".into()); }

    // Maximaal één team per user (je kan wel extra teams joinen via invite).
    if ctx.db.group().iter().any(|g| g.owner_user_id == user.id) {
        return Err("Je hebt al een team opgericht".into());
    }

    let key = normalize(trimmed);

    // Globale uniqueness: geen twee teams met dezelfde (genormaliseerde) naam.
    if ctx.db.group().iter().any(|g| g.name_key == key) {
        return Err("Deze teamnaam bestaat al — kies een andere".into());
    }

    let group = ctx.db.group().insert(Group {
        id: 0,
        name: trimmed.to_string(),
        name_key: key,
        owner_user_id: user.id,
        created_at: ctx.timestamp,
    });

    // Owner is automatisch lid.
    ctx.db.group_membership().insert(GroupMembership {
        id: 0,
        group_id: group.id,
        user_id: user.id,
        joined_at: ctx.timestamp,
    });

    // Permanente default-uitnodiging: owner krijgt meteen een code te zien zodat
    // hij kan delen zonder eerst door een formulier te hoeven.
    insert_invite(ctx, user.id, group.id, 0, 0)?;

    Ok(())
}

/// Maakt invite + secret + reveal aan. Geen auth-checks — caller is
/// verantwoordelijk.
fn insert_invite(
    ctx: &ReducerContext,
    user_id: u64,
    group_id: u64,
    ttl_secs: i64,
    max_uses: u32,
) -> Result<(), String> {
    let mut code = String::new();
    let mut salt: u32 = ctx.db.invite_secret().iter().count() as u32;
    let mut chosen = false;
    for _ in 0..MAX_INVITE_CODE_RETRIES {
        let candidate = gen_invite_code(ctx, group_id, salt);
        if ctx.db.invite_secret().code().find(candidate.clone()).is_none() {
            code = candidate;
            chosen = true;
            break;
        }
        salt = salt.wrapping_add(1);
    }
    if !chosen {
        return Err("Kon geen unieke code genereren — probeer opnieuw".into());
    }

    let expires_at = if ttl_secs == 0 {
        Timestamp::from_micros_since_unix_epoch(0)
    } else {
        let now = ctx.timestamp.to_micros_since_unix_epoch();
        Timestamp::from_micros_since_unix_epoch(
            now.saturating_add(ttl_secs.saturating_mul(1_000_000)),
        )
    };

    let invite = ctx.db.group_invite().insert(GroupInvite {
        id: 0,
        group_id,
        invited_by: user_id,
        expires_at,
        max_uses,
        uses: 0,
        created_at: ctx.timestamp,
    });

    ctx.db.invite_secret().insert(InviteSecret {
        id: 0,
        code: code.clone(),
        invite_id: invite.id,
    });

    cleanup_stale_reveals(ctx, user_id);

    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let reveal_expires = Timestamp::from_micros_since_unix_epoch(
        now_micros.saturating_add(REVEAL_TTL_SECS.saturating_mul(1_000_000)),
    );
    ctx.db.group_invite_reveal().insert(GroupInviteReveal {
        invite_id: invite.id,
        code,
        invited_by: user_id,
        expires_at: reveal_expires,
    });
    Ok(())
}

/// Expert-only: maak een invite met specifieke TTL / max_uses. De default UX
/// gebruikt `regenerate_group_invite` i.p.v. deze direct.
#[reducer]
pub fn create_group_invite(
    ctx: &ReducerContext,
    group_id: u64,
    ttl_secs: i64,
    max_uses: u32,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "create_group_invite", 5)?;

    if ctx.db.group().id().find(group_id).is_none() {
        return Err("Onbekende crew".into());
    }
    let is_member = ctx.db.group_membership().iter()
        .any(|m| m.group_id == group_id && m.user_id == user.id);
    if !is_member { return Err("Alleen leden mogen uitnodigen".into()); }

    if ttl_secs != 0 && !(60..=2_592_000).contains(&ttl_secs) {
        return Err("Geldigheid moet 60s..30d zijn".into());
    }
    if max_uses > 1000 {
        return Err("Max-uses te hoog (≤1000)".into());
    }

    insert_invite(ctx, user.id, group_id, ttl_secs, max_uses)
}

/// One-click "vervang code": revoke al je eigen codes voor deze crew en
/// maak een nieuwe permanente aan. Andere leden hun codes blijven intact.
#[reducer]
pub fn regenerate_group_invite(
    ctx: &ReducerContext,
    group_id: u64,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "regenerate_group_invite", 5)?;

    if ctx.db.group().id().find(group_id).is_none() {
        return Err("Onbekende crew".into());
    }
    let is_member = ctx.db.group_membership().iter()
        .any(|m| m.group_id == group_id && m.user_id == user.id);
    if !is_member { return Err("Alleen leden mogen uitnodigen".into()); }

    // Revoke alleen MIJN eigen invites voor deze crew.
    let my_invite_ids: Vec<u64> = ctx.db.group_invite().iter()
        .filter(|i| i.group_id == group_id && i.invited_by == user.id)
        .map(|i| i.id)
        .collect();
    for id in my_invite_ids {
        let secret_ids: Vec<u64> = ctx.db.invite_secret().iter()
            .filter(|s| s.invite_id == id).map(|s| s.id).collect();
        for sid in secret_ids { ctx.db.invite_secret().id().delete(sid); }
        ctx.db.group_invite_reveal().invite_id().delete(id);
        ctx.db.group_invite().id().delete(id);
    }

    insert_invite(ctx, user.id, group_id, 0, 0)
}

/// Verwijder reveals van deze creator die ouder zijn dan REVEAL_TTL.
fn cleanup_stale_reveals(ctx: &ReducerContext, user_id: u64) {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let stale: Vec<u64> = ctx.db.group_invite_reveal().iter()
        .filter(|r| r.invited_by == user_id
            && r.expires_at.to_micros_since_unix_epoch() <= now)
        .map(|r| r.invite_id)
        .collect();
    for id in stale {
        ctx.db.group_invite_reveal().invite_id().delete(id);
    }
}

#[reducer]
pub fn accept_group_invite(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "accept_group_invite", 2)?;

    let normalized = code.trim().to_ascii_uppercase();
    if normalized.is_empty() { return Err("Geen code opgegeven".into()); }

    // Lookup in de private InviteSecret tabel.
    let secret = ctx.db.invite_secret().code().find(normalized)
        .ok_or("Code niet gevonden of vervallen")?;
    let mut invite = ctx.db.group_invite().id().find(secret.invite_id)
        .ok_or("Code wijst naar een verwijderde uitnodiging")?;

    let exp = invite.expires_at.to_micros_since_unix_epoch();
    if exp != 0 && exp <= ctx.timestamp.to_micros_since_unix_epoch() {
        return Err("Code is vervallen".into());
    }
    if invite.max_uses != 0 && invite.uses >= invite.max_uses {
        return Err("Code is opgebruikt".into());
    }

    // Al lid? → idempotent ok, count niet ophogen.
    let already = ctx.db.group_membership().iter()
        .any(|m| m.group_id == invite.group_id && m.user_id == user.id);
    if already { return Ok(()); }

    ctx.db.group_membership().insert(GroupMembership {
        id: 0,
        group_id: invite.group_id,
        user_id: user.id,
        joined_at: ctx.timestamp,
    });

    invite.uses = invite.uses.saturating_add(1);
    ctx.db.group_invite().id().update(invite);
    Ok(())
}

#[reducer]
pub fn revoke_group_invite(ctx: &ReducerContext, invite_id: u64) -> Result<(), String> {
    let user = require_user(ctx)?;
    let invite = ctx.db.group_invite().id().find(invite_id)
        .ok_or("Code niet gevonden")?;
    let group = ctx.db.group().id().find(invite.group_id)
        .ok_or("Onbekende crew")?;
    // Eigenaar van de crew of degene die uitnodigde mag intrekken.
    if invite.invited_by != user.id && group.owner_user_id != user.id {
        return Err("Niet jouw uitnodiging".into());
    }
    // Ruim secret (private) + reveal (publiek) mee op.
    let secret_ids: Vec<u64> = ctx.db.invite_secret().iter()
        .filter(|s| s.invite_id == invite_id).map(|s| s.id).collect();
    for sid in secret_ids { ctx.db.invite_secret().id().delete(sid); }
    ctx.db.group_invite_reveal().invite_id().delete(invite_id);
    ctx.db.group_invite().id().delete(invite_id);
    Ok(())
}

#[reducer]
pub fn leave_group(ctx: &ReducerContext, group_id: u64) -> Result<(), String> {
    let user = require_user(ctx)?;
    let group = ctx.db.group().id().find(group_id).ok_or("Onbekende crew")?;
    if group.owner_user_id == user.id {
        // Owner mag alleen vertrekken als laatste lid; daarna wordt de crew opgeruimd.
        let other_members = ctx.db.group_membership().iter()
            .filter(|m| m.group_id == group_id && m.user_id != user.id)
            .count();
        if other_members > 0 {
            return Err("Owner kan pas weg als de crew leeg is — kick eerst".into());
        }
    }
    let row = ctx.db.group_membership().iter()
        .find(|m| m.group_id == group_id && m.user_id == user.id);
    if let Some(r) = row {
        ctx.db.group_membership().id().delete(r.id);
    }
    // Als owner als laatste vertrekt → crew + invites + secrets + reveals opruimen.
    if group.owner_user_id == user.id {
        let invite_ids: Vec<u64> = ctx.db.group_invite().iter()
            .filter(|i| i.group_id == group_id).map(|i| i.id).collect();
        for id in invite_ids {
            let secret_ids: Vec<u64> = ctx.db.invite_secret().iter()
                .filter(|s| s.invite_id == id).map(|s| s.id).collect();
            for sid in secret_ids { ctx.db.invite_secret().id().delete(sid); }
            ctx.db.group_invite_reveal().invite_id().delete(id);
            ctx.db.group_invite().id().delete(id);
        }
        ctx.db.group().id().delete(group_id);
    }
    Ok(())
}

#[reducer]
pub fn kick_group_member(
    ctx: &ReducerContext,
    group_id: u64,
    target_user_id: u64,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    let group = ctx.db.group().id().find(group_id).ok_or("Onbekende crew")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de owner mag kicken".into());
    }
    if target_user_id == user.id {
        return Err("Gebruik 'leave' om zelf te vertrekken".into());
    }
    let row = ctx.db.group_membership().iter()
        .find(|m| m.group_id == group_id && m.user_id == target_user_id);
    if let Some(r) = row {
        ctx.db.group_membership().id().delete(r.id);
    }
    Ok(())
}

/// Owner pusht zijn eigen seizoens-kantines naar alle crew-leden. Non-destructief:
/// bestaande memberships blijven, ontbrekende worden toegevoegd. Handig na het
/// samenstellen van een nieuwe crew zodat iedereen meteen dezelfde kantines volgt.
#[reducer]
pub fn share_season_with_crew(
    ctx: &ReducerContext,
    group_id: u64,
) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "share_season_with_crew", 30)?;
    let group = ctx.db.group().id().find(group_id).ok_or("Onbekende crew")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de owner mag delen".into());
    }

    let my_clubs: Vec<u64> = ctx.db.club_membership().iter()
        .filter(|m| m.user_id == user.id)
        .map(|m| m.club_id)
        .collect();
    if my_clubs.is_empty() {
        return Err("Je hebt nog geen kantines in je seizoen".into());
    }
    let crew_members: Vec<u64> = ctx.db.group_membership().iter()
        .filter(|gm| gm.group_id == group_id)
        .map(|gm| gm.user_id)
        .collect();

    // Safety cap: max 2000 ensure-checks per call.
    if (my_clubs.len() * crew_members.len()) > 2000 {
        return Err("Te veel combinaties (>2000) — doe het in kleinere crews".into());
    }

    for member_id in crew_members {
        for club_id in &my_clubs {
            ensure_membership(ctx, member_id, *club_id);
        }
    }
    Ok(())
}

#[reducer]
pub fn rename_group(ctx: &ReducerContext, group_id: u64, name: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "rename_group", 10)?;
    let mut group = ctx.db.group().id().find(group_id).ok_or("Onbekende crew")?;
    if group.owner_user_id != user.id {
        return Err("Alleen de owner mag hernoemen".into());
    }
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count < 3 { return Err("Crew-naam te kort".into()); }
    if char_count > 40 { return Err("Crew-naam te lang".into()); }

    let key = normalize(trimmed);
    // Globale uniqueness: geen andere group mag dezelfde key hebben.
    if ctx.db.group().iter().any(|g| g.id != group_id && g.name_key == key) {
        return Err("Deze teamnaam bestaat al — kies een andere".into());
    }
    // Fuzzy-check tegen andere teams: als de nieuwe naam veel lijkt op een
    // bestaand team (≥0.85 similarity) en niet op de oude naam zelf, blok.
    if similarity(&group.name, trimmed) < DEDUP_THRESHOLD
        && ctx.db.group().iter().any(|g| g.id != group_id
            && similarity(&g.name, trimmed) >= DEDUP_THRESHOLD)
    {
        return Err("Te lijkend op een bestaand team".into());
    }
    group.name = trimmed.to_string();
    group.name_key = key;
    ctx.db.group().id().update(group);
    Ok(())
}
