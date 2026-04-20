//! Reducer modules. Rust's #[reducer] macro registreert functies op crate-niveau,
//! dus zolang ze `pub` zijn en de module onder de crate hangt, vindt SpacetimeDB ze.

pub mod lifecycle;
pub mod user;
pub mod world;
pub mod rating;
pub mod social;
pub mod membership;
pub mod groups;
