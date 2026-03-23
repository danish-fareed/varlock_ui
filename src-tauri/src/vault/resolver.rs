//! Varlock Reference Resolver
//!
//! TOCTOU-safe: `.env` file is treated as a manifest only (what variables exist).
//! All `varlock://vault/KEY` references are resolved directly from the vault DB
//! using `(project_id, env, key)` as the lookup.

use crate::vault::crypto::SecureKey;
use crate::vault::vault_db::{VaultDb, VaultDbError};
use std::collections::HashMap;

/// The varlock:// URI scheme prefix.
const VARLOCK_URI_PREFIX: &str = "varlock://vault/";

/// Resolve all variables from an `.env` file content.
/// - Plain values pass through unchanged
/// - `varlock://vault/KEY` references are resolved from the vault
///
/// Returns a fully-resolved environment map.
pub fn resolve_env(
    env_content: &str,
    dek: &SecureKey,
    vault_db: &VaultDb,
    project_id: &str,
    env: &str,
) -> Result<HashMap<String, String>, VaultDbError> {
    let mut resolved = HashMap::new();
    let mut errors = Vec::new();

    for line in env_content.lines() {
        let trimmed = line.trim();

        // Skip blanks and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Strip optional `export ` prefix
        let rest = trimmed.strip_prefix("export ").unwrap_or(trimmed);

        if let Some(eq_pos) = rest.find('=') {
            let key = rest[..eq_pos].trim();
            let value = rest[eq_pos + 1..]
                .trim()
                .trim_matches('"')
                .trim_matches('\'');

            if let Some(ref_key) = value.strip_prefix(VARLOCK_URI_PREFIX) {
                // This is a vault reference — resolve from DB
                match vault_db.get_variable(dek, project_id, env, ref_key) {
                    Ok(var) => {
                        resolved.insert(key.to_string(), var.value);
                    }
                    Err(e) => {
                        errors.push(format!("Failed to resolve {}: {}", key, e));
                    }
                }
            } else {
                // Plain value — pass through
                resolved.insert(key.to_string(), value.to_string());
            }
        }
    }

    if !errors.is_empty() {
        return Err(VaultDbError::Crypto(
            crate::vault::crypto::CryptoError::InvalidData(format!(
                "Unresolvable references:\n{}",
                errors.join("\n")
            )),
        ));
    }

    Ok(resolved)
}

/// Check if a value is a varlock reference.
pub fn is_varlock_ref(value: &str) -> bool {
    value.starts_with(VARLOCK_URI_PREFIX)
}

/// Extract the key name from a varlock reference URI.
pub fn extract_ref_key(value: &str) -> Option<&str> {
    value.strip_prefix(VARLOCK_URI_PREFIX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::vault_db::VaultDb;

    #[test]
    fn test_resolve_mixed_env() {
        let db = VaultDb::open_in_memory().unwrap();
        let dek = db.setup("test").unwrap();

        db.set_variable(
            &dek,
            "p1",
            "dev",
            "API_KEY",
            "sk_live_abc",
            "string",
            true,
            true,
            "",
        )
        .unwrap();

        let env_content = "PORT=3000\nAPI_KEY=varlock://vault/API_KEY\nDEBUG=true";
        let resolved = resolve_env(env_content, &dek, &db, "p1", "dev").unwrap();

        assert_eq!(resolved.get("PORT").unwrap(), "3000");
        assert_eq!(resolved.get("API_KEY").unwrap(), "sk_live_abc");
        assert_eq!(resolved.get("DEBUG").unwrap(), "true");
    }

    #[test]
    fn test_resolve_unresolvable_ref() {
        let db = VaultDb::open_in_memory().unwrap();
        let dek = db.setup("test").unwrap();

        let env_content = "MISSING=varlock://vault/NONEXISTENT";
        let result = resolve_env(env_content, &dek, &db, "p1", "dev");
        assert!(result.is_err());
    }

    #[test]
    fn test_is_varlock_ref() {
        assert!(is_varlock_ref("varlock://vault/API_KEY"));
        assert!(!is_varlock_ref("sk_live_abc123"));
        assert!(!is_varlock_ref(""));
    }

    #[test]
    fn test_extract_ref_key() {
        assert_eq!(extract_ref_key("varlock://vault/API_KEY"), Some("API_KEY"));
        assert_eq!(extract_ref_key("plain_value"), None);
    }
}
