use crate::state::app_state::AppState;
use notify::Watcher;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditableProjectFile {
    pub relative_path: String,
    pub exists: bool,
}

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

fn validate_project_dir(cwd: &str) -> Result<PathBuf, String> {
    if cwd.trim().is_empty() {
        return Err("Directory path cannot be empty".to_string());
    }

    let dir = Path::new(cwd);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", cwd));
    }

    dir.canonicalize()
        .map_err(|e| format!("Failed to resolve project directory {}: {}", cwd, e))
}

fn validate_relative_env_file(relative_path: &str) -> Result<&str, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err("Relative file path cannot be empty".to_string());
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Only project-root .env files are editable".to_string());
    }

    if !trimmed.starts_with(".env") {
        return Err(format!("Unsupported editable file: {}", trimmed));
    }

    Ok(trimmed)
}

fn resolve_project_file(cwd: &str, relative_path: &str) -> Result<PathBuf, String> {
    let project_dir = validate_project_dir(cwd)?;
    let relative_path = validate_relative_env_file(relative_path)?;
    Ok(project_dir.join(relative_path))
}

fn default_editable_file_names() -> Vec<&'static str> {
    vec![
        ".env.schema",
        ".env",
        ".env.local",
        ".env.development",
        ".env.production",
        ".env.test",
    ]
}

/// Validate that a file path is safe to access:
/// 1. Canonicalize (resolves ../, symlinks)
/// 2. Must be inside a registered project directory
/// 3. Filename must start with .env
fn validate_env_file_path(path: &str, project_paths: &[PathBuf]) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    let target = Path::new(path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // Step 1: canonicalize resolves all ../, symlinks, and encoding tricks
    let canonical = target
        .canonicalize()
        .map_err(|_| "Path does not exist or is not accessible".to_string())?;

    // Step 2: must be inside a registered project directory
    let in_known_project = project_paths.iter().any(|proj| {
        proj.canonicalize()
            .map(|cp| canonical.starts_with(&cp))
            .unwrap_or(false)
    });
    if !in_known_project {
        return Err("Path is outside any registered project directory".to_string());
    }

    // Step 3: filename must start with .env
    let filename = canonical.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !filename.starts_with(".env") {
        return Err("File must be a .env file".to_string());
    }

    Ok(canonical)
}

/// Read the contents of an .env file.
/// Path must be inside a registered project and filename must start with .env.
#[tauri::command]
pub async fn read_env_file(
    path: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let project_paths = app_state.get_project_paths();
    let validated = validate_env_file_path(&path, &project_paths)?;
    fs::read_to_string(&validated)
        .map_err(|e| format!("Failed to read {}: {}", validated.display(), e))
}

/// Write content to an .env file.
/// Path must be inside a registered project and filename must start with .env.
#[tauri::command]
pub async fn write_env_file(
    path: String,
    content: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let project_paths = app_state.get_project_paths();
    let validated = validate_env_file_path(&path, &project_paths)?;
    fs::write(&validated, &content)
        .map_err(|e| format!("Failed to write {}: {}", validated.display(), e))
}

/// List all .env* files in a project directory.
#[tauri::command]
pub async fn list_env_files(cwd: String) -> Result<Vec<String>, String> {
    let dir = validate_project_dir(&cwd)?;

    let mut files = Vec::new();
    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Failed to read directory {}: {}", cwd, e))?;

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

/// List editable root-level project env files, including common defaults.
#[tauri::command]
pub async fn list_editable_project_files(cwd: String) -> Result<Vec<EditableProjectFile>, String> {
    let dir = validate_project_dir(&cwd)?;
    let mut files: HashMap<String, EditableProjectFile> = HashMap::new();

    for name in default_editable_file_names() {
        let path = dir.join(name);
        files.insert(
            name.to_string(),
            EditableProjectFile {
                relative_path: name.to_string(),
                exists: path.exists() && path.is_file(),
            },
        );
    }

    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Failed to read directory {}: {}", cwd, e))?;

    for entry in entries.flatten() {
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if name.starts_with(".env") {
            files.insert(
                name.clone(),
                EditableProjectFile {
                    relative_path: name,
                    exists: true,
                },
            );
        }
    }

    let mut result: Vec<EditableProjectFile> = files.into_values().collect();
    result.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(result)
}

/// Read a project-root .env file by relative path. Missing files return empty content.
#[tauri::command]
pub async fn read_project_file(cwd: String, relative_path: String) -> Result<String, String> {
    let file_path = resolve_project_file(&cwd, &relative_path)?;
    if !file_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))
}

/// Write a project-root .env file by relative path.
#[tauri::command]
pub async fn write_project_file(
    cwd: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let file_path = resolve_project_file(&cwd, &relative_path)?;
    fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))
}

/// Start watching a project directory for .env file changes.
/// Emits a "file-changed" event when changes are detected.
#[tauri::command]
pub async fn watch_project(project_id: String, cwd: String, app: AppHandle) -> Result<(), String> {
    let dir = cwd.clone();

    let app_handle = app.clone();
    let pid = project_id.clone();

    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
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
