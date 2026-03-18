# Fix Backend & Varlock Integration

## Root Cause Analysis

### Bug 1 — Scan: "EOF while parsing a value at line 1 column 0"

**Root cause:** In `varlock/cli.rs → scan()`, the function tries to parse JSON from `trimmed_stdout` only. But `varlock scan` appears to write its human-readable output to **stderr** (not stdout). So `trimmed_stdout` ends up empty, `extract_json("")` returns `None`, then `unwrap_or("")` gives an empty string — and `serde_json::from_str("")` panics with the EOF error.

The correct fix:
1. Try `extract_json` on `combined_output` (which merges stderr + stdout)
2. If no JSON object is found, **fall back to parsing the human-readable text** format: `FILE:LINE:COL KEY`  
3. Also handle the non-zero (`1`) exit code that `varlock scan` returns when leaks are found

### Bug 2 — Store to Vault uses hardcoded `"default"` env

**Root cause:** In `VariableRow.tsx → handleStoreInVault()`, line 85 hardcodes:
```ts
await setVariable(activeProject.id, "default", variable.key, ...)
```
It should use the actual active environment from `useEnvironmentStore` (e.g. `"development"`). This causes vault lookups to fail silently if the UI is loading by env name `"development"` but storing by `"default"`.

---

## Proposed Changes

### Backend — `src-tauri/src/varlock`

---

#### [MODIFY] [cli.rs](file:///d:/github/varlock_ui/src-tauri/src/varlock/cli.rs)

1. In `scan()`: change `extract_json(trimmed_stdout)` to `extract_json(&combined_output)` so stderr output is also searched.
2. Accept exit code `0` (clean) AND `1` (leaks found) as valid scan outcomes — `varlock scan` exits non-zero when leaks are detected.
3. Add a `parse_scan_text()` helper that parses the human-readable `FILE:LINE:COL KEY` format as a fallback if no JSON is found. Format example:
   ```
   .env.schema:8:4 PGSSLMODE
   Cargo.lock:1:16 S3_REGION
   ```
4. Return a properly constructed `VarlockScanResult { clean, leak_count, leaks }`.

---

#### [MODIFY] [types.rs](file:///d:/github/varlock_ui/src-tauri/src/varlock/types.rs)

- Add unit tests for `VarlockScanResult` parsing (both JSON and text formats)
- Add test: scan with empty stdout (real-world case)

---

### Frontend — `src/components/variables`

---

#### [MODIFY] [VariableRow.tsx](file:///d:/github/varlock_ui/src/components/variables/VariableRow.tsx)

1. Import `useEnvironmentStore` and read `activeEnv`.
2. Replace hardcoded `"default"` with `activeEnv` inside `handleStoreInVault`.
3. After storing, trigger both environment reload AND vault variable reload.

---

## Verification Plan

### Automated Tests

**Run all Rust unit tests:**
```powershell
cd d:\github\varlock_ui\src-tauri
cargo test 2>&1
```
Expected: All existing tests pass + new scan text/JSON tests pass.

**New tests being added (exact locations):**

| File | Test name | What it covers |
|------|-----------|----------------|
| `varlock/cli.rs` (new internal `tests` mod) | `test_parse_scan_text_happy` | Text-format scan output with 2 leaks in 2 files |
| `varlock/cli.rs` | `test_parse_scan_text_empty` | Empty output → clean result |
| `varlock/cli.rs` | `test_scan_json_fallback` | JSON object in combined output |
| `varlock/types.rs` | `test_scan_result_json` | `VarlockScanResult` deserializes correctly from JSON |

### Manual Verification

1. **Scan fix:** Open the app → select a project → click **Run Scan** → the scan results panel should show either "No leaks found" or a grouped list of leaks (not an error about EOF).

2. **Store in vault fix:** 
   - Environment must have a variable with a real value (e.g. `DB_PASSWORD=hunter2`)
   - Right-click the row → **Store in Vault**
   - Check `.env` file: the line should read `DB_PASSWORD=varlock://vault/DB_PASSWORD`
   - Check `.env.schema` file: the entry should have `@sensitive`
   - The vault **variable list** should show `DB_PASSWORD` as sensitive
