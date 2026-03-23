use crate::discovery::python::{
    get_preferred_python_interpreter, inspect_python_env_state, list_python_interpreters,
    rebuild_default_python_env_with_preferred, resolve_and_warmup_python_env_with_preferred,
    set_preferred_python_interpreter, PythonEnvState, PythonEnvWarmupLog,
    PythonInterpreterCandidate,
};
use std::path::PathBuf;

#[tauri::command]
pub async fn get_python_env_state(
    cwd: String,
    root_cwd: Option<String>,
) -> Result<PythonEnvState, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&cwd);
        let root = PathBuf::from(root_cwd.unwrap_or_else(|| cwd.clone()));
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", cwd));
        }
        if !root.exists() || !root.is_dir() {
            return Err("Project root does not exist".to_string());
        }
        let mut state = inspect_python_env_state(&path);
        state.available_interpreters = list_python_interpreters(&path);
        state.preferred_base_interpreter_path = get_preferred_python_interpreter(&root, &path);
        Ok(state)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_python_interpreters_cmd(
    cwd: String,
) -> Result<Vec<PythonInterpreterCandidate>, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&cwd);
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", cwd));
        }
        Ok(list_python_interpreters(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_preferred_python_interpreter_cmd(
    root_cwd: String,
    scoped_cwd: String,
    interpreter_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&root_cwd);
        let scoped = PathBuf::from(&scoped_cwd);
        if !root.exists() || !root.is_dir() {
            return Err(format!("Directory does not exist: {}", root_cwd));
        }
        if !scoped.exists() || !scoped.is_dir() {
            return Err(format!("Directory does not exist: {}", scoped_cwd));
        }
        let version = list_python_interpreters(&scoped)
            .into_iter()
            .find(|c| c.executable_path == interpreter_path)
            .and_then(|c| c.version);
        set_preferred_python_interpreter(&root, &scoped, interpreter_path, version)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn warmup_python_env(
    cwd: String,
    root_cwd: Option<String>,
) -> Result<PythonEnvWarmupLog, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&cwd);
        let root = PathBuf::from(root_cwd.unwrap_or_else(|| cwd.clone()));
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", cwd));
        }
        let preferred = get_preferred_python_interpreter(&root, &path);
        Ok(resolve_and_warmup_python_env_with_preferred(
            &path, preferred,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rebuild_python_env(
    cwd: String,
    root_cwd: Option<String>,
) -> Result<PythonEnvWarmupLog, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&cwd);
        let root = PathBuf::from(root_cwd.unwrap_or_else(|| cwd.clone()));
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", cwd));
        }
        let preferred = get_preferred_python_interpreter(&root, &path);
        Ok(rebuild_default_python_env_with_preferred(&path, preferred))
    })
    .await
    .map_err(|e| e.to_string())?
}
