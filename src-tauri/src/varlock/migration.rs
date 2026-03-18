use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::state::vault_state::VaultState;

const VAULT_EXEC_BIN: &str = "devpad";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationSourceFilePreview {
    pub relative_path: String,
    pub env_name: String,
    pub deletable: bool,
    pub file_content: String,
    pub variable_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretPreview {
    pub key: String,
    pub env_name: String,
    pub source_file: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvOverridePreview {
    pub env_name: String,
    pub relative_path: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationVariablePreview {
    pub key: String,
    pub detected_type: String,
    pub sensitive: bool,
    pub sensitive_reason: String,
    pub classification_confidence: String,
    pub by_env: BTreeMap<String, String>,
    pub schema_value_preview: String,
    pub non_sensitive_overrides: Vec<EnvOverridePreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSummary {
    pub env_name: String,
    pub variable_count: usize,
    pub sensitive_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPreview {
    pub cwd: String,
    pub already_migrated: bool,
    pub blocked_reason: Option<String>,
    pub source_files: Vec<MigrationSourceFilePreview>,
    pub variables: Vec<MigrationVariablePreview>,
    pub secrets_to_vault: Vec<SecretPreview>,
    pub generated_schema: String,
    pub generated_example: String,
    pub env_summaries: Vec<EnvSummary>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultedSecretResult {
    pub key: String,
    pub env_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub cwd: String,
    pub schema_path: String,
    pub example_path: String,
    pub backup_path: String,
    pub migrated_variables: Vec<String>,
    pub vaulted_secrets: Vec<VaultedSecretResult>,
    pub deleted_files: Vec<String>,
    pub kept_local_files: Vec<String>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MigrationError {
    AlreadyMigrated {
        schema_path: String,
    },
    NoEnvSourcesFound,
    VaultLocked,
    VaultStoreFailed {
        key: String,
        env: String,
        reason: String,
    },
    SchemaWriteFailed {
        path: String,
        reason: String,
    },
    ExampleWriteFailed {
        path: String,
        reason: String,
    },
    DeleteFailed {
        path: String,
        reason: String,
    },
    BackupFailed {
        reason: String,
    },
    AtomicityGuardFailed {
        reason: String,
    },
    InvalidProjectPath {
        path: String,
    },
}

impl std::fmt::Display for MigrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MigrationError::AlreadyMigrated { schema_path } => write!(
                f,
                "Project already migrated — .env.schema exists at {}",
                schema_path
            ),
            MigrationError::NoEnvSourcesFound => {
                write!(f, "No .env sources found for migration")
            }
            MigrationError::VaultLocked => {
                write!(f, "Vault is locked. Unlock Devpad vault before migration.")
            }
            MigrationError::VaultStoreFailed { key, env, reason } => {
                write!(
                    f,
                    "Failed to store secret {} for env {}: {}",
                    key, env, reason
                )
            }
            MigrationError::SchemaWriteFailed { path, reason } => {
                write!(f, "Failed to write schema {}: {}", path, reason)
            }
            MigrationError::ExampleWriteFailed { path, reason } => {
                write!(f, "Failed to write .env.example {}: {}", path, reason)
            }
            MigrationError::DeleteFailed { path, reason } => {
                write!(f, "Failed to delete source file {}: {}", path, reason)
            }
            MigrationError::BackupFailed { reason } => {
                write!(f, "Failed to create vault backup: {}", reason)
            }
            MigrationError::AtomicityGuardFailed { reason } => {
                write!(f, "Migration atomicity guard failed: {}", reason)
            }
            MigrationError::InvalidProjectPath { path } => {
                write!(f, "Invalid project path: {}", path)
            }
        }
    }
}

#[derive(Debug, Clone)]
struct SourceFile {
    relative_path: String,
    absolute_path: PathBuf,
    env_name: String,
    deletable: bool,
    include_for_inference: bool,
    include_for_migration: bool,
    content: String,
    vars: Vec<ParsedVar>,
}

#[derive(Debug, Clone)]
struct ParsedVar {
    key: String,
    value: String,
}

#[derive(Debug, Clone)]
struct AggregatedVar {
    key: String,
    detected_type: String,
    sensitive: bool,
    sensitive_reason: String,
    confidence: String,
    by_env: BTreeMap<String, String>,
    schema_value_preview: String,
    non_sensitive_overrides: Vec<EnvOverridePreview>,
    secret_sources: Vec<SecretPreview>,
}

fn extract_env_name(file_name: &str) -> String {
    if file_name == ".env" {
        return "development".to_string();
    }
    if let Some(rest) = file_name.strip_prefix(".env.") {
        if !rest.is_empty() {
            return rest.to_string();
        }
    }
    "development".to_string()
}

fn should_skip_local(file_name: &str) -> bool {
    file_name == ".env.local" || file_name.starts_with(".env.") && file_name.ends_with(".local")
}

fn is_env_source(file_name: &str) -> bool {
    file_name == ".env"
        || file_name == ".env.example"
        || (file_name.starts_with(".env.") && file_name != ".env.schema")
}

fn parse_env_content(content: &str) -> Vec<ParsedVar> {
    let mut out = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let rest = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let Some(eq_idx) = rest.find('=') else {
            continue;
        };
        let key = rest[..eq_idx].trim();
        if key.is_empty() {
            continue;
        }
        let value = rest[eq_idx + 1..]
            .trim()
            .trim_matches('"')
            .trim_matches('\'');
        out.push(ParsedVar {
            key: key.to_string(),
            value: value.to_string(),
        });
    }
    out
}

fn looks_like_url(value: &str) -> bool {
    let v = value.to_ascii_lowercase();
    v.starts_with("http://")
        || v.starts_with("https://")
        || v.starts_with("postgres://")
        || v.starts_with("mysql://")
        || v.starts_with("mongodb://")
        || v.starts_with("redis://")
        || v.starts_with("amqp://")
}

fn looks_like_bool(value: &str) -> bool {
    matches!(value.to_ascii_lowercase().as_str(), "true" | "false")
}

fn looks_like_number(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    value.parse::<i64>().is_ok() || value.parse::<f64>().is_ok()
}

fn looks_like_port(key: &str, value: &str) -> bool {
    if !key.to_ascii_lowercase().contains("port") {
        return false;
    }
    let Ok(n) = value.parse::<u16>() else {
        return false;
    };
    n > 0
}

fn sensitive_pattern_reason(key: &str, value: &str) -> Option<String> {
    let lk = key.to_ascii_lowercase();
    let lv = value.to_ascii_lowercase();

    let patterns = [
        "api_key",
        "apikey",
        "password",
        "token",
        "secret",
        "private_key",
        "privatekey",
        "connection_string",
        "connectionstring",
        "dsn",
    ];

    for p in patterns {
        if lk.contains(p) {
            return Some(format!("key pattern '{}' matched", p));
        }
    }

    if lv.contains("-----begin") && lv.contains("private key") {
        return Some("private key content detected".to_string());
    }
    if lv.starts_with("sk_") || lv.starts_with("ghp_") || lv.starts_with("xoxb-") {
        return Some("high-risk secret token format detected".to_string());
    }
    if lv.contains("://") && lv.contains('@') {
        return Some("credential-bearing connection URI detected".to_string());
    }

    None
}

fn should_downgrade_sensitive(value: &str) -> bool {
    looks_like_bool(value)
        || value.parse::<i64>().is_ok()
        || matches!(
            value.to_ascii_lowercase().as_str(),
            "development"
                | "production"
                | "staging"
                | "test"
                | "enabled"
                | "disabled"
                | "on"
                | "off"
        )
}

fn infer_type(key: &str, value: &str) -> String {
    if looks_like_url(value) {
        return "url".to_string();
    }
    if looks_like_bool(value) {
        return "boolean".to_string();
    }
    if looks_like_port(key, value) {
        return "port".to_string();
    }
    if looks_like_number(value) {
        return "number".to_string();
    }
    "string".to_string()
}

fn classify_sensitive(key: &str, value: &str, source_file: &str) -> (bool, String, String) {
    let reason = sensitive_pattern_reason(key, value);
    if let Some(r) = reason {
        if source_file == ".env.example" {
            return (
                false,
                "example-file value excluded from secret migration".to_string(),
                "low".to_string(),
            );
        }
        if should_downgrade_sensitive(value) {
            return (
                false,
                "detected as config, not secret (heuristic downgrade)".to_string(),
                "medium".to_string(),
            );
        }
        return (true, r, "high".to_string());
    }
    (
        false,
        "no sensitive pattern match".to_string(),
        "high".to_string(),
    )
}

fn quote_exec_arg(s: &str) -> String {
    s.replace('"', "\\\"")
}

fn build_exec_value(cwd: &str, env_name: &str, key: &str) -> String {
    format!(
        "exec('{} vault read --project \"{}\" --env \"{}\" --key {}')",
        VAULT_EXEC_BIN,
        quote_exec_arg(cwd),
        quote_exec_arg(env_name),
        key
    )
}

fn scan_source_files(cwd: &str) -> Result<Vec<SourceFile>, MigrationError> {
    let root = Path::new(cwd);
    if !root.exists() || !root.is_dir() {
        return Err(MigrationError::InvalidProjectPath {
            path: cwd.to_string(),
        });
    }

    let mut out = Vec::new();
    let entries = fs::read_dir(root).map_err(|e| MigrationError::InvalidProjectPath {
        path: format!("{} ({})", cwd, e),
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_env_source(&name) || name == ".env.schema" {
            continue;
        }

        let is_local = should_skip_local(&name);
        let include_for_migration = !is_local;
        let include_for_inference = true;
        let deletable = include_for_migration && name != ".env.example";

        let content = fs::read_to_string(&path).unwrap_or_default();
        let vars = parse_env_content(&content);

        out.push(SourceFile {
            relative_path: name.clone(),
            absolute_path: path,
            env_name: extract_env_name(&name),
            deletable,
            include_for_inference,
            include_for_migration,
            content,
            vars,
        });
    }

    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

fn aggregate_preview(cwd: &str, sources: &[SourceFile]) -> (Vec<AggregatedVar>, Vec<String>) {
    let mut warnings = Vec::new();
    let mut map: BTreeMap<String, Vec<(String, String, String)>> = BTreeMap::new();

    for source in sources.iter().filter(|s| s.include_for_inference) {
        for var in &source.vars {
            map.entry(var.key.clone()).or_default().push((
                source.env_name.clone(),
                var.value.clone(),
                source.relative_path.clone(),
            ));
        }
    }

    let mut aggregated = Vec::new();

    for (key, values) in map {
        let mut by_env: BTreeMap<String, String> = BTreeMap::new();
        let mut first_type = "string".to_string();
        let mut sensitive = false;
        let mut sensitive_reason = "no sensitive pattern match".to_string();
        let mut confidence = "high".to_string();
        let mut secret_sources = Vec::new();
        let mut non_sensitive_overrides = Vec::new();

        let mut env_first_values: BTreeMap<String, (String, String)> = BTreeMap::new();
        for (env_name, value, source_file) in &values {
            env_first_values
                .entry(env_name.clone())
                .or_insert_with(|| (value.clone(), source_file.clone()));
        }

        for (env_name, (value, source_file)) in &env_first_values {
            by_env.insert(env_name.clone(), value.clone());
            let t = infer_type(&key, value);
            if first_type == "string" {
                first_type = t;
            }
            let (is_sensitive, reason, conf) = classify_sensitive(&key, value, source_file);
            if is_sensitive {
                sensitive = true;
                sensitive_reason = reason.clone();
                confidence = conf;
                secret_sources.push(SecretPreview {
                    key: key.clone(),
                    env_name: env_name.clone(),
                    source_file: source_file.clone(),
                    reason,
                });
            } else if reason.contains("example-file") || reason.contains("heuristic downgrade") {
                warnings.push(format!("{} ({})", key, reason));
            }
        }

        let base_value = env_first_values
            .get("development")
            .map(|(v, _)| v.clone())
            .or_else(|| env_first_values.values().next().map(|(v, _)| v.clone()))
            .unwrap_or_default();

        let schema_value_preview = if sensitive {
            build_exec_value(cwd, "development", &key)
        } else {
            base_value.clone()
        };

        if !sensitive {
            for (env_name, (value, source_file)) in &env_first_values {
                if *value != base_value {
                    non_sensitive_overrides.push(EnvOverridePreview {
                        env_name: env_name.clone(),
                        relative_path: source_file.clone(),
                        value: value.clone(),
                    });
                }
            }
        }

        aggregated.push(AggregatedVar {
            key,
            detected_type: first_type,
            sensitive,
            sensitive_reason,
            confidence,
            by_env,
            schema_value_preview,
            non_sensitive_overrides,
            secret_sources,
        });
    }

    (aggregated, warnings)
}

fn render_schema(cwd: &str, aggregated: &[AggregatedVar]) -> String {
    let mut lines = Vec::new();
    for (idx, var) in aggregated.iter().enumerate() {
        if idx > 0 {
            lines.push(String::new());
        }
        lines.push(format!("# {}", var.key));
        lines.push(format!("# @env-spec @type={}", var.detected_type));
        lines.push("# @required".to_string());
        if var.sensitive {
            lines.push("# @sensitive".to_string());
            lines.push(format!(
                "{}={}",
                var.key,
                build_exec_value(cwd, "development", &var.key)
            ));
        } else {
            lines.push(format!("{}={}", var.key, var.schema_value_preview));
        }
    }
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

fn render_example(aggregated: &[AggregatedVar]) -> String {
    let mut lines = Vec::new();
    for var in aggregated {
        let value = if var.sensitive {
            "<stored in vault>".to_string()
        } else {
            var.schema_value_preview.clone()
        };
        lines.push(format!("{}={}", var.key, value));
    }
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

fn render_non_sensitive_env_files(
    aggregated: &[AggregatedVar],
    env_names: &HashSet<String>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for env_name in env_names {
        if env_name == "development" {
            continue;
        }
        let mut lines = Vec::new();
        for var in aggregated {
            if var.sensitive {
                continue;
            }
            if let Some(value) = var.by_env.get(env_name) {
                lines.push(format!("{}={}", var.key, value));
            }
        }
        if !lines.is_empty() {
            let mut content = lines.join("\n");
            content.push('\n');
            out.insert(format!(".env.{}", env_name), content);
        }
    }
    out
}

fn create_vault_backup() -> Result<String, MigrationError> {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("varlock-ui");
    let backups_dir = data_dir.join("backups");
    fs::create_dir_all(&backups_dir).map_err(|e| MigrationError::BackupFailed {
        reason: format!("failed to create backups dir: {}", e),
    })?;

    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(MigrationError::BackupFailed {
            reason: "vault database not found".to_string(),
        });
    }

    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let backup_path = backups_dir.join(format!("vault-{}.db", stamp));

    fs::copy(&db_path, &backup_path).map_err(|e| MigrationError::BackupFailed {
        reason: format!("failed to copy vault database: {}", e),
    })?;

    Ok(backup_path.to_string_lossy().to_string())
}

pub fn get_migration_preview(cwd: &str) -> Result<MigrationPreview, MigrationError> {
    let schema_path = Path::new(cwd).join(".env.schema");
    if schema_path.exists() {
        return Ok(MigrationPreview {
            cwd: cwd.to_string(),
            already_migrated: true,
            blocked_reason: Some(format!(
                "Project already migrated — .env.schema exists at {}",
                schema_path.to_string_lossy()
            )),
            source_files: Vec::new(),
            variables: Vec::new(),
            secrets_to_vault: Vec::new(),
            generated_schema: String::new(),
            generated_example: String::new(),
            env_summaries: Vec::new(),
            warnings: vec!["Migration disabled for already-migrated project".to_string()],
        });
    }

    let source_files = scan_source_files(cwd)?;
    let migration_sources = source_files
        .iter()
        .filter(|s| s.include_for_migration)
        .count();
    if migration_sources == 0 {
        return Err(MigrationError::NoEnvSourcesFound);
    }

    let (aggregated, mut warnings) = aggregate_preview(cwd, &source_files);
    let generated_schema = render_schema(cwd, &aggregated);
    let generated_example = render_example(&aggregated);

    let mut env_summary_map: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    let mut source_previews = Vec::new();

    for source in &source_files {
        let sensitive_count = source
            .vars
            .iter()
            .filter(|v| classify_sensitive(&v.key, &v.value, &source.relative_path).0)
            .count();
        let entry = env_summary_map
            .entry(source.env_name.clone())
            .or_insert((0, 0));
        entry.0 += source.vars.len();
        entry.1 += sensitive_count;

        source_previews.push(MigrationSourceFilePreview {
            relative_path: source.relative_path.clone(),
            env_name: source.env_name.clone(),
            deletable: source.deletable,
            file_content: source.content.clone(),
            variable_count: source.vars.len(),
        });
    }

    let env_summaries = env_summary_map
        .into_iter()
        .map(|(env_name, (variable_count, sensitive_count))| EnvSummary {
            env_name,
            variable_count,
            sensitive_count,
        })
        .collect::<Vec<_>>();

    let mut secrets_to_vault = Vec::new();
    let variables = aggregated
        .iter()
        .map(|v| {
            secrets_to_vault.extend(v.secret_sources.clone());
            MigrationVariablePreview {
                key: v.key.clone(),
                detected_type: v.detected_type.clone(),
                sensitive: v.sensitive,
                sensitive_reason: v.sensitive_reason.clone(),
                classification_confidence: v.confidence.clone(),
                by_env: v.by_env.clone(),
                schema_value_preview: v.schema_value_preview.clone(),
                non_sensitive_overrides: v.non_sensitive_overrides.clone(),
            }
        })
        .collect::<Vec<_>>();

    if secrets_to_vault.is_empty() {
        warnings.push("No sensitive values detected for vault migration".to_string());
    }

    Ok(MigrationPreview {
        cwd: cwd.to_string(),
        already_migrated: false,
        blocked_reason: None,
        source_files: source_previews,
        variables,
        secrets_to_vault,
        generated_schema,
        generated_example,
        env_summaries,
        warnings,
    })
}

pub fn migrate_project_to_varlock(
    cwd: &str,
    vault: &VaultState,
) -> Result<MigrationResult, MigrationError> {
    let preview = get_migration_preview(cwd)?;
    if preview.already_migrated {
        return Err(MigrationError::AlreadyMigrated {
            schema_path: Path::new(cwd)
                .join(".env.schema")
                .to_string_lossy()
                .to_string(),
        });
    }

    let sources = scan_source_files(cwd)?;
    let (aggregated, warnings) = aggregate_preview(cwd, &sources);

    let backup_path = create_vault_backup()?;

    let dek = vault.get_dek().ok_or(MigrationError::VaultLocked)?;

    let mut vaulted = Vec::new();
    for source in sources.iter().filter(|s| s.include_for_migration) {
        for var in &source.vars {
            let (is_sensitive, _, _) =
                classify_sensitive(&var.key, &var.value, &source.relative_path);
            if !is_sensitive {
                continue;
            }

            vault
                .db
                .set_variable(
                    &dek,
                    cwd,
                    &source.env_name,
                    &var.key,
                    &var.value,
                    "string",
                    true,
                    true,
                    "",
                )
                .map_err(|e| MigrationError::VaultStoreFailed {
                    key: var.key.clone(),
                    env: source.env_name.clone(),
                    reason: e.to_string(),
                })?;

            vaulted.push(VaultedSecretResult {
                key: var.key.clone(),
                env_name: source.env_name.clone(),
            });
        }
    }

    let schema_path = Path::new(cwd).join(".env.schema");
    let schema_content = render_schema(cwd, &aggregated);
    fs::write(&schema_path, &schema_content).map_err(|e| MigrationError::SchemaWriteFailed {
        path: schema_path.to_string_lossy().to_string(),
        reason: e.to_string(),
    })?;

    let example_path = Path::new(cwd).join(".env.example");
    let example_content = render_example(&aggregated);
    fs::write(&example_path, &example_content).map_err(|e| MigrationError::ExampleWriteFailed {
        path: example_path.to_string_lossy().to_string(),
        reason: e.to_string(),
    })?;

    if !schema_path.exists() || !example_path.exists() {
        return Err(MigrationError::AtomicityGuardFailed {
            reason: "schema/example files missing after write".to_string(),
        });
    }

    let env_names = sources
        .iter()
        .filter(|s| s.include_for_migration)
        .map(|s| s.env_name.clone())
        .collect::<HashSet<_>>();
    let overrides = render_non_sensitive_env_files(&aggregated, &env_names);
    let override_paths: HashSet<String> = overrides.keys().cloned().collect();
    for (relative, content) in overrides {
        let path = Path::new(cwd).join(relative);
        let _ = fs::write(path, content);
    }

    let mut deleted_files = Vec::new();
    let mut kept_local_files = Vec::new();
    for source in &sources {
        if should_skip_local(&source.relative_path) {
            kept_local_files.push(source.relative_path.clone());
            continue;
        }
        if !source.deletable {
            continue;
        }
        if override_paths.contains(&source.relative_path) {
            // Keep rewritten override files in place.
            continue;
        }
        fs::remove_file(&source.absolute_path).map_err(|e| MigrationError::DeleteFailed {
            path: source.absolute_path.to_string_lossy().to_string(),
            reason: e.to_string(),
        })?;
        deleted_files.push(source.relative_path.clone());
    }

    Ok(MigrationResult {
        cwd: cwd.to_string(),
        schema_path: schema_path.to_string_lossy().to_string(),
        example_path: example_path.to_string_lossy().to_string(),
        backup_path,
        migrated_variables: aggregated.iter().map(|v| v.key.clone()).collect(),
        vaulted_secrets: vaulted,
        deleted_files,
        kept_local_files,
        warnings,
        errors: Vec::new(),
        success: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_idempotency_when_schema_exists() {
        let base =
            std::env::temp_dir().join(format!("varlock-migration-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let schema_path = base.join(".env.schema");
        let mut file = std::fs::File::create(&schema_path).unwrap();
        file.write_all(b"# schema\n").unwrap();

        let preview = get_migration_preview(base.to_string_lossy().as_ref()).unwrap();
        assert!(preview.already_migrated);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_extract_env_name() {
        assert_eq!(extract_env_name(".env"), "development");
        assert_eq!(extract_env_name(".env.production"), "production");
    }

    #[test]
    fn test_sensitive_downgrade() {
        let (s, reason, _) = classify_sensitive("TOKEN_EXPIRY_SECONDS", "3600", ".env");
        assert!(!s);
        assert!(reason.contains("heuristic downgrade"));
    }

    #[test]
    fn test_infer_type_matrix() {
        assert_eq!(infer_type("DATABASE_URL", "postgres://x"), "url");
        assert_eq!(infer_type("PORT", "3000"), "port");
        assert_eq!(infer_type("DEBUG", "true"), "boolean");
        assert_eq!(infer_type("RETRY_COUNT", "5"), "number");
        assert_eq!(infer_type("NODE_ENV", "development"), "string");
    }

    #[test]
    fn test_common_pattern_classification_matrix() {
        let cases = vec![
            ("API_KEY", "sk_live_123", true, "string"),
            (
                "DATABASE_URL",
                "postgres://localhost:5432/app",
                false,
                "url",
            ),
            ("PORT", "3000", false, "port"),
            ("NODE_ENV", "development", false, "string"),
            ("JWT_SECRET", "abc123xyz", true, "string"),
            ("REDIS_DSN", "redis://localhost:6379", true, "url"),
            ("TOKEN_EXPIRY_SECONDS", "3600", false, "number"),
            ("ENABLE_CACHE", "true", false, "boolean"),
            (
                "PRIVATE_KEY",
                "-----BEGIN PRIVATE KEY-----abc",
                true,
                "string",
            ),
            (
                "CONNECTION_STRING",
                "Server=localhost;User Id=app;",
                true,
                "string",
            ),
        ];

        for (key, value, sensitive_expected, type_expected) in cases {
            let (sensitive, _reason, _confidence) = classify_sensitive(key, value, ".env");
            assert_eq!(
                sensitive, sensitive_expected,
                "key {} sensitivity mismatch",
                key
            );
            assert_eq!(
                infer_type(key, value),
                type_expected,
                "key {} type mismatch",
                key
            );
        }
    }

    #[test]
    fn test_parse_env_content() {
        let parsed = parse_env_content("A=1\nexport B=two\n#x\n");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].key, "A");
        assert_eq!(parsed[1].key, "B");
    }

    #[test]
    fn test_render_schema_uses_exec_for_sensitive() {
        let var = AggregatedVar {
            key: "DATABASE_URL".to_string(),
            detected_type: "url".to_string(),
            sensitive: true,
            sensitive_reason: "x".to_string(),
            confidence: "high".to_string(),
            by_env: BTreeMap::new(),
            schema_value_preview: String::new(),
            non_sensitive_overrides: vec![],
            secret_sources: vec![],
        };
        let schema = render_schema("/tmp/project", &[var]);
        assert!(schema.contains("exec('devpad vault read"));
    }
}
