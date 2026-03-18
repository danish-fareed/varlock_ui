use super::schema::parse_schema;
use super::schema_types::{MergedLoadResult, MergedVariable};
use super::types::VarlockLoadResult;

/// Merge CLI load result with parsed .env.schema content.
///
/// Priority rules:
/// - Schema metadata wins over heuristic inference
/// - CLI load data wins for runtime values (resolved value, source, validity)
/// - Variables in CLI output but not in schema get "inferred" metadata
/// - Variables in schema but not in CLI output are included with warnings
pub fn merge_load_with_schema(
    load_result: VarlockLoadResult,
    schema_content: Option<&str>,
) -> MergedLoadResult {
    let (schema_parsed, schema_result) = match schema_content {
        Some(content) if !content.trim().is_empty() => {
            let result = parse_schema(content);
            (true, Some(result))
        }
        _ => (false, None),
    };

    let schema_warnings = schema_result
        .as_ref()
        .map(|r| r.warnings.clone())
        .unwrap_or_default();

    let schema_entries = schema_result.map(|r| r.entries).unwrap_or_default();

    let mut variables: Vec<MergedVariable> = Vec::new();
    let mut schema_keys_seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Process each variable from CLI output
    for var in &load_result.variables {
        let schema_entry = schema_entries.iter().find(|e| e.key == var.key);

        if schema_entry.is_some() {
            schema_keys_seen.insert(var.key.clone());
        }

        let merged = build_merged_variable(var, schema_entry);
        variables.push(merged);
    }

    // Add schema-only variables (present in schema but not in CLI output)
    for entry in &schema_entries {
        if schema_keys_seen.contains(&entry.key) {
            continue;
        }

        let mut warnings =
            vec!["Defined in .env.schema but not present in varlock load output.".to_string()];
        if !entry.required {
            warnings.push("Marked as optional in schema.".to_string());
        }

        variables.push(MergedVariable {
            key: entry.key.clone(),
            value: None,
            source: None,
            var_type: entry.var_type.clone(),
            type_source: "schema".to_string(),
            required: entry.required,
            required_source: "schema".to_string(),
            sensitive: entry.sensitive,
            sensitive_source: "schema".to_string(),
            description: entry.description.clone(),
            enum_values: entry.enum_values.clone(),
            valid: !entry.required, // optional without value = valid; required without value = invalid
            errors: if entry.required {
                vec!["Required variable has no resolved value.".to_string()]
            } else {
                Vec::new()
            },
            warnings,
            has_schema: true,
            is_vault_ref: false,
            schema_base_value: Some(entry.base_value.clone()),
            schema_line_start: Some(entry.line_start),
            schema_line_end: Some(entry.line_end),
        });
    }

    // Sort by key for consistent ordering
    variables.sort_by(|a, b| a.key.cmp(&b.key));

    let error_count = variables.iter().filter(|v| !v.valid).count() as u32;
    let warning_count = variables
        .iter()
        .map(|v| v.warnings.len() as u32)
        .sum::<u32>()
        + schema_warnings.len() as u32;

    MergedLoadResult {
        env: load_result.env,
        valid: error_count == 0,
        error_count,
        warning_count,
        variables,
        schema_warnings,
        schema_parsed,
    }
}

/// Build a MergedVariable from a CLI variable and optional schema entry.
fn build_merged_variable(
    var: &super::types::VarlockVariable,
    schema_entry: Option<&super::schema_types::ParsedSchemaEntry>,
) -> MergedVariable {
    let (var_type, type_source) = match schema_entry {
        Some(entry) => (entry.var_type.clone(), "schema".to_string()),
        None => (var.var_type.clone(), "inferred".to_string()),
    };

    let (required, required_source) = match schema_entry {
        Some(entry) => (entry.required, "schema".to_string()),
        None => (var.required, "inferred".to_string()),
    };

    // Detect vault references:
    // - URI style: varlock://vault/KEY
    // - exec helper style: exec('devpad vault read ...')
    // Auto-classify as sensitive regardless of schema/CLI metadata.
    let is_vault_ref = var
        .value
        .as_deref()
        .map(|v| {
            v.starts_with("varlock://vault/")
                || (v.starts_with("exec('") && v.contains(" vault read ") && v.ends_with("')"))
                || (v.starts_with("exec(\"") && v.contains(" vault read ") && v.ends_with("\")"))
        })
        .unwrap_or(false);

    let (sensitive, sensitive_source) = if is_vault_ref {
        (true, "vault".to_string())
    } else {
        match schema_entry {
            Some(entry) => (entry.sensitive, "schema".to_string()),
            None => (var.sensitive, "inferred".to_string()),
        }
    };

    let description = schema_entry
        .map(|e| e.description.clone())
        .unwrap_or_default();

    let enum_values = schema_entry
        .map(|e| e.enum_values.clone())
        .unwrap_or_default();

    let mut warnings: Vec<String> = Vec::new();
    if schema_entry.is_none() {
        warnings.push("No .env.schema entry — metadata is inferred.".to_string());
    }

    MergedVariable {
        key: var.key.clone(),
        value: var.value.clone(),
        source: var.source.clone(),
        var_type,
        type_source,
        required,
        required_source,
        sensitive,
        sensitive_source,
        description,
        enum_values,
        valid: var.valid,
        errors: var.errors.clone(),
        warnings,
        has_schema: schema_entry.is_some(),
        is_vault_ref,
        schema_base_value: schema_entry.map(|e| e.base_value.clone()),
        schema_line_start: schema_entry.map(|e| e.line_start),
        schema_line_end: schema_entry.map(|e| e.line_end),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::varlock::types::{VarlockLoadResult, VarlockVariable};

    fn make_var(key: &str, value: Option<&str>) -> VarlockVariable {
        VarlockVariable {
            key: key.to_string(),
            value: value.map(|v| v.to_string()),
            var_type: "string".to_string(),
            sensitive: false,
            required: true,
            valid: value.is_some(),
            source: Some("/project".to_string()),
            errors: if value.is_some() {
                Vec::new()
            } else {
                vec!["No value resolved".to_string()]
            },
        }
    }

    fn make_load_result(vars: Vec<VarlockVariable>) -> VarlockLoadResult {
        let error_count = vars.iter().filter(|v| !v.valid).count() as u32;
        VarlockLoadResult {
            env: "development".to_string(),
            valid: error_count == 0,
            error_count,
            warning_count: 0,
            variables: vars,
        }
    }

    #[test]
    fn test_merge_without_schema() {
        let load = make_load_result(vec![make_var("FOO", Some("bar"))]);
        let merged = merge_load_with_schema(load, None);

        assert!(!merged.schema_parsed);
        assert_eq!(merged.variables.len(), 1);
        assert_eq!(merged.variables[0].type_source, "inferred");
        assert_eq!(merged.variables[0].required_source, "inferred");
    }

    #[test]
    fn test_merge_with_schema() {
        let load = make_load_result(vec![
            make_var("DATABASE_URL", Some("postgres://localhost/db")),
            make_var("PORT", Some("3000")),
        ]);

        let schema = r#"
# Database URL
# @type=url
# @required
# @sensitive
DATABASE_URL=

# Server port
# @type=port
# @optional
PORT=3000
"#;

        let merged = merge_load_with_schema(load, Some(schema));
        assert!(merged.schema_parsed);
        assert_eq!(merged.variables.len(), 2);

        let db = merged
            .variables
            .iter()
            .find(|v| v.key == "DATABASE_URL")
            .unwrap();
        assert_eq!(db.var_type, "url");
        assert_eq!(db.type_source, "schema");
        assert!(db.sensitive);
        assert_eq!(db.sensitive_source, "schema");
        assert!(db.required);
        assert!(db.has_schema);

        let port = merged.variables.iter().find(|v| v.key == "PORT").unwrap();
        assert_eq!(port.var_type, "port");
        assert!(!port.required); // @optional
        assert_eq!(port.required_source, "schema");
    }

    #[test]
    fn test_schema_only_variable() {
        let load = make_load_result(vec![make_var("FOO", Some("bar"))]);

        let schema = "# @required\nMISSING_VAR=default\n";

        let merged = merge_load_with_schema(load, Some(schema));
        assert_eq!(merged.variables.len(), 2);

        let missing = merged
            .variables
            .iter()
            .find(|v| v.key == "MISSING_VAR")
            .unwrap();
        assert!(missing.has_schema);
        assert!(!missing.valid); // required but no resolved value
        assert!(missing.errors.iter().any(|e| e.contains("Required")));
    }

    #[test]
    fn test_schema_optional_missing_is_valid() {
        let load = make_load_result(vec![]);
        let schema = "# @optional\nOPT_VAR=default\n";

        let merged = merge_load_with_schema(load, Some(schema));
        assert_eq!(merged.variables.len(), 1);
        assert!(merged.variables[0].valid);
    }

    #[test]
    fn test_variables_sorted_by_key() {
        let load = make_load_result(vec![
            make_var("ZZZ", Some("last")),
            make_var("AAA", Some("first")),
        ]);

        let merged = merge_load_with_schema(load, None);
        assert_eq!(merged.variables[0].key, "AAA");
        assert_eq!(merged.variables[1].key, "ZZZ");
    }
}
