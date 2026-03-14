use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Custom deserializer that coerces any JSON value (string, number, bool, null)
/// into `Option<String>`. The varlock CLI may emit unquoted integers or booleans
/// for config values (e.g. `"value": 5432` for a port).
mod string_or_any {
    use serde::{self, Deserialize, Deserializer};

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let v = serde_json::Value::deserialize(deserializer)?;
        match v {
            serde_json::Value::Null => Ok(None),
            serde_json::Value::String(s) => Ok(Some(s)),
            serde_json::Value::Number(n) => Ok(Some(n.to_string())),
            serde_json::Value::Bool(b) => Ok(Some(b.to_string())),
            other => Ok(Some(other.to_string())),
        }
    }
}

/// Normalized result returned to the frontend dashboard.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarlockLoadResult {
    pub env: String,
    pub valid: bool,
    pub error_count: u32,
    pub warning_count: u32,
    pub variables: Vec<VarlockVariable>,
}

/// A single normalized environment variable for the UI.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarlockVariable {
    pub key: String,
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub var_type: String,
    pub sensitive: bool,
    pub required: bool,
    pub valid: bool,
    pub source: Option<String>,
    pub errors: Vec<String>,
}

/// Real `varlock load --format json-full` response shape.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct VarlockLoadFullResult {
    pub base_path: String,
    #[serde(default)]
    pub sources: Vec<VarlockSource>,
    #[serde(default)]
    pub config: HashMap<String, VarlockConfigItem>,
    pub settings: Option<VarlockSettings>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct VarlockSource {
    pub label: String,
    pub enabled: bool,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct VarlockConfigItem {
    #[serde(default, deserialize_with = "string_or_any::deserialize")]
    pub value: Option<String>,
    #[serde(default)]
    pub is_sensitive: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct VarlockSettings {
    pub redact_logs: Option<bool>,
    pub prevent_leaks: Option<bool>,
}

impl VarlockLoadFullResult {
    pub fn into_load_result(self, env: String) -> VarlockLoadResult {
        let variables = self
            .config
            .into_iter()
            .map(|(key, item)| {
                let value = item.value;
                let sensitive = item.is_sensitive;
                let valid = value.is_some();
                let errors = if valid {
                    Vec::new()
                } else {
                    vec!["No value resolved".to_string()]
                };

                VarlockVariable {
                    key,
                    value,
                    var_type: "string".to_string(),
                    sensitive,
                    required: true,
                    valid,
                    source: Some(self.base_path.clone()),
                    errors,
                }
            })
            .collect::<Vec<_>>();

        let error_count = variables.iter().filter(|variable| !variable.valid).count() as u32;

        VarlockLoadResult {
            env,
            valid: error_count == 0,
            error_count,
            warning_count: 0,
            variables,
        }
    }
}

/// Result from `varlock scan`
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarlockScanResult {
    pub clean: bool,
    pub leak_count: u32,
    pub leaks: Vec<VarlockLeak>,
}

/// A single secret leak found by varlock scan.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarlockLeak {
    pub file: String,
    pub line: u32,
    pub key: String,
    pub severity: String,
}

/// Events streamed from a running `varlock run` process via Tauri Channel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum ProcessEvent {
    Stdout { data: String },
    Stderr { data: String },
    Exit { code: Option<i32> },
    Error { message: String },
}

/// Varlock installation status returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarlockStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_config_with_integer_value() {
        let json = r#"{
            "basePath": "/app",
            "config": {
                "DB_PORT": { "value": 5432, "isSensitive": false },
                "DB_HOST": { "value": "localhost", "isSensitive": false }
            }
        }"#;
        let result: VarlockLoadFullResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.config["DB_PORT"].value, Some("5432".to_string()));
        assert_eq!(
            result.config["DB_HOST"].value,
            Some("localhost".to_string())
        );
    }

    #[test]
    fn test_parse_config_with_boolean_value() {
        let json = r#"{
            "basePath": "/app",
            "config": {
                "DEBUG": { "value": true, "isSensitive": false },
                "VERBOSE": { "value": false, "isSensitive": false }
            }
        }"#;
        let result: VarlockLoadFullResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.config["DEBUG"].value, Some("true".to_string()));
        assert_eq!(result.config["VERBOSE"].value, Some("false".to_string()));
    }

    #[test]
    fn test_parse_config_with_null_value() {
        let json = r#"{
            "basePath": "/app",
            "config": {
                "UNSET_VAR": { "value": null, "isSensitive": false }
            }
        }"#;
        let result: VarlockLoadFullResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.config["UNSET_VAR"].value, None);
    }

    #[test]
    fn test_parse_config_with_float_value() {
        let json = r#"{
            "basePath": "/app",
            "config": {
                "RATE_LIMIT": { "value": 1.5, "isSensitive": false }
            }
        }"#;
        let result: VarlockLoadFullResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.config["RATE_LIMIT"].value, Some("1.5".to_string()));
    }
}
