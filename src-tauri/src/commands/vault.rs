//! Vault Tauri Commands
//!
//! Exposes vault operations to the frontend via Tauri's invoke handler.

use crate::state::vault_state::VaultState;
use crate::vault::vault_db::VaultVariable;
use crate::vault::{audit, crypto, resolver};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use zeroize::Zeroize;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub has_keychain_key: bool,
}

/// Get the current vault status.
#[tauri::command]
pub fn vault_status(vault: State<'_, VaultState>) -> Result<VaultStatus, String> {
    let initialized = vault.is_initialized()?;
    let unlocked = vault.is_unlocked();
    let has_keychain_key = crate::vault::keyring::has_stored_key();

    Ok(VaultStatus {
        initialized,
        unlocked,
        has_keychain_key,
    })
}

/// First-time vault setup with a master password.
/// Enforces minimum 12-character password policy.
#[tauri::command]
pub fn vault_setup(vault: State<'_, VaultState>, password: String) -> Result<(), String> {
    // Fix #12: Enforce password strength on the backend
    crypto::validate_password(&password).map_err(|e| e.to_string())?;

    let dek = vault.db.setup(&password).map_err(|e| e.to_string())?;

    // Fix #1: Zeroize password immediately after key derivation
    // (password is moved into this function, we shadow with a mutable copy to zeroize)
    let mut pwd_bytes = password.into_bytes();
    pwd_bytes.zeroize();

    vault.store_dek(dek);
    audit::log_unlock(&vault.db);
    Ok(())
}

/// Unlock the vault with a master password.
#[tauri::command]
pub fn vault_unlock(
    vault: State<'_, VaultState>,
    password: String,
    remember: bool,
) -> Result<(), String> {
    let dek = vault.db.unlock(&password).map_err(|e| e.to_string())?;

    if remember {
        // Fix #13: Store the actual password in the keychain, not the raw DEK.
        // On auto-unlock, we re-derive KEK→DEK from the stored password,
        // preserving the Argon2id cost bump even if the keychain is compromised.
        crate::vault::keyring::store_key(password.as_bytes())?;
    }

    // Fix #1: Zeroize password immediately after use
    let mut pwd_bytes = password.into_bytes();
    pwd_bytes.zeroize();

    vault.store_dek(dek);
    audit::log_unlock(&vault.db);
    Ok(())
}

/// Try to auto-unlock from the OS keychain.
/// Fix #13: Retrieves the stored password and re-derives KEK→DEK.
/// Fix #8: Verifies the DEK before accepting it.
#[tauri::command]
pub fn vault_auto_unlock(vault: State<'_, VaultState>) -> Result<bool, String> {
    match crate::vault::keyring::retrieve_key()? {
        Some(mut stored_bytes) => {
            // The keyring now stores the password, not the DEK
            let password = String::from_utf8(stored_bytes.clone())
                .map_err(|_| "Invalid UTF-8 in stored credential".to_string())?;

            // Re-run the full derivation path — same as vault_unlock
            // This preserves the Argon2id cost on every auto-unlock
            match vault.db.unlock(&password) {
                Ok(dek) => {
                    // Fix #8: Verify the DEK works before trusting it
                    vault.db.verify_dek(&dek).map_err(|e| e.to_string())?;
                    vault.store_dek(dek);
                    audit::log_unlock(&vault.db);

                    // Zeroize password material
                    stored_bytes.zeroize();
                    // password is dropped here
                    let mut pwd_bytes = password.into_bytes();
                    pwd_bytes.zeroize();

                    Ok(true)
                }
                Err(_) => {
                    // Stored credential is invalid (password changed?) — clear it
                    stored_bytes.zeroize();
                    let _ = crate::vault::keyring::delete_key();
                    Ok(false)
                }
            }
        }
        None => Ok(false),
    }
}

/// Lock the vault (zeroize key from memory).
#[tauri::command]
pub fn vault_lock(vault: State<'_, VaultState>) -> Result<(), String> {
    audit::log_lock(&vault.db);
    vault.lock();
    Ok(())
}

/// Check if vault is unlocked.
#[tauri::command]
pub fn vault_is_unlocked(vault: State<'_, VaultState>) -> bool {
    vault.is_unlocked()
}

/// Import a `.env` file into the vault.
/// Rewrites the file with `varlock://vault/KEY` references for sensitive values.
#[tauri::command]
pub fn vault_import_env(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
    env_content: String,
    sensitive_keys: Vec<String>,
) -> Result<String, String> {
    let dek = vault.require_dek()?;
    let count = vault
        .db
        .import_env(&dek, &project_id, &env_name, &env_content, &sensitive_keys)
        .map_err(|e| e.to_string())?;

    audit::log_import(&vault.db, &project_id, &env_name, count);

    // Generate the reference .env content
    let ref_env = vault
        .db
        .generate_ref_env(&dek, &project_id, &env_name)
        .map_err(|e| e.to_string())?;

    Ok(ref_env)
}

/// Get all decrypted variables for a project+env.
#[tauri::command]
pub fn vault_get_variables(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
) -> Result<Vec<VaultVariable>, String> {
    let dek = vault.require_dek()?;
    vault
        .db
        .get_variables(&dek, &project_id, &env_name)
        .map_err(|e| e.to_string())
}

/// A vault variable with its source project ID (for the global vault list).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultVariableWithProject {
    pub project_id: String,
    #[serde(flatten)]
    pub variable: VaultVariable,
}

/// Get ALL decrypted variables across all projects and environments.
#[tauri::command]
pub fn vault_get_all_variables(
    vault: State<'_, VaultState>,
) -> Result<Vec<VaultVariableWithProject>, String> {
    let dek = vault.require_dek()?;
    let all = vault
        .db
        .get_all_variables(&dek)
        .map_err(|e| e.to_string())?;
    Ok(all
        .into_iter()
        .map(|(project_id, variable)| VaultVariableWithProject {
            project_id,
            variable,
        })
        .collect())
}

/// Set a single variable in the vault.
#[tauri::command]
pub fn vault_set_variable(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
    key: String,
    value: String,
    var_type: String,
    sensitive: bool,
    required: bool,
    description: String,
) -> Result<(), String> {
    let dek = vault.require_dek()?;
    vault
        .db
        .set_variable(
            &dek,
            &project_id,
            &env_name,
            &key,
            &value,
            &var_type,
            sensitive,
            required,
            &description,
        )
        .map_err(|e| e.to_string())?;

    audit::log_write(&vault.db, &project_id, &env_name, &key);
    Ok(())
}

/// Delete a variable from the vault.
#[tauri::command]
pub fn vault_delete_variable(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
    key: String,
) -> Result<bool, String> {
    vault
        .db
        .delete_variable(&project_id, &env_name, &key)
        .map_err(|e| e.to_string())
        .map(|deleted| {
            if deleted {
                audit::log_delete(&vault.db, &project_id, &env_name, &key);
            }
            deleted
        })
}

// ── Sharing ──

#[tauri::command]
pub fn vault_share_variable(
    vault: State<'_, VaultState>,
    source_project_id: String,
    env_name: String,
    key: String,
    target_project_ids: Vec<String>,
) -> Result<(), String> {
    let _dek = vault.require_dek()?;
    vault
        .db
        .share_variable(&source_project_id, &env_name, &key, &target_project_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_unshare_variable(
    vault: State<'_, VaultState>,
    source_project_id: String,
    env_name: String,
    key: String,
    target_project_id: String,
) -> Result<bool, String> {
    let _dek = vault.require_dek()?;
    vault
        .db
        .unshare_variable(&source_project_id, &env_name, &key, &target_project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_shared_targets(
    vault: State<'_, VaultState>,
    source_project_id: String,
    env_name: String,
    key: String,
) -> Result<Vec<String>, String> {
    let _dek = vault.require_dek()?;
    vault
        .db
        .get_shared_targets(&source_project_id, &env_name, &key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_variables_shared_with(
    vault: State<'_, VaultState>,
    target_project_id: String,
) -> Result<Vec<VaultVariableWithProject>, String> {
    let dek = vault.require_dek()?;
    let shared = vault
        .db
        .get_variables_shared_with(&target_project_id, &dek)
        .map_err(|e| e.to_string())?;

    Ok(shared
        .into_iter()
        .map(|(project_id, variable)| VaultVariableWithProject {
            project_id,
            variable,
        })
        .collect())
}

/// Generate a cryptographic secret.
#[tauri::command]
pub fn vault_generate_secret(secret_type: String, length: Option<usize>) -> String {
    crypto::generate_secret(&secret_type, length)
}

/// Resolve all `varlock://` references in an env file content.
/// Returns a fully-resolved environment map.
#[tauri::command]
pub fn vault_resolve_env(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
    env_content: String,
) -> Result<HashMap<String, String>, String> {
    let dek = vault.require_dek()?;

    audit::log_export(&vault.db, &project_id, &env_name);

    resolver::resolve_env(&env_content, &dek, &vault.db, &project_id, &env_name)
        .map_err(|e| e.to_string())
}

/// Generate a `.env` file with vault references for sensitive values.
#[tauri::command]
pub fn vault_write_ref_env(
    vault: State<'_, VaultState>,
    project_id: String,
    env_name: String,
) -> Result<String, String> {
    let dek = vault.require_dek()?;
    vault
        .db
        .generate_ref_env(&dek, &project_id, &env_name)
        .map_err(|e| e.to_string())
}

/// Remove the keychain entry (for "forget this device").
#[tauri::command]
pub fn vault_forget_device() -> Result<(), String> {
    crate::vault::keyring::delete_key()
}
