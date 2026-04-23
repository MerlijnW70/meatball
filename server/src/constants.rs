//! Whitelists + seed-data constants.

pub const NL_PROVINCES: &[&str] = &[
    "Groningen", "Friesland", "Drenthe", "Overijssel", "Flevoland",
    "Gelderland", "Utrecht", "Noord-Holland", "Zuid-Holland", "Zeeland",
    "Noord-Brabant", "Limburg",
];

pub const RESERVED_NAMES: &[&str] = &[
    "admin", "administrator", "root", "sysadmin", "system", "owner",
    "moderator", "mod", "support", "help", "staff",
    "bot", "robot", "api", "null", "undefined", "void", "nil", "none",
    "meatball", "meatballs", "kantine", "official", "officieel",
    "test", "testuser", "anoniem", "anonymous", "gast", "guest", "user",
    "me", "jij", "jezelf",
];

pub const BLOCKED_SUBSTRINGS: &[&str] = &["administrator", "meatball", "kantine"];

pub const ALLOWED_TAGS: &[&str] = &[
    "warm", "slap", "krokant", "overpriced", "top snack",
    "droog", "verrassend goed", "zout", "vettig", "lauw",
];

// Voetbal-thema "kaarten" die spelers naar elkaar sturen.
pub const ALLOWED_REACTIONS: &[&str] = &["⚽", "🏆", "🔥", "🟨", "🟥"];

pub const ALLOWED_MOODS: &[&str] = &["🔥", "🍺", "🎉", "😴", "😡", "🫠"];

// Emoji-reacties die users kunnen plakken onder een rating. Andere set
// dan ALLOWED_REACTIONS (die is voor user→user DMs): dit is puur
// review-feedback. Toggle-achtig: tap plakt, nogmaals tap verwijdert.
pub const ALLOWED_RATING_REACTIONS: &[&str] = &["🔥", "👑", "🤌", "😂", "💀", "🤢"];

pub const ALLOWED_AVATAR_COLORS: &[&str] = &[
    "pop", "hot", "mint", "sky", "bruise", "ink", "paper", "lime",
];

pub const ALLOWED_AVATAR_ICONS: &[&str] = &[
    // eten
    "🥩","🍔","🌭","🍟","🥖","🧀","🍕","🌮","🍩","🥨",
    "🍿","🍦","🍫","🥓","🍗","🥚","🥗","🍣","🌯","🍤",
    // sport / club
    "⚽","🏟","🥇","🏆","👕","🧤","🎯","🪃",
    // attitude / fun
    "🔥","⚡","💀","🤘","🎸","👑","💣","🦴","👁","🛞",
    "🎮","🪖",
];

pub const ALLOWED_PATTERNS: &[&str] = &[
    "none", "stripes-h", "stripes-v", "dots", "grid", "checker",
];

pub const ALLOWED_ACCENT_COLORS: &[&str] = &["pop","hot","mint","sky","bruise","ink"];
pub const ALLOWED_ACCENT_POSITIONS: &[&str] = &["tl","tr","bl","br"];
pub const ALLOWED_ROTATIONS: &[&str] = &["0","90","180","270"];

/// 4-3-3 slot-codes + `wissel` (bank). Veldslots zijn uniek per team;
/// `wissel` mogen er meerdere zijn (overflow gaat altijd naar bank).
pub const ALLOWED_POSITIONS: &[&str] = &[
    "keeper",
    "lb", "lcb", "rcb", "rb",
    "lm", "cm", "rm",
    "lw", "st", "rw",
    "wissel",
];

pub const DEDUP_THRESHOLD: f32 = 0.85;

/// Pool van leuke default-namen voor auto-aangemaakte users. Client hoeft
/// geen registratie meer te doen — op `client_connected` krijgt een
/// nieuwe identity automatisch een naam in de vorm `Base-NNNN`. User kan
/// later via `register_user` een echte naam kiezen.
///
/// Alle entries: ASCII-only (a-z, 0-9, dash), ≤17 chars zodat met
/// 4-cijferige suffix het totaal onder de 24-chars screen_name-cap blijft,
/// en geen collision met RESERVED_NAMES of BLOCKED_SUBSTRINGS.
pub const DEFAULT_SCREEN_NAMES: &[&str] = &[
    "Gehaktbal-Genieter",
    "Frikandel-Fan",
    "Saus-Specialist",
    "Kroket-Kenner",
    "Tafel-8",
    "Scheids-Hater",
    "Reservespeler",
    "Patat-Met-Graag",
    "Kroket-Koning",
    "Keeper-in-Rust",
    "Dugout-Douwer",
    "Tribune-Tiger",
    "Veld-3",
    "Bankzitter",
    "Koffie-Kenner",
    "Chocomel-Kenner",
    "Bitterbal-Baas",
    "Hogehoofd",
    "Derde-Helft",
    "Rust-Stander",
    "Uitwedstrijd-Uil",
    "Thuisfan",
    "Corner-Man",
    "Vlaggist",
    "Ref-Hater",
    "Grasmaaier",
    "Mosterd-Maniac",
    "Satesaus-Fan",
    "Vette-Hap",
    "Topscoorder",
];
