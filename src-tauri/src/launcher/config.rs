use crate::launcher::types::ExecutionPolicy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDefaults {
    #[serde(default)]
    pub launcher_mode: ExecutionPolicy,
    #[serde(default)]
    pub sync_mode: ExecutionPolicy,
    #[serde(default)]
    pub healthcheck_mode: ExecutionPolicy,
}

impl Default for LauncherDefaults {
    fn default() -> Self {
        Self {
            launcher_mode: ExecutionPolicy::Auto,
            sync_mode: ExecutionPolicy::Auto,
            healthcheck_mode: ExecutionPolicy::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PythonOverrides {
    pub manager: Option<String>,
    pub venv_path: Option<String>,
    pub install_command: Option<String>,
    pub preferred_interpreter_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeOverrides {
    pub manager: Option<String>,
    pub install_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthcheckOverrides {
    pub endpoint: Option<String>,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VibestartLauncherConfig {
    #[serde(default)]
    pub launcher: LauncherDefaults,
    #[serde(default)]
    pub python: PythonOverrides,
    #[serde(default)]
    pub node: NodeOverrides,
    #[serde(default)]
    pub healthcheck: HealthcheckOverrides,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct VibestartFile {
    #[serde(default)]
    launcher: Option<LauncherDefaults>,
    #[serde(default)]
    python: Option<PythonOverrides>,
    #[serde(default)]
    node: Option<NodeOverrides>,
    #[serde(default)]
    healthcheck: Option<HealthcheckOverrides>,
}

pub fn load_vibestart_launcher_config(root_cwd: &Path) -> VibestartLauncherConfig {
    let path = root_cwd.join(".vibestart.json");
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return VibestartLauncherConfig::default(),
    };
    let parsed = match serde_json::from_str::<VibestartFile>(&raw) {
        Ok(value) => value,
        Err(_) => return VibestartLauncherConfig::default(),
    };

    VibestartLauncherConfig {
        launcher: parsed.launcher.unwrap_or_default(),
        python: parsed.python.unwrap_or_default(),
        node: parsed.node.unwrap_or_default(),
        healthcheck: parsed.healthcheck.unwrap_or_default(),
    }
}
