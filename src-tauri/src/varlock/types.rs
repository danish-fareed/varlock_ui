use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
pub struct VarlockSource {
    pub label: String,
    pub enabled: bool,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct VarlockConfigItem {
    pub value: Option<String>,
    #[serde(default)]
    pub is_sensitive: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
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
