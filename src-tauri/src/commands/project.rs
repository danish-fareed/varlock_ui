use crate::state::app_state::{AppState, Project, ProjectStatus};
use std::fs;
use std::path::Path;
use tauri::State;

fn derive_project_status(project_path: &Path) -> ProjectStatus {
    let has_schema = project_path.join(".env.schema").exists();
    if has_schema {
        return ProjectStatus::Unknown;
    }

    let has_any_env_files = fs::read_dir(project_path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .filter(|entry| entry.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .any(|name| name == ".env" || name.starts_with(".env."));

    if has_any_env_files {
        ProjectStatus::MigrationNeeded
    } else {
        ProjectStatus::Error
    }
}

/// List all managed projects.
#[tauri::command]
pub async fn project_list(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let refreshed_projects: Vec<Project> = state
        .get_projects()
        .into_iter()
        .map(|mut project| {
            let project_path = Path::new(&project.path);
            if project_path.exists() && project_path.is_dir() {
                project.environments = detect_environments(project_path);
                project.status = derive_project_status(project_path);
            } else {
                project.status = ProjectStatus::Error;
            }
            project
        })
        .collect();

    state.replace_projects(refreshed_projects.clone());
    Ok(refreshed_projects)
}

/// Add a new project by directory path.
/// Detects available .env.* files and creates the project entry.
#[tauri::command]
pub async fn project_add(path: String, state: State<'_, AppState>) -> Result<Project, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("Project path cannot be empty".to_string());
    }

    let project_path = Path::new(&path);

    if !project_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !project_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Check for duplicate project
    if state.has_project_with_path(&path) {
        return Err(format!("Project already added: {}", path));
    }

    // Derive project name from directory name
    let name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Project")
        .to_string();

    // Detect available environment files
    let environments = detect_environments(project_path);

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: path.clone(),
        environments,
        status: derive_project_status(project_path),
    };

    Ok(state.add_project(project))
}

/// Remove a project by ID.
#[tauri::command]
pub async fn project_remove(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if state.remove_project(&id) {
        Ok(())
    } else {
        Err(format!("Project {} not found", id))
    }
}

/// Open a native directory picker dialog.
/// Returns the selected path or None if cancelled.
#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Use blocking_pick_folder wrapped in spawn_blocking to avoid
    // blocking the Tokio async runtime while the native dialog is open.
    let result = tokio::task::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?;

    Ok(result.map(|p| p.to_string()))
}

/// Detect .env.* files in a directory and return environment names.
fn detect_environments(dir: &Path) -> Vec<String> {
    let mut envs = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            // Only consider files, not directories
            let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
            if !is_file {
                continue;
            }

            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();

            // Match .env.{environment} pattern
            if let Some(env_name) = name.strip_prefix(".env.") {
                // Skip .env.schema, .env.example, .env.local
                let skip = ["schema", "example", "local", "sample", "template"];
                if !skip.contains(&env_name) && !env_name.contains('.') {
                    envs.push(env_name.to_string());
                }
            }
        }
    }

    // Always include "development" as a fallback if no envs found
    if envs.is_empty() {
        envs.push("development".to_string());
    }

    envs.sort();
    envs
}
