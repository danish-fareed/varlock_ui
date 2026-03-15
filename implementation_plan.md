# Implementation Plan — Fix All 9 Security Findings

Fix all newly discovered security flaws from the extended audit. Changes are grouped by file to minimize churn.

---

### Tauri Config

#### [MODIFY] [tauri.conf.json](file:///D:/github/varlock_ui/src-tauri/tauri.conf.json)

Set a strict Content Security Policy to prevent XSS from accessing Tauri IPC:
```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ipc: http://ipc.localhost"
}
```

---

### Crypto Module

#### [MODIFY] [crypto.rs](file:///D:/github/varlock_ui/src-tauri/src/vault/crypto.rs)

**Fix #7 — Modular bias**: Replace `generate_from_charset()` with rejection sampling. Discard random bytes ≥ `256 - (256 % charset.len())` to eliminate bias.

**Fix #12 — Password validation**: Add a `validate_password()` function enforcing minimum 12-character length. Return a `CryptoError` on failure.

---

### Vault Database

#### [MODIFY] [vault_db.rs](file:///D:/github/varlock_ui/src-tauri/src/vault/vault_db.rs)

**Fix #8 — DEK verification**: Add a `verify_dek(&self, dek: &SecureKey)` method that performs a trial encrypt+decrypt of a known canary to confirm the DEK is valid.

**Fix #9 — Audit log hashing**: Change `log_access()` to hash the `key` parameter through the existing `key_hash()` function before storing. Make `key_hash` `pub(crate)` so `audit.rs` can call it.

**Fix #14 — File permissions**: After creating the DB file, set Unix permissions to `0o600` on non-Windows platforms.

---

### Audit Module

#### [MODIFY] [audit.rs](file:///D:/github/varlock_ui/src-tauri/src/vault/audit.rs)

**Fix #9**: Update all helpers (`log_read`, `log_write`, `log_delete`, `log_generate`) to hash the `key` parameter with `VaultDb::key_hash()` before passing to `log_access()`.

---

### Vault Commands

#### [MODIFY] [vault.rs](file:///D:/github/varlock_ui/src-tauri/src/commands/vault.rs)

**Fix #8 — Auto-unlock validation**: After retrieving the DEK from keychain in `vault_auto_unlock`, call `vault.db.verify_dek(&dek)` before storing it. Return `Ok(false)` if verification fails.

**Fix #12 — Password policy**: Call `crypto::validate_password(&password)` at the top of `vault_setup`. Return error if it fails.

**Fix #13 — Keyring strategy change**: In `vault_unlock`, when `remember` is true, store the Argon2 salt + password hash instead of the raw DEK. In `vault_auto_unlock`, re-derive the KEK from the stored credential and run the full unlock flow.

---

### Filesystem Commands

#### [MODIFY] [filesystem.rs](file:///D:/github/varlock_ui/src-tauri/src/commands/filesystem.rs)

**Fix #10 — Path restriction**: Add validation to both `read_env_file` and `write_env_file`: the path must be an absolute path, must exist inside a real directory, and the filename component must start with `.env`. This mirrors the existing `validate_relative_env_file()` logic.

---

### Terminal / Process Commands

#### [MODIFY] [terminal_attach.rs](file:///D:/github/varlock_ui/src-tauri/src/commands/terminal_attach.rs)

**Fix #11 — CWD sanitization**: Wrap `cwd` values in proper quoting in all platform-specific `run_in_terminal_*` functions. On Windows, ensure `cwd` is enclosed in double quotes in the `format!()` strings. On Linux, use shell-safe quoting.

---

## Verification Plan

### Automated Tests

Run existing + new tests with:
```
cd D:\github\varlock_ui\src-tauri
cargo test
```

Existing test coverage:
- `crypto.rs`: Key derivation, encrypt/decrypt roundtrips, tamper detection, secret generation
- `vault_db.rs`: Setup/unlock, CRUD, import, ref-env generation, audit log, wrong DEK rejection
- `resolver.rs`: Mixed env resolution, unresolvable refs, URI parsing

New tests to add:
1. **`crypto.rs`**: `test_generate_from_charset_no_bias` — generate 10,000 chars and assert max deviation per character ≤ 5% vs expected uniform frequency
2. **`crypto.rs`**: `test_validate_password_short` — confirm passwords < 12 chars are rejected
3. **`crypto.rs`**: `test_validate_password_valid` — confirm 12+ char passwords pass
4. **`vault_db.rs`**: `test_verify_dek_correct` — verify returns Ok for correct DEK
5. **`vault_db.rs`**: `test_verify_dek_wrong` — verify returns Err for wrong DEK
6. **`vault_db.rs`**: `test_audit_log_key_is_hashed` — assert the `key` column in `access_log` contains a hex hash, not the plaintext key name

### Build Verification

```
cd D:\github\varlock_ui\src-tauri
cargo build
```
