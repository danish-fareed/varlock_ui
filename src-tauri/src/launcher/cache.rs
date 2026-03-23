use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLaunchCache {
    pub fingerprint: Option<String>,
    pub last_prepare_ok: bool,
    pub last_sync_ok: bool,
    pub selected_manager: Option<String>,
    pub resolved_binary_path: Option<String>,
    pub last_success_unix_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchCache {
    pub runtimes: HashMap<String, RuntimeLaunchCache>,
}

fn cache_dir(root_cwd: &Path) -> PathBuf {
    root_cwd.join(".vibestart").join("cache")
}

fn cache_path(root_cwd: &Path) -> PathBuf {
    cache_dir(root_cwd).join("launch-cache.json")
}

pub fn load_launch_cache(root_cwd: &Path) -> LaunchCache {
    let path = cache_path(root_cwd);
    let content = match fs::read_to_string(path) {
        Ok(v) => v,
        Err(_) => return LaunchCache::default(),
    };
    serde_json::from_str::<LaunchCache>(&content).unwrap_or_default()
}

pub fn save_launch_cache(root_cwd: &Path, cache: &LaunchCache) -> Result<(), std::io::Error> {
    let dir = cache_dir(root_cwd);
    fs::create_dir_all(dir)?;
    let path = cache_path(root_cwd);
    let payload = serde_json::to_string_pretty(cache).unwrap_or_else(|_| "{}".to_string());
    fs::write(path, payload)
}
