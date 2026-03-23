use std::path::Path;

use crate::state::vault_state::VaultState;
use crate::varlock::cli;
use crate::varlock::merge::merge_load_with_schema;
use crate::varlock::migration;
use crate::varlock::schema_types::MergedLoadResult;
use crate::varlock::types::{VarlockLoadResult, VarlockScanResult, VarlockStatus};
use tauri::State;

/// Check if varlock CLI is installed and return its version.
#[tauri::command]
pub async fn check_varlock() -> Result<VarlockStatus, String> {
    Ok(cli::check_installed().await)
}

/// Install varlock globally via npm.
#[tauri::command]
pub async fn install_varlock() -> Result<String, String> {
    cli::install().await
}

/// Run `varlock load --format=json-full` and return the raw normalized result.
/// Kept for backward compatibility; prefer `varlock_load_merged` for richer data.
#[tauri::command]
pub async fn varlock_load(cwd: String, env: Option<String>) -> Result<VarlockLoadResult, String> {
    cli::load(&cwd, env.as_deref()).await
}

/// Run `varlock load --format=json-full`, read `.env.schema` if present,
/// parse and merge schema metadata with CLI output.
/// Returns a `MergedLoadResult` with accurate types, required/sensitive flags,
/// descriptions, and metadata source tracking.
#[tauri::command]
pub async fn varlock_load_merged(
    cwd: String,
    env: Option<String>,
) -> Result<MergedLoadResult, String> {
    // Step 1: Run varlock load
    let load_result = cli::load(&cwd, env.as_deref()).await?;

    // Step 2: Try to read .env.schema
    let schema_path = Path::new(&cwd).join(".env.schema");
    let schema_content = if schema_path.exists() && schema_path.is_file() {
        match std::fs::read_to_string(&schema_path) {
            Ok(content) => Some(content),
            Err(e) => {
                // Non-fatal: return load result with a warning
                log::warn!("Failed to read .env.schema: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Step 3: Merge
    Ok(merge_load_with_schema(
        load_result,
        schema_content.as_deref(),
    ))
}

/// Run `varlock init --yes` to migrate .env.example -> .env.schema.
#[tauri::command]
pub async fn varlock_init(cwd: String) -> Result<(), String> {
    cli::init(&cwd).await
}

/// Run `varlock scan` and return structured results.
#[tauri::command]
pub async fn varlock_scan(cwd: String) -> Result<VarlockScanResult, String> {
    cli::scan(&cwd).await
}

/// Generate a migration plan for a project without writing any files.
/// Detects env files, classifies them, infers types and sensitivity,
/// and returns a preview including the generated .env.schema content.
#[deprecated(note = "Use get_migration_preview")]
#[tauri::command]
pub async fn migration_plan(cwd: String) -> Result<migration::MigrationPreview, String> {
    migration::get_migration_preview(&cwd).map_err(|e| e.to_string())
}

/// Apply a migration: write the .env.schema file with optional backup,
/// then run `varlock init` to finalize.
#[deprecated(note = "Use migrate_project_to_varlock")]
#[tauri::command]
pub async fn migration_apply(
    cwd: String,
    _schema_content: String,
    _create_backups: bool,
    vault: State<'_, VaultState>,
) -> Result<migration::MigrationResult, String> {
    migrate_project_to_varlock(cwd, vault).await
}

#[tauri::command]
pub async fn get_migration_preview(cwd: String) -> Result<migration::MigrationPreview, String> {
    migration::get_migration_preview(&cwd).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn migrate_project_to_varlock(
    cwd: String,
    vault: State<'_, VaultState>,
) -> Result<migration::MigrationResult, String> {
    let result = migration::migrate_project_to_varlock(&cwd, &vault).map_err(|e| e.to_string())?;

    // Best-effort post-migration varlock init. Migration already wrote artifacts.
    if let Err(e) = cli::init(&cwd).await {
        log::warn!("varlock init after migration failed (non-fatal): {}", e);
    }

    Ok(result)
}
