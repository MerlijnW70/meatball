//! Meatball — SpacetimeDB module voor snack ratings bij amateurvoetbalclubs.
//!
//! Crate-structuur:
//!   tables.rs     — schema (public voor realtime subscriptions)
//!   constants.rs  — whitelists + seed-data
//!   helpers.rs    — normalisatie, auth, rate-limits, activity
//!   reducers/     — per domein gegroepeerde reducers

pub mod tables;
pub mod constants;
pub mod helpers;
pub mod seed;
pub mod seed_generated;
pub mod reducers;
