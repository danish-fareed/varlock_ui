# Varlock Migration + Vault Runtime Resolution: Production Implementation Plan

This document defines the end-to-end, production-grade implementation plan for migrating dotenv projects to Varlock schema with vault-backed secrets, runtime secret resolution, and secure process launch behavior.

It incorporates all required blockers, gaps, and clarifications:

- Redaction at stream ingress (pre-buffer, pre-store, pre-emit)
- Project+environment secret scoping with collision safety
- Typed launcher errors for actionable frontend behavior
- Multi-environment migration semantics
- Idempotency contract
- `varlock load` compatibility via `exec(...)` schema values
- Vault backup before destructive migration
- Command compatibility aliases and deprecation
- `.env.local` / `.env.*.local` exclusion
- Sensitive detection false-positive mitigation
- CLI helper locked-vault human-readable error messaging

---

## 1) Product Goals and Non-Negotiable Guarantees

### Functional outcomes

1. Migrate existing `.env*` project files into a canonical `.env.schema` model.
2. Move sensitive plaintext values into the encrypted vault.
3. Ensure launched processes receive plaintext secrets only in-memory.
4. Keep repository artifacts safe for VCS: schema references only, no plaintext secret persistence.

### Security invariants

1. Plaintext secret values must never be written to project files post-migration.
2. Plaintext secret values must never appear in:
   - process log buffer
   - emitted stdout/stderr IPC events
   - process registry JSON
   - env snapshot persistence
3. Vault-locked launches must fail fast with typed `VaultLocked` error.
4. No destructive file deletion until all prerequisite conditions are met.

### Compatibility outcomes

1. Post-migration `varlock load` succeeds by using `exec(...)` syntax for vault-backed values in `.env.schema`.
2. Existing frontend migration flow remains functional through alias commands during transition.

---

## 2) Scope

### Included

- New backend commands:
  - `get_migration_preview(cwd: String) -> MigrationPreview`
  - `migrate_project_to_varlock(cwd: String) -> MigrationResult`
- Internal runtime resolver:
  - `resolve_vault_uris(...)` equivalent behavior implemented in launcher path (internal-only)
- Launcher hardening in `varlock_run` path.
- Frontend migration UX update to preview-first flow.
- Env bar and variable inspector vault indicators.
- CLI helper mode for `devpad vault read` with actionable locked-vault messaging.

### Explicitly deferred

- OS terminal `run_in_terminal` vault resolution (current release scope is in-app launcher only).

---

## 3) Data Model and Contracts

### 3.1 Backend DTOs

#### `MigrationPreview`

- `cwd: String`
- `already_migrated: bool`
- `blocked_reason: Option<String>`
- `source_files: Vec<MigrationSourceFilePreview>`
- `variables: Vec<MigrationVariablePreview>`
- `secrets_to_vault: Vec<SecretPreview>`
- `generated_schema: String`
- `generated_example: String`
- `env_summaries: Vec<EnvSummary>`
- `warnings: Vec<String>`

#### `MigrationResult`

- `cwd: String`
- `schema_path: String`
- `example_path: String`
- `backup_path: String`
- `migrated_variables: Vec<String>`
- `vaulted_secrets: Vec<VaultedSecretResult>`
- `deleted_files: Vec<String>`
- `kept_local_files: Vec<String>`
- `warnings: Vec<String>`
- `errors: Vec<String>`
- `success: bool`

#### `MigrationVariablePreview`

- `key: String`
- `detected_type: String` (`string|url|number|boolean|port|...`)
- `sensitive: bool`
- `sensitive_reason: String`
- `classification_confidence: String` (`high|medium|low`)
- `by_env: HashMap<String, String>` (masked for sensitive)
- `schema_value_preview: String` (shows `exec(...)` for sensitive)
- `non_sensitive_overrides: Vec<EnvOverridePreview>`

### 3.2 Typed errors (`type` discriminant)

All cross-boundary errors use `#[serde(tag = "type")]`.

#### `LaunchError`

- `VaultLocked`
- `EnvValidationFailed { issues: Vec<String> }`
- `CommandNotFound { command: String }`
- `VaultSecretMissing { key: String, env: String }`
- `VaultResolutionFailed { key: String, reason: String }`
- `SpawnFailed { reason: String }`

#### `MigrationError`

- `AlreadyMigrated { schema_path: String }`
- `NoEnvSourcesFound`
- `VaultLocked`
- `VaultStoreFailed { key: String, env: String, reason: String }`
- `SchemaWriteFailed { path: String, reason: String }`
- `ExampleWriteFailed { path: String, reason: String }`
- `DeleteFailed { path: String, reason: String }`
- `BackupFailed { reason: String }`
- `AtomicityGuardFailed { reason: String }`

---

## 4) File Discovery and Source Rules

### Include as migration sources

- `.env`
- `.env.development`, `.env.production`, `.env.test`, etc.
- `.env.example` for inference context only

### Exclude from destructive migration

- `.env.local`
- `.env.*.local`

These local files are retained as local developer overrides and are never auto-deleted.

### Idempotency gate

- If `${cwd}/.env.schema` exists:
  - Preview returns `already_migrated = true` with explanatory message.
  - Apply returns `MigrationError::AlreadyMigrated` and performs no mutations.

---

## 5) Classification Engine

### 5.1 Sensitive detection

Signal sources:

1. Key pattern matches: `api[_-]?key`, `password`, `token`, `secret`, `private[_-]?key`, `dsn`, `connection[_-]?string`, etc.
2. Value pattern signals: JWT-like, long high-entropy credential-like tokens, URI credentials with embedded auth, PEM markers.

### 5.2 False-positive downgrade

If key matches sensitive pattern but value is clearly config-like:

- pure integer (`3600`), boolean (`true/false`), low-entropy mode strings (`development`, `enabled`, etc.)

then classify as non-sensitive and surface warning:

`Detected as config, not secret (heuristic downgrade)`.

### 5.3 Type inference

Order:

1. URL (`http://`, `https://`, DSN-like structured URL)
2. Boolean (`true|false` case-insensitive)
3. Port (integer in 1..65535, with key/value context)
4. Number (integer/float)
5. String fallback

---

## 6) Multi-Environment Migration Semantics

1. Produce one `.env.schema` with shared variable declarations.
2. For each sensitive variable, vault each environment value under its own scope:
   - `(project_id=cwd, env_name, key)`
3. For non-sensitive variables:
   - schema holds baseline/default
   - per-env non-sensitive differences retained in corresponding env override files as needed
4. `.env.example` generated deterministically:
   - non-sensitive real defaults included
   - sensitive entries rendered as `<stored in vault>` placeholder

---

## 7) Vault Storage Scoping and Collision Safety

### Existing protection

Vault table primary key includes `(project_id, env, key_hash)`.

### Hardening

Adopt scoped hash material for v2 key hash function:

`hash("varlock-key-hash:v2:{project_id}:{env}:{key}")`

Read/write APIs must always include project+env scope to avoid accidental global-key usage.

---

## 8) Schema Output Format (`exec(...)`)

Sensitive schema entries use `exec(...)` so `varlock load` can resolve them even outside app runtime.

Example:

```env
# @env-spec @type=url @sensitive
DATABASE_URL=exec('devpad vault read --project "<cwd>" --env "development" --key DATABASE_URL')
```

Notes:

- This replaces storing `varlock://vault/KEY` directly in `.env.schema`.
- Internal app metadata may still model vault references logically, but persisted schema uses exec-compatible format.

---

## 9) CLI Helper Specification (`devpad vault read`)

### Command

`devpad vault read --project <cwd> --env <env> --key <KEY>`

### Behavior

- On success: print plaintext secret value to stdout only.
- On missing key: exit non-zero, concise stderr message.
- On locked vault: exit non-zero with actionable stderr:

`Devpad vault is locked. Run 'devpad vault unlock' or open the Devpad app to unlock.`

- Never print panic traces or internal stack details.

---

## 10) Migration Apply Algorithm (Two-Phase Safe)

### Preconditions

1. Project path exists and is directory.
2. `.env.schema` does not already exist.
3. Source env files discovered.
4. Vault accessible (for sensitive migration path).

### Phase A: Prepare (no destructive writes)

1. Parse source files and classify all variables.
2. Build target artifacts in-memory (`.env.schema`, `.env.example`, override updates).
3. Create encrypted vault backup snapshot; abort on failure.

### Phase B: Commit with atomic guards

1. Store all sensitive values in vault by scope.
2. Verify all sensitive writes succeeded.
3. Write `.env.schema` to disk.
4. Write `.env.example` to disk.
5. Write/update non-sensitive env override files if required.
6. Verify schema and example files exist and are readable.
7. Only now delete original source files eligible for deletion.

### Deletion rules

- Delete migrated legacy files (`.env`, `.env.development`, etc.) except:
  - `.env.local`
  - `.env.*.local`

### Failure handling

- Any failure before deletion: no source deletion.
- Report partial state clearly in `MigrationResult.errors`.

---

## 11) Runtime Resolution in Launcher (`varlock_run`)

### Resolution flow

1. Load resolved env map for selected env.
2. Detect vault-backed values (exec-derived resolution or URI metadata path as applicable).
3. Ensure vault unlocked before launch; else return `LaunchError::VaultLocked`.
4. Resolve each secret using scoped lookup `(cwd, env_name, key)`.
5. Replace in-memory map only.
6. Spawn process with `Command::envs(resolved_map)`.
7. Drop map when process exits.

No plaintext written to disk.

---

## 12) Redaction Pipeline (Critical Security Control)

### Mandatory placement

Redaction happens **at stream ingress**, when stdout/stderr bytes are read.

Pipeline:

1. raw chunk read from process pipe
2. `sanitize_chunk(raw, redaction_set)`
3. append sanitized chunk to in-memory log buffer
4. emit sanitized chunk to frontend
5. any downstream persistence uses sanitized content only

### Redaction set

- Built from resolved plaintext secrets for current process launch.
- Exclude short/noisy values to avoid over-redaction (minimum length threshold).
- Cleared when process session ends.

---

## 13) Frontend UX Contracts

### Migration flow

1. Settings action: `Migrate to varlock`.
2. Call `get_migration_preview`.
3. Show split preview:
   - left: original env content(s)
   - right: generated `.env.schema`
4. Show sensitive keys that will be vaulted.
5. Allow classification override before apply.
6. Apply via `migrate_project_to_varlock` with progress states:
   - reading
   - classifying
   - backup
   - vaulting
   - writing schema
   - deleting originals
   - done

### Already migrated UX

- Disable migrate action when `already_migrated=true`.
- Show explanatory message and route to schema editing workflow.

### Launch error UX

- Catch `LaunchError` from rejected `invoke` promise.
- If `type === "VaultLocked"`, show unlock modal (not generic toast).

### Env bar and inspector

- Env bar format: `N vars · M vault secrets · <env>`
- Vault-backed vars show lock icon in inspector rows/details.

---

## 14) Command Compatibility and Deprecation

In backend command layer:

- Alias `migration_plan -> get_migration_preview`
- Alias `migration_apply -> migrate_project_to_varlock`
- Mark aliases as deprecated in comments for next release removal.

Frontend should switch to new names in same release.

---

## 15) Testing Strategy

### Unit tests (Rust)

1. Classification matrix (10+ canonical names):
   - `API_KEY`, `DATABASE_URL`, `PORT`, `NODE_ENV`, `TOKEN_EXPIRY_SECONDS`, etc.
2. Sensitive downgrade tests for false positives.
3. Multi-env merge behavior and scoped vault writes.
4. Idempotency gate when `.env.schema` exists.
5. Two-phase safety: verify no deletion on vault/write failures.
6. Backup creation failure abort path.

### Runtime tests

1. `VaultLocked` blocks launch.
2. Resolved env contains plaintext in process only.
3. `DATABASE_URL` secret resolves correctly for target env.
4. Redaction-at-ingress test proving buffer never sees raw secret.

### CLI helper tests

1. `devpad vault read` success output.
2. Locked-vault stderr message exactness and non-zero exit.
3. Missing key behavior.

### Frontend tests

1. Preview render + classification override interactions.
2. Progress phase transitions.
3. Already-migrated disabled UI.
4. Vault-locked launch opens unlock modal.

---

## 16) Rollout and Observability

### Rollout strategy

1. Ship backend contracts + aliases + tests.
2. Ship frontend migration and launch error handling.
3. Enable migration action broadly after smoke validation.

### Telemetry/logging (non-secret)

- Migration event counts, success/failure categories.
- Vault-locked launch block count.
- Redaction invocation counters (never content).

No secret values in telemetry.

---

## 17) Acceptance Criteria Mapping

1. `varlock load` after migration succeeds (via `exec(...)` values).
2. `.env.schema` includes correct decorators and vault-backed execution references.
3. Original env files deleted only after successful vault storage + file writes.
4. Spawned process gets plaintext values in environment.
5. `DATABASE_URL` resolves correctly in process runtime.
6. Plaintext secrets absent from logs/files/IPC/registry/snapshots.
7. Locked vault prevents process start and triggers unlock UX via typed error.
8. Preview classification returns correct results for common variable patterns.

---

## 18) Implementation Checklist

- [ ] Add DTOs and typed errors (`type` discriminant).
- [ ] Add idempotency detection and preview `already_migrated`.
- [ ] Implement backup preflight.
- [ ] Implement classification + override-ready preview model.
- [ ] Implement migration apply two-phase commit + guarded deletion.
- [ ] Implement schema `exec(...)` rendering for sensitive vars.
- [ ] Add/extend CLI helper `devpad vault read` with locked message contract.
- [ ] Wire launcher to typed errors and scoped secret resolution.
- [ ] Implement ingress redaction sanitizer and use single-path buffering.
- [ ] Update frontend migration flow + progress + already-migrated state.
- [ ] Update env bar and variable inspector vault indicators.
- [ ] Add command aliases and deprecation comments.
- [ ] Complete unit/integration/frontend tests.

---

## 19) Final Architecture Decision Record

1. **Error transport:** Tauri native rejected promises with typed serialized errors (`type` field).
2. **Schema secret syntax:** `exec('devpad vault read ...')` for compatibility with `varlock load`.
3. **Scoping:** secret lookup and storage scoped by project + environment + key.
4. **Runtime scope:** in-app launcher path only for this release.
5. **Redaction:** mandatory at stream ingress before any buffering.
