use crate::discovery::detector::resolve_registration_root;
use crate::state::app_state::{AppState, Project, ProjectStatus};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
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

    register_project_dir(project_path, &state)
}

/// Clone a GitHub repository into a destination directory and register it.
#[tauri::command]
pub async fn project_clone_github(
    url: String,
    destination_parent: String,
    folder_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let trimmed_url = url.trim();
    if trimmed_url.is_empty() {
        return Err("Repository URL cannot be empty".to_string());
    }
    if !is_github_url(trimmed_url) {
        return Err("Only GitHub repository URLs are supported".to_string());
    }

    let parent_dir = PathBuf::from(destination_parent.trim());
    if !parent_dir.exists() {
        return Err(format!(
            "Destination directory does not exist: {}",
            parent_dir.to_string_lossy()
        ));
    }
    if !parent_dir.is_dir() {
        return Err(format!(
            "Destination path is not a directory: {}",
            parent_dir.to_string_lossy()
        ));
    }

    let target_folder = if let Some(raw_name) = folder_name {
        let name = raw_name.trim();
        if name.is_empty() {
            infer_repo_name(trimmed_url).ok_or_else(|| {
                "Unable to infer repository folder name from URL. Provide a folder name."
                    .to_string()
            })?
        } else {
            validate_folder_name(name)?
        }
    } else {
        infer_repo_name(trimmed_url).ok_or_else(|| {
            "Unable to infer repository folder name from URL. Provide a folder name.".to_string()
        })?
    };

    let target_dir = parent_dir.join(target_folder);
    if target_dir.exists() {
        return Err(format!(
            "Destination already exists: {}",
            target_dir.to_string_lossy()
        ));
    }

    let url_for_cmd = trimmed_url.to_string();
    let target_for_cmd = target_dir.clone();
    let clone_result = tokio::task::spawn_blocking(move || {
        Command::new("git")
            .arg("clone")
            .arg(url_for_cmd)
            .arg(&target_for_cmd)
            .output()
    })
    .await
    .map_err(|e| format!("Clone task failed: {}", e))?;

    match clone_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let details = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    "git clone failed with an unknown error".to_string()
                };
                return Err(format!("Failed to clone repository: {}", details));
            }
        }
        Err(e) => {
            return Err(format!(
                "Failed to run git clone. Ensure Git is installed and available in PATH: {}",
                e
            ));
        }
    }

    register_project_dir(&target_dir, &state)
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
    let result = tokio::task::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
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

fn register_project_dir(project_path: &Path, state: &AppState) -> Result<Project, String> {
    let resolved_root = resolve_registration_root(project_path)
        .map_err(|e| format!("Failed to resolve registration root: {}", e))?;
    let registration_path = resolved_root.root.to_string_lossy().to_string();

    if state.has_project_with_path(&registration_path) {
        return Err(format!("Project already added: {}", registration_path));
    }

    let name = resolved_root
        .root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Project")
        .to_string();

    let environments = detect_environments(&resolved_root.root);

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: registration_path,
        environments,
        status: derive_project_status(&resolved_root.root),
    };

    Ok(state.add_project(project))
}

fn is_github_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://github.com/")
        || lower.starts_with("http://github.com/")
        || lower.starts_with("git@github.com:")
        || lower.starts_with("ssh://git@github.com/")
}

fn infer_repo_name(url: &str) -> Option<String> {
    let normalized = url.trim().trim_end_matches('/');
    let tail = if let Some(idx) = normalized.rfind(':') {
        let ssh_like = normalized.starts_with("git@github.com:");
        if ssh_like {
            &normalized[idx + 1..]
        } else {
            normalized.rsplit('/').next()?
        }
    } else {
        normalized.rsplit('/').next()?
    };

    let last_segment = tail.rsplit('/').next()?.trim_end_matches(".git").trim();
    if last_segment.is_empty() {
        None
    } else {
        Some(last_segment.to_string())
    }
}

fn validate_folder_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("Folder name cannot be '.' or '..'".to_string());
    }
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    if trimmed.chars().any(|c| invalid_chars.contains(&c)) {
        return Err("Folder name contains invalid path characters".to_string());
    }
    Ok(trimmed.to_string())
}
