use super::schema_types::{ParsedSchemaEntry, SchemaDecorator, SchemaParseResult};

/// Valid variable types for .env.schema decorators.
const VALID_TYPES: &[&str] = &[
    "string", "url", "port", "number", "boolean", "enum", "email", "path",
];

/// Keywords that suggest a variable holds a sensitive value.
const SENSITIVE_KEYWORDS: &[&str] = &[
    "secret",
    "password",
    "token",
    "key",
    "api_key",
    "apikey",
    "private",
    "credential",
    "auth",
    "jwt",
    "oauth",
    "salt",
    "hash",
];

/// Public re-export for use by migration module.
pub const SENSITIVE_KEYWORDS_PUB: &[&str] = SENSITIVE_KEYWORDS;

/// Parse a .env.schema file into structured entries with decorator support.
///
/// Handles:
/// - Comment decorators: `# @required`, `# @optional`, `# @sensitive`
/// - Typed decorators: `# @type=url`, `# @type=port`, `# @type=enum(...)`
/// - Description lines in preceding comments
/// - Blank line separation between entries
/// - `export KEY=VALUE` syntax
/// - Entries with empty values
///
/// Returns entries and any non-fatal warnings.
pub fn parse_schema(content: &str) -> SchemaParseResult {
    let lines: Vec<&str> = content.lines().collect();
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let mut comment_block: Vec<String> = Vec::new();
    let mut comment_block_start: i32 = -1;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // Blank line resets the comment block
        if trimmed.is_empty() {
            comment_block.clear();
            comment_block_start = -1;
            continue;
        }

        // Accumulate comment lines
        if trimmed.starts_with('#') {
            if comment_block.is_empty() {
                comment_block_start = i as i32;
            }
            comment_block.push(trimmed.to_string());
            continue;
        }

        // Try to parse as KEY=VALUE (with optional `export` prefix)
        if let Some(entry) = try_parse_assignment(
            trimmed,
            &comment_block,
            comment_block_start,
            i,
            &mut warnings,
        ) {
            entries.push(entry);
        }

        // Reset comment block after any non-comment, non-blank line
        comment_block.clear();
        comment_block_start = -1;
    }

    SchemaParseResult { entries, warnings }
}

/// Try to parse a line as a `KEY=VALUE` assignment and build a schema entry.
fn try_parse_assignment(
    trimmed: &str,
    comment_block: &[String],
    comment_block_start: i32,
    line_index: usize,
    warnings: &mut Vec<String>,
) -> Option<ParsedSchemaEntry> {
    // Strip optional `export ` prefix
    let rest = if trimmed.starts_with("export ") {
        &trimmed[7..]
    } else {
        trimmed
    };

    // Find the `=` separator
    let eq_pos = rest.find('=')?;
    let key_part = &rest[..eq_pos];

    // Validate key: must start with letter or underscore, then alphanumeric/underscore
    if key_part.is_empty() || !is_valid_env_key(key_part) {
        return None;
    }

    let key = key_part.to_string();
    let raw_value = rest[eq_pos + 1..].to_string();

    let decorators = parse_decorators(comment_block, warnings);
    let description = parse_description(comment_block);

    let var_type = resolve_type(&decorators, &key, &raw_value);
    let required = resolve_required(&decorators);
    let sensitive = resolve_sensitive(&decorators, &key);
    let enum_values = resolve_enum_values(&decorators);

    let line_start = if comment_block_start >= 0 {
        (comment_block_start + 1) as u32
    } else {
        (line_index + 1) as u32
    };
    let line_end = (line_index + 1) as u32;

    Some(ParsedSchemaEntry {
        key,
        base_value: raw_value,
        var_type,
        required,
        sensitive,
        description,
        enum_values,
        decorators,
        line_start,
        line_end,
    })
}

/// Check if a string is a valid environment variable key.
fn is_valid_env_key(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Parse decorator comments from a comment block.
fn parse_decorators(comments: &[String], warnings: &mut Vec<String>) -> Vec<SchemaDecorator> {
    let mut decorators = Vec::new();

    for comment in comments {
        // Strip leading `# ` or `#`
        let text = comment
            .strip_prefix("# ")
            .or_else(|| comment.strip_prefix('#'))
            .unwrap_or(comment)
            .trim();

        if !text.starts_with('@') {
            continue;
        }

        // Match @decorator, @decorator=value, or @decorator(value)
        if let Some(d) = parse_single_decorator(text) {
            decorators.push(d);
        } else {
            warnings.push(format!("Unrecognized decorator syntax: {}", text));
        }
    }

    decorators
}

/// Parse a single decorator string like `@type=url` or `@sensitive`.
fn parse_single_decorator(text: &str) -> Option<SchemaDecorator> {
    let without_at = &text[1..]; // strip leading @

    // Check for @name=value
    if let Some(eq_pos) = without_at.find('=') {
        let name = &without_at[..eq_pos];
        let value = &without_at[eq_pos + 1..];
        if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Some(SchemaDecorator {
                name: name.to_string(),
                value: Some(value.to_string()),
            });
        }
    }

    // Check for @name(value)
    if let Some(paren_pos) = without_at.find('(') {
        if without_at.ends_with(')') {
            let name = &without_at[..paren_pos];
            let value = &without_at[paren_pos..]; // includes parens
            if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                return Some(SchemaDecorator {
                    name: name.to_string(),
                    value: Some(value.to_string()),
                });
            }
        }
    }

    // Simple @name
    if without_at
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
        && !without_at.is_empty()
    {
        return Some(SchemaDecorator {
            name: without_at.to_string(),
            value: None,
        });
    }

    None
}

/// Extract description from non-decorator comment lines.
fn parse_description(comments: &[String]) -> String {
    let mut desc_lines = Vec::new();

    for comment in comments {
        let text = comment
            .strip_prefix("# ")
            .or_else(|| comment.strip_prefix('#'))
            .unwrap_or(comment)
            .trim();

        // Skip decorators and empty lines
        if text.starts_with('@') || text.is_empty() {
            continue;
        }

        desc_lines.push(text);
    }

    desc_lines.join(" ")
}

/// Resolve variable type from decorators, then fall back to key/value inference.
fn resolve_type(decorators: &[SchemaDecorator], key: &str, value: &str) -> String {
    // Check explicit @type decorator
    for d in decorators {
        if d.name == "type" {
            if let Some(ref val) = d.value {
                // Handle @type=enum(...)
                if val.starts_with("enum(") && val.ends_with(')') {
                    return "enum".to_string();
                }
                let cleaned = val.replace(&['(', ')'][..], "").to_lowercase();
                if VALID_TYPES.contains(&cleaned.as_str()) {
                    return cleaned;
                }
            }
        }
    }

    // Infer from key name
    let lower_key = key.to_lowercase();
    if lower_key.contains("url") || lower_key.contains("endpoint") || lower_key.contains("host") {
        return "url".to_string();
    }
    if lower_key.contains("port") {
        return "port".to_string();
    }
    if lower_key == "true"
        || lower_key == "false"
        || lower_key.contains("enable")
        || lower_key.contains("debug")
    {
        return "boolean".to_string();
    }

    // Infer from value
    if value.starts_with("http://") || value.starts_with("https://") {
        return "url".to_string();
    }
    if let Ok(n) = value.parse::<u32>() {
        if value.len() >= 2 && value.len() <= 5 && n > 0 && n <= 65535 {
            return "port".to_string();
        }
    }
    if value == "true" || value == "false" {
        return "boolean".to_string();
    }
    if !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()) {
        return "number".to_string();
    }

    "string".to_string()
}

/// Resolve required flag from decorators (default: true).
fn resolve_required(decorators: &[SchemaDecorator]) -> bool {
    for d in decorators {
        if d.name == "optional" {
            return false;
        }
        if d.name == "required" {
            return true;
        }
    }
    true
}

/// Resolve sensitive flag from decorators or key name inference.
fn resolve_sensitive(decorators: &[SchemaDecorator], key: &str) -> bool {
    for d in decorators {
        if d.name == "sensitive" || d.name == "secret" {
            return true;
        }
    }
    let lower_key = key.to_lowercase();
    SENSITIVE_KEYWORDS.iter().any(|kw| lower_key.contains(kw))
}

/// Extract enum values from @type=enum(...) decorator.
fn resolve_enum_values(decorators: &[SchemaDecorator]) -> Vec<String> {
    for d in decorators {
        if d.name == "type" {
            if let Some(ref val) = d.value {
                if val.starts_with("enum(") && val.ends_with(')') {
                    let inner = &val[5..val.len() - 1];
                    return inner
                        .split(',')
                        .map(|v| v.trim().trim_matches(|c| c == '\'' || c == '"').to_string())
                        .filter(|v| !v.is_empty())
                        .collect();
                }
            }
        }
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_schema() {
        let content = r#"
# Database connection string
# @type=url
# @required
# @sensitive
DATABASE_URL=postgres://localhost:5432/mydb

# Application port
# @type=port
PORT=3000

# Debug mode
# @optional
DEBUG=false
"#;

        let result = parse_schema(content);
        assert!(
            result.warnings.is_empty(),
            "warnings: {:?}",
            result.warnings
        );
        assert_eq!(result.entries.len(), 3);

        let db = &result.entries[0];
        assert_eq!(db.key, "DATABASE_URL");
        assert_eq!(db.var_type, "url");
        assert!(db.required);
        assert!(db.sensitive);
        assert_eq!(db.description, "Database connection string");
        assert_eq!(db.base_value, "postgres://localhost:5432/mydb");

        let port = &result.entries[1];
        assert_eq!(port.key, "PORT");
        assert_eq!(port.var_type, "port");
        assert!(port.required);

        let debug = &result.entries[2];
        assert_eq!(debug.key, "DEBUG");
        assert_eq!(debug.var_type, "boolean");
        assert!(!debug.required);
    }

    #[test]
    fn test_parse_enum_type() {
        let content = "# @type=enum(development, staging, production)\nNODE_ENV=development\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 1);
        let entry = &result.entries[0];
        assert_eq!(entry.var_type, "enum");
        assert_eq!(
            entry.enum_values,
            vec!["development", "staging", "production"]
        );
    }

    #[test]
    fn test_parse_export_prefix() {
        let content = "export API_KEY=abc123\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].key, "API_KEY");
        assert_eq!(result.entries[0].base_value, "abc123");
        assert!(result.entries[0].sensitive); // inferred from key name
    }

    #[test]
    fn test_parse_empty_value() {
        let content = "PLACEHOLDER=\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].key, "PLACEHOLDER");
        assert_eq!(result.entries[0].base_value, "");
    }

    #[test]
    fn test_sensitive_inference() {
        let content = "JWT_SECRET=\nDB_PASSWORD=\nAPP_NAME=\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 3);
        assert!(
            result.entries[0].sensitive,
            "JWT_SECRET should be sensitive"
        );
        assert!(
            result.entries[1].sensitive,
            "DB_PASSWORD should be sensitive"
        );
        assert!(
            !result.entries[2].sensitive,
            "APP_NAME should not be sensitive"
        );
    }

    #[test]
    fn test_blank_line_resets_comment_block() {
        let content = "# This describes FOO\n\n# This describes BAR\nBAR=baz\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].key, "BAR");
        assert_eq!(result.entries[0].description, "This describes BAR");
    }

    #[test]
    fn test_url_inference_from_value() {
        let content = "ENDPOINT=https://api.example.com\n";
        let result = parse_schema(content);
        assert_eq!(result.entries[0].var_type, "url");
    }

    #[test]
    fn test_number_inference() {
        let content = "RETRY_COUNT=5\n";
        let result = parse_schema(content);
        // 5 is a single digit, won't match port (requires 2-5 digits)
        assert_eq!(result.entries[0].var_type, "number");
    }

    #[test]
    fn test_line_ranges() {
        let content = "# Description\n# @type=url\nMY_URL=https://example.com\n";
        let result = parse_schema(content);
        assert_eq!(result.entries[0].line_start, 1);
        assert_eq!(result.entries[0].line_end, 3);
    }

    #[test]
    fn test_malformed_decorator_warning() {
        let content = "# @type=\n# @!!invalid\nFOO=bar\n";
        let result = parse_schema(content);
        assert_eq!(result.entries.len(), 1);
        // @type= is valid (empty value), @!!invalid should warn
        assert!(
            result.warnings.iter().any(|w| w.contains("!!invalid")),
            "Expected warning about invalid decorator, got: {:?}",
            result.warnings
        );
    }

    #[test]
    fn test_empty_content() {
        let result = parse_schema("");
        assert!(result.entries.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_only_comments() {
        let result = parse_schema("# Just a comment\n# Another comment\n");
        assert!(result.entries.is_empty());
        assert!(result.warnings.is_empty());
    }
}
