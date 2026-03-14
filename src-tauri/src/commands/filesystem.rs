use notify::Watcher;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

/// State to track active file watchers per project.
pub struct WatcherState {
    watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// Acquire the lock, recovering from poison if a thread panicked.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, notify::RecommendedWatcher>> {
        self.watchers.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Read the contents of an .env file.
#[tauri::command]
pub async fn read_env_file(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to an .env file.
#[tauri::command]
pub async fn write_env_file(path: String, content: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// List all .env* files in a project directory.
#[tauri::command]
pub async fn list_env_files(cwd: String) -> Result<Vec<String>, String> {
    if cwd.trim().is_empty() {
        return Err("Directory path cannot be empty".to_string());
    }
    let dir = Path::new(&cwd);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let mut files = Vec::new();
    let entries =
        fs::read_dir(dir).map_err(|e| format!("Failed to read directory {}: {}", cwd, e))?;

    for entry in entries.flatten() {
        // Skip directories (e.g., a directory named .env.backup/)
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name.starts_with(".env") {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }

    files.sort();
    Ok(files)
}

/// Start watching a project directory for .env file changes.
/// Emits a "file-changed" event when changes are detected.
#[tauri::command]
pub async fn watch_project(project_id: String, cwd: String, app: AppHandle) -> Result<(), String> {
    let dir = cwd.clone();

    let app_handle = app.clone();
    let pid = project_id.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            // Only care about modifications and creations to .env files
            let dominated_by_env = event.paths.iter().any(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(".env"))
                    .unwrap_or(false)
            });

            if dominated_by_env {
                if let Err(e) = app_handle.emit("file-changed", &pid) {
                    eprintln!("Warning: Failed to emit file-changed event: {}", e);
                }
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(Path::new(&dir), notify::RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // Store the watcher so it stays alive and can be stopped later
    let state = app.state::<WatcherState>();
    state.lock().insert(project_id, watcher);

    Ok(())
}

/// Stop watching a project directory.
#[tauri::command]
pub async fn unwatch_project(project_id: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    state.lock().remove(&project_id);
    Ok(())
}
