use crate::varlock::cli;
use crate::varlock::types::{VarlockLoadResult, VarlockScanResult, VarlockStatus};

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

/// Run `varlock load --format=json` and return parsed result.
/// This is the primary data source for the UI dashboard.
#[tauri::command]
pub async fn varlock_load(
    cwd: String,
    env: Option<String>,
) -> Result<VarlockLoadResult, String> {
    cli::load(&cwd, env.as_deref()).await
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
