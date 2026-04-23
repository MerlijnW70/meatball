//! Backup-code flow voor onze auth-loze architectuur.
//!
//! Probleem: identity = localStorage-token. iOS Safari ITP kan die na
//! 7 dagen wissen, incognito-tabs hebben 'm niet, nieuw device = nieuwe
//! identity. Zonder mitigatie raken users hun account kwijt.
//!
//! Oplossing: user genereert een backup-code die hij bewaart. Op een
//! nieuw device redeemen → identity wordt van dit device aan de oude
//! account gekoppeld (identity-swap tussen beide user-rijen, geen
//! deletes dus geen verlies van memberships/ratings).

use sha2::{Digest, Sha256};
use spacetimedb::{reducer, ReducerContext, Table};

use crate::helpers::{enforce_rate_limit, require_user, INVITE_ALPHA};
use crate::tables::{
    backup_secret, session, user, BackupSecret,
};

const BACKUP_CODE_LEN: usize = 8;
// Domain-separator voor de hash — zodat backup-codes niet matchen met
// toekomstig andere hash-based codes in andere contexten.
const BACKUP_PEPPER: &[u8] = b"meatball-backup-v1";

fn hash_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(BACKUP_PEPPER);
    hasher.update(code.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_code_format(code: &str) -> Result<String, String> {
    let upper = code.trim().to_ascii_uppercase();
    if upper.chars().count() != BACKUP_CODE_LEN {
        return Err(format!("Code moet {} tekens zijn", BACKUP_CODE_LEN));
    }
    if !upper.chars().all(|c| INVITE_ALPHA.contains(c)) {
        return Err("Code bevat ongeldige tekens".into());
    }
    Ok(upper)
}

/// User genereert een backup-code client-side en stuurt 'm hier op. Server
/// slaat alleen de hash op. Bestaande backup van deze user wordt vervangen.
#[reducer]
pub fn create_backup_code(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let user = require_user(ctx)?;
    enforce_rate_limit(ctx, "create_backup_code", 30)?;

    let code_upper = validate_code_format(&code)?;
    let hash = hash_code(&code_upper);

    // Ruim bestaande backup op — één actieve code per user.
    let existing: Vec<u64> = ctx.db.backup_secret().iter()
        .filter(|b| b.user_id == user.id)
        .map(|b| b.id)
        .collect();
    for id in existing {
        ctx.db.backup_secret().id().delete(id);
    }

    // Collision check op hash (zeldzaam — 30^8 ≈ 6.5 biljoen mogelijkheden).
    if ctx.db.backup_secret().code_hash().find(hash.clone()).is_some() {
        return Err("Code bestaat al — probeer opnieuw".into());
    }

    ctx.db.backup_secret().insert(BackupSecret {
        id: 0,
        code_hash: hash,
        user_id: user.id,
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Nieuwe device redeemt de backup — huidige auto-user's identity wordt
/// gewisseld met de target user's identity. Geen deletes: beide user-
/// rows blijven bestaan, alleen de identity-kolom wisselt. Code wordt
/// consumed (éénmalig bruikbaar).
#[reducer]
pub fn redeem_backup_code(ctx: &ReducerContext, code: String) -> Result<(), String> {
    enforce_rate_limit(ctx, "redeem_backup_code", 10)?;

    let code_upper = validate_code_format(&code)?;
    let hash = hash_code(&code_upper);

    let backup = ctx.db.backup_secret().code_hash().find(hash)
        .ok_or("Code niet gevonden — check de letters nog eens")?;

    let target = ctx.db.user().id().find(backup.user_id)
        .ok_or("Account bestaat niet meer")?;

    let sender_id = ctx.sender();

    // Al op de juiste identity? Consume + done.
    if target.identity == sender_id {
        ctx.db.backup_secret().id().delete(backup.id);
        return Ok(());
    }

    // Huidige auto-user voor dit device opzoeken (bestaat bijna altijd
    // dankzij on_client_connected).
    let current_opt = ctx.db.user().identity().find(sender_id);

    match current_opt {
        Some(current) => {
            // Zelfde user al? No-op — code is overbodig.
            if current.id == target.id {
                ctx.db.backup_secret().id().delete(backup.id);
                return Ok(());
            }

            // Identity-swap: target krijgt sender-identity,
            // current-auto-user krijgt target's oude identity.
            //
            // Daarmee blijven beide user-rows met hun data (memberships,
            // ratings, etc) bestaan. De auto-user die we vervangen is nu
            // "orphan" — alleen iemand met de oude identity-token zou er
            // nog bij kunnen.
            //
            // Belangrijk: eerst current wegschuiven, dán target updaten,
            // anders botst de unique-index op identity. SpacetimeDB
            // garandeert transactionele updates binnen één reducer dus
            // dit is atomisch; de volgorde matters voor tussenliggende
            // constraint-checks.
            let old_target_identity = target.identity;
            let mut current_mut = current;
            current_mut.identity = old_target_identity;
            ctx.db.user().id().update(current_mut);

            let mut target_mut = target;
            target_mut.identity = sender_id;
            ctx.db.user().id().update(target_mut);
        }
        None => {
            // Edge case: geen auto-user voor deze sender (on_client_connected
            // heeft nog niet gedraaid of is misgegaan). Direct target
            // aan de sender-identity koppelen.
            let mut target_mut = target;
            target_mut.identity = sender_id;
            ctx.db.user().id().update(target_mut);
        }
    }

    // Session-row bijwerken zodat presence meteen de juiste user_id wijst.
    if let Some(mut s) = ctx.db.session().identity().find(sender_id) {
        s.user_id = backup.user_id;
        ctx.db.session().identity().update(s);
    }

    // Code is consumed — kan niet nogmaals gebruikt worden.
    ctx.db.backup_secret().id().delete(backup.id);
    Ok(())
}
