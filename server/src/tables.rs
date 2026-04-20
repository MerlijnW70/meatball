//! Table definities + shared enums. Alles is `public` zodat de client
//! alle tables direct kan subscriben voor realtime updates.

use spacetimedb::{table, Identity, SpacetimeType, Timestamp};

#[table(accessor =user, public)]
pub struct User {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[unique]
    pub identity: Identity,
    #[unique]
    pub screen_name: String,
    pub screen_name_key: String, // lowercase voor uniqueness check
    pub created_at: Timestamp,
    pub avatar_color: String,    // palette key (zie ALLOWED_AVATAR_COLORS)
    pub avatar_icon: String,     // emoji uit ALLOWED_AVATAR_ICONS
    pub avatar_decor: String,    // "{pattern}|{accent}|{rotation}"
}

#[table(accessor =province, public)]
pub struct Province {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[unique]
    pub name: String,
}

#[table(accessor =city, public)]
pub struct City {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub province_id: u64,
    pub name: String,
    pub name_key: String, // lowercase, trimmed — dedup per province
}

#[table(accessor =club, public)]
pub struct Club {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub name: String,
    pub name_key: String, // normalized voor dedup per city
    pub province_id: u64,
    pub city_id: u64,
    pub created_by: u64,
    pub created_at: Timestamp,
}

#[table(accessor =snack, public)]
pub struct Snack {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub club_id: u64,
    pub name: String,
    pub name_key: String, // normalized voor dedup per club
    pub created_by: u64,
    pub created_at: Timestamp,
}

#[table(accessor =rating, public)]
pub struct Rating {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub user_id: u64,
    pub club_id: u64,
    pub snack_id: u64,
    pub score: u8, // 1..=10
    pub review_text: String,
    pub created_at: Timestamp,
}

/// Follow-relatie (light social graph). Eén rij per (follower, followee).
#[table(accessor = follow, public)]
pub struct Follow {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub follower_id: u64,
    pub followee_id: u64,
    pub created_at: Timestamp,
}

/// Club-mood stem. Eén user kan één mood-emoji stemmen per club,
/// maar mag 'm altijd veranderen → upsert in de reducer.
#[table(accessor = club_mood, public)]
pub struct ClubMood {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub club_id: u64,
    pub user_id: u64,
    pub emoji: String,
    pub created_at: Timestamp,
}

/// Historische @mention-pings. Niet meer actief gevuld — tabel blijft bestaan
/// voor historische data die eerder door submit_rating geschreven werd.
#[table(accessor = rating_ping, public)]
pub struct RatingPing {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub rating_id: u64,
    pub from_user_id: u64,
    pub to_user_id: u64,
    pub snack_id: u64,
    pub created_at: Timestamp,
}

/// User-membership in een club: jouw "shortcuts" voor de feed.
/// Eén rij per (user, club). Wordt automatisch ingevuld zodra je een
/// club kiest, toevoegt of er een rating plaatst.
#[table(accessor = club_membership, public)]
pub struct ClubMembership {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub user_id: u64,
    pub club_id: u64,
    pub joined_at: Timestamp,
}

/// Up- of downvote op iemand anders zijn rating — community-consensus
/// tegen trolls. Eén stem per (rating, voter); waarde is +1 of -1.
#[table(accessor = rating_vote, public)]
pub struct RatingVote {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub rating_id: u64,
    pub voter_user_id: u64,
    pub value: i8,
    pub created_at: Timestamp,
}

/// Peer-to-peer emoji-reactie van één user aan een andere.
#[table(accessor = user_reaction, public)]
pub struct UserReaction {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub from_user_id: u64,
    pub to_user_id: u64,
    pub emoji: String,
    pub created_at: Timestamp,
}

/// Eén like per (user, snack). Toggle via `toggle_like`.
#[table(accessor = snack_like, public)]
pub struct SnackLike {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub user_id: u64,
    pub snack_id: u64,
    pub club_id: u64,
    pub created_at: Timestamp,
}

#[table(accessor =rating_tag, public)]
pub struct RatingTag {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub rating_id: u64,
    pub snack_id: u64, // gedenormaliseerd voor makkelijk filteren
    pub club_id: u64,
    pub tag: String,
}

/// Gecachede statistieken per snack — makkelijk leaderboard.
#[table(accessor =snack_stats, public)]
pub struct SnackStats {
    #[primary_key]
    pub snack_id: u64,
    pub club_id: u64,
    pub sum_score: u64,
    pub rating_count: u64,
    /// avg_score * 100 (int-precisie, 872 = 8.72)
    pub avg_score_x100: u32,
    pub last_rated_at: Timestamp,
}

/// Één rij per live-verbinding. Bijgewerkt via `client_connected`
/// en verwijderd via `client_disconnected`.
#[table(accessor = session, public)]
pub struct Session {
    #[primary_key]
    pub identity: Identity,
    pub user_id: u64,              // 0 als de identity nog geen screen-name heeft
    pub connected_at: Timestamp,
}

/// Aangeeft dat iemand rechts nú de rating-modal open heeft voor deze snack.
/// Eén intent per identity tegelijk; server ruimt op bij disconnect.
#[table(accessor = rating_intent, public)]
pub struct RatingIntent {
    #[primary_key]
    pub identity: Identity,
    pub user_id: u64,
    pub snack_id: u64,
    pub started_at: Timestamp,
}

/// Crew-groep: invite-only verzameling van gehaktbal-liefhebbers.
/// Lid worden gaat via een GroupInvite-code.
#[table(accessor = group, public)]
pub struct Group {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub name: String,
    pub name_key: String,         // normalized voor dedup
    pub owner_user_id: u64,       // wie kan kicken / wie is final authority
    pub created_at: Timestamp,
}

/// Lidmaatschap van een crew. Eén rij per (group, user).
#[table(accessor = group_membership, public)]
pub struct GroupMembership {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub group_id: u64,
    pub user_id: u64,
    pub joined_at: Timestamp,
}

/// Publieke metadata van een uitnodiging — géén plaintext-code.
/// `expires_at = 0` → nooit, `max_uses = 0` → onbeperkt.
#[table(accessor = group_invite, public)]
pub struct GroupInvite {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub group_id: u64,
    pub invited_by: u64,
    pub expires_at: Timestamp,
    pub max_uses: u32,
    pub uses: u32,
    pub created_at: Timestamp,
}

/// Private tabel — server-only. Houdt de plaintext-code van elke invite.
/// Niet `public` dus clients kunnen hier NOOIT op subscriben.
/// Reducers gebruiken hem om `accept_group_invite` lookup te doen.
#[table(accessor = invite_secret)]
pub struct InviteSecret {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[unique]
    pub code: String,
    pub invite_id: u64,
}

/// Korte-levensduur "reveal" — plaintext code die alleen de creator
/// mag zien, tot `expires_at` (standaard 5 minuten).
/// Na TTL wordt de rij opgeruimd bij de volgende reducer-call.
#[table(accessor = group_invite_reveal, public)]
pub struct GroupInviteReveal {
    #[primary_key]
    pub invite_id: u64,
    pub code: String,
    pub invited_by: u64,
    pub expires_at: Timestamp,
}

/// Per-identity per-action rate limit tracking. Eén rij per (identity, action),
/// upsert bij elke gerate-limite call.
#[table(accessor = rate_limit, public)]
pub struct RateLimit {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub identity: Identity,
    pub action: String,
    pub last_at: Timestamp,
}

#[derive(SpacetimeType, Clone)]
pub enum ActivityKind {
    UserRegistered,
    ClubAdded,
    SnackAdded,
    RatingSubmitted,
    SnackClimbed, // snack stijgt naar #1 etc.
}

#[table(accessor =activity_event, public)]
pub struct ActivityEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub kind: ActivityKind,
    pub club_id: u64,   // 0 indien niet club-specifiek
    pub user_id: u64,   // 0 indien system
    pub snack_id: u64,  // 0 indien n/a
    pub text: String,   // menselijk leesbare regel voor feed
    pub created_at: Timestamp,
}
