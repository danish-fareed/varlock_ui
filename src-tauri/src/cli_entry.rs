use crate::vault::keyring;
use crate::vault::vault_db::{VaultDb, VaultDbError};
use std::collections::HashMap;
use std::io::{self, Write};

fn parse_flags(args: &[String]) -> HashMap<String, String> {
    let mut flags = HashMap::new();
    let mut i = 0;
    while i < args.len() {
        let part = &args[i];
        if part.starts_with("--") {
            let key = part.trim_start_matches("--").to_string();
            if i + 1 < args.len() && !args[i + 1].starts_with("--") {
                flags.insert(key, args[i + 1].clone());
                i += 2;
                continue;
            }
            flags.insert(key, "true".to_string());
        }
        i += 1;
    }
    flags
}

fn unlock_dek(
    db: &VaultDb,
    flags: &HashMap<String, String>,
) -> Result<crate::vault::crypto::SecureKey, String> {
    if let Some(password) = flags.get("password") {
        return db.unlock(password).map_err(|e| e.to_string());
    }

    if let Ok(password) = std::env::var("DEVPAD_VAULT_PASSWORD") {
        return db.unlock(&password).map_err(|e| e.to_string());
    }

    if let Ok(Some(raw)) = keyring::retrieve_key() {
        if let Ok(password) = String::from_utf8(raw) {
            return db.unlock(&password).map_err(|e| e.to_string());
        }
    }

    Err(
        "Devpad vault is locked. Run 'devpad vault unlock' or open the Devpad app to unlock."
            .to_string(),
    )
}

fn cmd_vault_read(args: &[String]) -> i32 {
    let flags = parse_flags(args);
    let Some(project) = flags.get("project") else {
        let _ = writeln!(io::stderr(), "Missing required --project argument");
        return 2;
    };
    let Some(env_name) = flags.get("env") else {
        let _ = writeln!(io::stderr(), "Missing required --env argument");
        return 2;
    };
    let Some(key) = flags.get("key") else {
        let _ = writeln!(io::stderr(), "Missing required --key argument");
        return 2;
    };

    let db = match VaultDb::open() {
        Ok(db) => db,
        Err(e) => {
            let _ = writeln!(io::stderr(), "Failed to open vault database: {}", e);
            return 1;
        }
    };

    let dek = match unlock_dek(&db, &flags) {
        Ok(dek) => dek,
        Err(msg) => {
            let _ = writeln!(io::stderr(), "{}", msg);
            return 2;
        }
    };

    match db.get_variable(&dek, project, env_name, key) {
        Ok(v) => {
            let _ = writeln!(io::stdout(), "{}", v.value);
            0
        }
        Err(VaultDbError::NotFound(_)) => {
            let _ = writeln!(
                io::stderr(),
                "Vault secret not found for key '{}' in env '{}'.",
                key,
                env_name
            );
            3
        }
        Err(e) => {
            let _ = writeln!(io::stderr(), "Failed to read vault secret '{}': {}", key, e);
            1
        }
    }
}

fn cmd_vault_unlock(args: &[String]) -> i32 {
    let flags = parse_flags(args);
    let password = flags
        .get("password")
        .cloned()
        .or_else(|| std::env::var("DEVPAD_VAULT_PASSWORD").ok());

    let Some(password) = password else {
        let _ = writeln!(
            io::stderr(),
            "Provide --password or DEVPAD_VAULT_PASSWORD. For interactive unlock, open the Devpad app."
        );
        return 2;
    };

    let db = match VaultDb::open() {
        Ok(db) => db,
        Err(e) => {
            let _ = writeln!(io::stderr(), "Failed to open vault database: {}", e);
            return 1;
        }
    };

    match db.unlock(&password) {
        Ok(_) => {
            if flags.get("remember").map(|v| v == "true").unwrap_or(false) {
                if let Err(e) = keyring::store_key(password.as_bytes()) {
                    let _ = writeln!(
                        io::stderr(),
                        "Unlock succeeded, but failed to store keychain credential: {}",
                        e
                    );
                    return 1;
                }
            }
            let _ = writeln!(io::stdout(), "Vault unlock check succeeded.");
            0
        }
        Err(_) => {
            let _ = writeln!(io::stderr(), "Devpad vault is locked. Run 'devpad vault unlock' or open the Devpad app to unlock.");
            2
        }
    }
}

pub fn maybe_handle_cli() -> Option<i32> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() {
        return None;
    }

    if args.first().map(|s| s.as_str()) != Some("vault") {
        return None;
    }

    let sub = args.get(1).map(|s| s.as_str()).unwrap_or("");
    let tail = if args.len() > 2 { &args[2..] } else { &[] };

    let code = match sub {
        "read" => cmd_vault_read(tail),
        "unlock" => cmd_vault_unlock(tail),
        _ => {
            let _ = writeln!(
                io::stderr(),
                "Unknown vault subcommand '{}'. Supported: read, unlock",
                sub
            );
            2
        }
    };

    Some(code)
}
