//! Audit logger — write-only access log for Phase 1.
//!
//! Wraps `VaultDb::log_access()` with convenience methods.
//! Key names are hashed before storage to prevent metadata leakage.
//! UI for viewing logs comes in Phase 4.

use crate::vault::vault_db::VaultDb;

/// Log a variable read event.
pub fn log_read(db: &VaultDb, project_id: &str, env: &str, key: &str) {
    let hashed = VaultDb::key_hash(key);
    let _ = db.log_access("read", project_id, Some(env), Some(&hashed), "local", None);
}

/// Log a variable write event.
pub fn log_write(db: &VaultDb, project_id: &str, env: &str, key: &str) {
    let hashed = VaultDb::key_hash(key);
    let _ = db.log_access("write", project_id, Some(env), Some(&hashed), "local", None);
}

/// Log a variable delete event.
pub fn log_delete(db: &VaultDb, project_id: &str, env: &str, key: &str) {
    let hashed = VaultDb::key_hash(key);
    let _ = db.log_access(
        "delete",
        project_id,
        Some(env),
        Some(&hashed),
        "local",
        None,
    );
}

/// Log an environment import event.
pub fn log_import(db: &VaultDb, project_id: &str, env: &str, count: usize) {
    let metadata = format!("{{\"count\":{}}}", count);
    let _ = db.log_access(
        "import",
        project_id,
        Some(env),
        None,
        "local",
        Some(&metadata),
    );
}

/// Log an environment export/resolve event.
pub fn log_export(db: &VaultDb, project_id: &str, env: &str) {
    let _ = db.log_access("export", project_id, Some(env), None, "local", None);
}

/// Log a secret generation event.
pub fn log_generate(db: &VaultDb, project_id: &str, env: &str, key: &str) {
    let hashed = VaultDb::key_hash(key);
    let _ = db.log_access(
        "generate",
        project_id,
        Some(env),
        Some(&hashed),
        "local",
        None,
    );
}

/// Log a vault unlock event.
pub fn log_unlock(db: &VaultDb) {
    let _ = db.log_access("unlock", "system", None, None, "local", None);
}

/// Log a vault lock event.
pub fn log_lock(db: &VaultDb) {
    let _ = db.log_access("lock", "system", None, None, "local", None);
}
