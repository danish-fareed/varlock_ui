use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Represents a managed project in the Varlock UI.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub environments: Vec<String>,
    pub status: ProjectStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectStatus {
    Valid,
    Warning,
    Error,
    MigrationNeeded,
    Unknown,
}

/// Persisted application data: project list and preferences.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct PersistedData {
    projects: Vec<Project>,
    varlock_path: Option<String>,
}

/// Global application state managed by Tauri.
/// Holds the project list and handles persistence to disk.
pub struct AppState {
    inner: Mutex<PersistedData>,
}

impl AppState {
    pub fn new() -> Self {
        let data = Self::load_from_disk().unwrap_or_default();
        Self {
            inner: Mutex::new(data),
        }
    }

    /// Acquire the lock, recovering from poison if a thread panicked.
    fn lock(&self) -> std::sync::MutexGuard<'_, PersistedData> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Get the path to the persisted state file.
    fn state_file_path() -> PathBuf {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("varlock-ui");

        // Ensure directory exists
        if let Err(e) = fs::create_dir_all(&data_dir) {
            eprintln!(
                "Warning: Failed to create data directory {:?}: {}",
                data_dir, e
            );
        }
        data_dir.join("state.json")
    }

    /// Load persisted state from disk.
    fn load_from_disk() -> Option<PersistedData> {
        let path = Self::state_file_path();
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    /// Save current state to disk.
    fn persist(&self) {
        let data = self.lock();
        let path = Self::state_file_path();
        match serde_json::to_string_pretty(&*data) {
            Ok(json) => {
                if let Err(e) = fs::write(&path, json) {
                    eprintln!("Error: Failed to persist state to {:?}: {}", path, e);
                }
            }
            Err(e) => {
                eprintln!("Error: Failed to serialize state: {}", e);
            }
        }
    }

    /// Get all projects.
    pub fn get_projects(&self) -> Vec<Project> {
        self.lock().projects.clone()
    }

    /// Replace all persisted projects and save to disk.
    pub fn replace_projects(&self, projects: Vec<Project>) {
        let mut data = self.lock();
        data.projects = projects;
        drop(data);
        self.persist();
    }

    /// Check if a project with the given path already exists.
    pub fn has_project_with_path(&self, path: &str) -> bool {
        self.lock().projects.iter().any(|p| p.path == path)
    }

    /// Add a new project and persist.
    pub fn add_project(&self, project: Project) -> Project {
        let mut data = self.lock();
        data.projects.push(project.clone());
        drop(data);
        self.persist();
        project
    }

    /// Remove a project by ID and persist.
    pub fn remove_project(&self, id: &str) -> bool {
        let mut data = self.lock();
        let len_before = data.projects.len();
        data.projects.retain(|p| p.id != id);
        let removed = data.projects.len() < len_before;
        drop(data);
        if removed {
            self.persist();
        }
        removed
    }

    /// Update a project's status.
    pub fn update_project_status(&self, id: &str, status: ProjectStatus) {
        let mut data = self.lock();
        if let Some(project) = data.projects.iter_mut().find(|p| p.id == id) {
            project.status = status;
        }
        drop(data);
        self.persist();
    }
}
