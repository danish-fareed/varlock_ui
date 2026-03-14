use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::schema::SENSITIVE_KEYWORDS_PUB;

// ── Types ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedEnvFile {
    pub relative_path: String,
    pub role: String,
    pub variable_count: usize,
    pub sensitive_key_count: usize,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationVariable {
    pub key: String,
    pub value: String,
    pub inferred_type: String,
    pub inferred_sensitive: bool,
    pub source_file: String,
    /// Generated decorators for this variable
    pub decorators: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPlan {
    pub detected_files: Vec<DetectedEnvFile>,
    pub variables: Vec<MigrationVariable>,
    pub schema_preview: String,
    pub conflicts: Vec<String>,
    pub backup_paths: Vec<String>,
    pub has_existing_schema: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationApplyResult {
    pub schema_path: String,
    pub backups_created: Vec<String>,
    pub files_written: Vec<String>,
    pub success: bool,
    pub message: String,
}

// ── File Role Classification ──

fn classify_file_role(name: &str) -> &'static str {
    match name {
        ".env.example" | ".env.sample" | ".env.template" => "schema-seed",
        ".env" => "shared-defaults",
        ".env.local" => "local-overrides",
        ".env.schema" => "schema",
        _ if name.starts_with(".env.") => "environment",
        _ => "unknown",
    }
}

// ── Simple .env parser ──

/// Parse a .env file into key-value pairs, preserving order.
/// Handles:
/// - `KEY=VALUE`
/// - `export KEY=VALUE`
/// - Quoted values (single and double)
/// - Comments (#)
/// - Empty lines
fn parse_env_content(content: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Strip `export ` prefix
        let trimmed = if trimmed.starts_with("export ") {
            trimmed.strip_prefix("export ").unwrap_or(trimmed).trim()
        } else {
            trimmed
        };

        // Split on first `=`
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let raw_value = trimmed[eq_pos + 1..].trim();

            // Strip surrounding quotes
            let value = if (raw_value.starts_with('"') && raw_value.ends_with('"'))
                || (raw_value.starts_with('\'') && raw_value.ends_with('\''))
            {
                raw_value[1..raw_value.len() - 1].to_string()
            } else {
                raw_value.to_string()
            };

            if !key.is_empty() {
                pairs.push((key, value));
            }
        }
    }

    pairs
}

// ── Type Inference ──

fn infer_type(key: &str, value: &str) -> &'static str {
    let lower_key = key.to_lowercase();
    let lower_value = value.to_lowercase();

    // Port detection
    if lower_key.contains("port") {
        return "port";
    }

    // URL detection
    if value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("postgres://")
        || value.starts_with("mysql://")
        || value.starts_with("redis://")
        || value.starts_with("mongodb://")
        || value.starts_with("amqp://")
        || lower_key.ends_with("_url")
        || lower_key.ends_with("_uri")
        || lower_key == "url"
        || lower_key == "uri"
    {
        return "url";
    }

    // Boolean detection
    if matches!(
        lower_value.as_str(),
        "true" | "false" | "1" | "0" | "yes" | "no"
    ) {
        return "boolean";
    }

    // Number detection (pure digits, optionally with a decimal point)
    if !value.is_empty() && value.chars().all(|c| c.is_ascii_digit() || c == '.') {
        if value.parse::<f64>().is_ok() && !lower_key.contains("port") {
            return "number";
        }
    }

    // Email detection
    if value.contains('@')
        && value.contains('.')
        && (lower_key.contains("email") || lower_key.contains("mail"))
    {
        return "email";
    }

    // Path detection
    if lower_key.contains("path")
        || lower_key.contains("dir")
        || lower_key.contains("directory")
        || lower_key.ends_with("_file")
    {
        return "path";
    }

    "string"
}

fn infer_sensitive(key: &str) -> bool {
    let lower = key.to_lowercase();
    SENSITIVE_KEYWORDS_PUB.iter().any(|kw| lower.contains(kw))
}

// ── Schema Generation ──

fn generate_schema_content(variables: &[MigrationVariable]) -> String {
    let mut lines = Vec::new();

    for (i, var) in variables.iter().enumerate() {
        if i > 0 {
            lines.push(String::new());
        }

        // Description comment
        lines.push(format!("# {}", var.key));

        // Decorators
        for dec in &var.decorators {
            lines.push(format!("# {}", dec));
        }

        // Key=Value
        lines.push(format!("{}={}", var.key, var.value));
    }

    let mut content = lines.join("\n");
    if !content.is_empty() {
        content.push('\n');
    }
    content
}

// ── Public API ──

/// Scan a project directory and generate a migration plan without writing any files.
pub fn generate_migration_plan(project_path: &str) -> Result<MigrationPlan, String> {
    let dir = Path::new(project_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Invalid project directory: {}", project_path));
    }

    let has_existing_schema = dir.join(".env.schema").exists();

    // Step 1: Detect env files
    let mut detected_files = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(".env") {
            continue;
        }

        let role = classify_file_role(&name);

        // Skip existing .env.schema from processing
        if role == "schema" {
            detected_files.push(DetectedEnvFile {
                relative_path: name,
                role: role.to_string(),
                variable_count: 0,
                sensitive_key_count: 0,
                exists: true,
            });
            continue;
        }

        let content = fs::read_to_string(entry.path()).unwrap_or_default();
        let pairs = parse_env_content(&content);
        let sensitive_count = pairs.iter().filter(|(k, _)| infer_sensitive(k)).count();

        detected_files.push(DetectedEnvFile {
            relative_path: name,
            role: role.to_string(),
            variable_count: pairs.len(),
            sensitive_key_count: sensitive_count,
            exists: true,
        });
    }

    detected_files.sort_by(|a, b| {
        // Sort order: schema-seed first, then shared-defaults, then local, then env files
        let role_order = |r: &str| -> u8 {
            match r {
                "schema" => 0,
                "schema-seed" => 1,
                "shared-defaults" => 2,
                "local-overrides" => 3,
                "environment" => 4,
                _ => 5,
            }
        };
        role_order(&a.role)
            .cmp(&role_order(&b.role))
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });

    // Step 2: Collect all variables from detected files
    // Priority: schema-seed > shared-defaults > local-overrides > environment files
    let mut variable_map: HashMap<String, MigrationVariable> = HashMap::new();
    let mut key_order: Vec<String> = Vec::new();
    let mut conflicts: Vec<String> = Vec::new();

    // Process files in priority order (schema-seed first)
    let priority_order: Vec<&str> = vec![
        "schema-seed",
        "shared-defaults",
        "environment",
        "local-overrides",
    ];

    for role in &priority_order {
        let files_for_role: Vec<&DetectedEnvFile> =
            detected_files.iter().filter(|f| f.role == *role).collect();

        for file in files_for_role {
            let file_path = dir.join(&file.relative_path);
            let content = fs::read_to_string(&file_path).unwrap_or_default();
            let pairs = parse_env_content(&content);

            for (key, value) in pairs {
                if variable_map.contains_key(&key) {
                    let existing = variable_map.get(&key).unwrap();
                    if existing.value != value && !value.is_empty() {
                        conflicts.push(format!(
                            "{}: value in {} differs from {}",
                            key, file.relative_path, existing.source_file
                        ));
                    }
                    // For schema-seed, prefer keeping the existing (seed) value
                    // For other files, don't overwrite
                    continue;
                }

                let inferred_type = infer_type(&key, &value);
                let inferred_sensitive = infer_sensitive(&key);

                // Build decorators
                let mut decorators = Vec::new();
                if inferred_type != "string" {
                    if inferred_type == "enum" {
                        decorators.push(format!("@type=enum({})", value));
                    } else {
                        decorators.push(format!("@type={}", inferred_type));
                    }
                }
                if inferred_sensitive {
                    decorators.push("@sensitive".to_string());
                }
                decorators.push("@required".to_string());

                key_order.push(key.clone());
                variable_map.insert(
                    key.clone(),
                    MigrationVariable {
                        key,
                        value,
                        inferred_type: inferred_type.to_string(),
                        inferred_sensitive,
                        source_file: file.relative_path.clone(),
                        decorators,
                    },
                );
            }
        }
    }

    // Step 3: Build ordered variable list
    let variables: Vec<MigrationVariable> = key_order
        .iter()
        .filter_map(|k| variable_map.remove(k))
        .collect();

    // Step 4: Generate schema preview
    let schema_preview = generate_schema_content(&variables);

    // Step 5: Determine backup paths
    let backup_paths: Vec<String> = if has_existing_schema {
        vec![".env.schema.backup".to_string()]
    } else {
        Vec::new()
    };

    Ok(MigrationPlan {
        detected_files,
        variables,
        schema_preview,
        conflicts,
        backup_paths,
        has_existing_schema,
    })
}

/// Apply a migration plan: write the .env.schema file, creating backups as needed.
/// Then optionally run `varlock init` if needed.
pub fn apply_migration(
    project_path: &str,
    schema_content: &str,
    create_backups: bool,
) -> Result<MigrationApplyResult, String> {
    let dir = Path::new(project_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Invalid project directory: {}", project_path));
    }

    let schema_path = dir.join(".env.schema");
    let mut backups_created = Vec::new();
    let mut files_written = Vec::new();

    // Step 1: Create backup of existing schema if needed
    if create_backups && schema_path.exists() {
        let backup_path = dir.join(".env.schema.backup");
        // If backup already exists, use a numbered suffix
        let final_backup = if backup_path.exists() {
            let mut counter = 1;
            loop {
                let numbered = dir.join(format!(".env.schema.backup.{}", counter));
                if !numbered.exists() {
                    break numbered;
                }
                counter += 1;
                if counter > 100 {
                    return Err(
                        "Too many backup files exist. Please clean up .env.schema.backup.* files."
                            .to_string(),
                    );
                }
            }
        } else {
            backup_path
        };

        fs::copy(&schema_path, &final_backup).map_err(|e| {
            format!(
                "Failed to create backup at {}: {}",
                final_backup.display(),
                e
            )
        })?;
        backups_created.push(
            final_backup
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        );
    }

    // Step 2: Write .env.schema
    fs::write(&schema_path, schema_content)
        .map_err(|e| format!("Failed to write {}: {}", schema_path.display(), e))?;
    files_written.push(".env.schema".to_string());

    Ok(MigrationApplyResult {
        schema_path: schema_path.to_string_lossy().to_string(),
        backups_created,
        files_written,
        success: true,
        message: "Migration applied successfully.".to_string(),
    })
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_env_content_basic() {
        let content = "FOO=bar\nBAZ=qux\n";
        let pairs = parse_env_content(content);
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0], ("FOO".to_string(), "bar".to_string()));
        assert_eq!(pairs[1], ("BAZ".to_string(), "qux".to_string()));
    }

    #[test]
    fn test_parse_env_content_with_export_and_quotes() {
        let content = r#"
export APP_NAME="my app"
DB_URL='postgres://localhost/db'
# this is a comment
PORT=3000
"#;
        let pairs = parse_env_content(content);
        assert_eq!(pairs.len(), 3);
        assert_eq!(pairs[0].0, "APP_NAME");
        assert_eq!(pairs[0].1, "my app");
        assert_eq!(pairs[1].0, "DB_URL");
        assert_eq!(pairs[1].1, "postgres://localhost/db");
        assert_eq!(pairs[2].0, "PORT");
        assert_eq!(pairs[2].1, "3000");
    }

    #[test]
    fn test_classify_file_role() {
        assert_eq!(classify_file_role(".env.example"), "schema-seed");
        assert_eq!(classify_file_role(".env.sample"), "schema-seed");
        assert_eq!(classify_file_role(".env"), "shared-defaults");
        assert_eq!(classify_file_role(".env.local"), "local-overrides");
        assert_eq!(classify_file_role(".env.schema"), "schema");
        assert_eq!(classify_file_role(".env.production"), "environment");
        assert_eq!(classify_file_role(".env.development"), "environment");
    }

    #[test]
    fn test_infer_type_url() {
        assert_eq!(infer_type("DATABASE_URL", "postgres://localhost/db"), "url");
        assert_eq!(infer_type("API_URL", ""), "url");
        assert_eq!(infer_type("HOMEPAGE", "https://example.com"), "url");
    }

    #[test]
    fn test_infer_type_port() {
        assert_eq!(infer_type("PORT", "3000"), "port");
        assert_eq!(infer_type("REDIS_PORT", "6379"), "port");
    }

    #[test]
    fn test_infer_type_boolean() {
        assert_eq!(infer_type("DEBUG", "true"), "boolean");
        assert_eq!(infer_type("VERBOSE", "false"), "boolean");
        assert_eq!(infer_type("ENABLED", "1"), "boolean");
    }

    #[test]
    fn test_infer_type_number() {
        assert_eq!(infer_type("MAX_RETRIES", "5"), "number");
        assert_eq!(infer_type("TIMEOUT_MS", "30000"), "number");
    }

    #[test]
    fn test_infer_sensitive() {
        assert!(infer_sensitive("API_KEY"));
        assert!(infer_sensitive("DATABASE_PASSWORD"));
        assert!(infer_sensitive("JWT_SECRET"));
        assert!(infer_sensitive("OAUTH_TOKEN"));
        assert!(!infer_sensitive("APP_NAME"));
        assert!(!infer_sensitive("PORT"));
        assert!(!infer_sensitive("NODE_ENV"));
    }

    #[test]
    fn test_generate_schema_content() {
        let vars = vec![
            MigrationVariable {
                key: "PORT".to_string(),
                value: "3000".to_string(),
                inferred_type: "port".to_string(),
                inferred_sensitive: false,
                source_file: ".env".to_string(),
                decorators: vec!["@type=port".to_string(), "@required".to_string()],
            },
            MigrationVariable {
                key: "API_KEY".to_string(),
                value: "sk-123".to_string(),
                inferred_type: "string".to_string(),
                inferred_sensitive: true,
                source_file: ".env".to_string(),
                decorators: vec!["@sensitive".to_string(), "@required".to_string()],
            },
        ];

        let content = generate_schema_content(&vars);
        assert!(content.contains("# PORT"));
        assert!(content.contains("# @type=port"));
        assert!(content.contains("PORT=3000"));
        assert!(content.contains("# API_KEY"));
        assert!(content.contains("# @sensitive"));
        assert!(content.contains("API_KEY=sk-123"));
    }
}
