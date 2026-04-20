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

pub const ALLOWED_REACTIONS: &[&str] = &["👍", "❤️", "😡", "😄", "🔥"];

pub const ALLOWED_MOODS: &[&str] = &["🔥", "🍺", "🎉", "😴", "😡", "🫠"];

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

/// Speler-posities op het veld. "wissel" niet in deze lijst — overflow per
/// linie in de UI-presentatie wordt de bank.
pub const ALLOWED_POSITIONS: &[&str] = &[
    "keeper", "verdediger", "middenvelder", "aanvaller",
];

pub const DEDUP_THRESHOLD: f32 = 0.85;
