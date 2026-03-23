use crate::launcher;
use crate::launcher::types::{ExecutionPolicy, OrchestratorError};
use crate::state::process_state::ProcessState;
use crate::state::vault_state::VaultState;
use crate::varlock::cli;
use crate::varlock::types::ProcessEvent;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const VAULT_URI_PREFIX: &str = "varlock://vault/";
const REDACTED_TOKEN: &str = "[REDACTED]";

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LaunchError {
    VaultLocked,
    EnvValidationFailed { issues: Vec<String> },
    CommandNotFound { command: String },
    VaultSecretMissing { key: String, env: String },
    VaultResolutionFailed { key: String, reason: String },
    SpawnFailed { reason: String },
    InvalidInput { reason: String },
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    pub cwd_override: Option<String>,
    pub interpreter_override: Option<String>,
    pub sync_policy: Option<ExecutionPolicy>,
    pub command_type: Option<LaunchCommandType>,
    pub orchestrator_stop: Option<StopStrategy>,
    pub env_scope_path: Option<String>,
    pub requires_venv: Option<bool>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchCommandType {
    LocalProcess,
    OneShot,
    CloudJob,
    Orchestrator,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopStrategy {
    pub command: String,
    pub args: Vec<String>,
}

fn normalize_scoped_cwd(root: &str, scope: &str) -> Result<String, LaunchError> {
    if scope.trim().is_empty() || scope == "." {
        return Ok(root.to_string());
    }
    let joined = Path::new(root).join(scope);
    let canonical_root = Path::new(root)
        .canonicalize()
        .map_err(|e| LaunchError::InvalidInput {
            reason: format!("invalid root cwd: {}", e),
        })?;
    let canonical_joined = joined
        .canonicalize()
        .map_err(|e| LaunchError::InvalidInput {
            reason: format!("invalid cwd override: {}", e),
        })?;
    if !canonical_joined.starts_with(&canonical_root) {
        return Err(LaunchError::InvalidInput {
            reason: "cwd_override escapes project root".to_string(),
        });
    }
    Ok(normalize_output_path(&canonical_joined))
}

fn normalize_output_path(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        let mut raw = path.to_string_lossy().to_string();
        if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
            raw = format!(r"\\{}", stripped);
        } else if let Some(stripped) = raw.strip_prefix(r"\\?\") {
            raw = stripped.to_string();
        }
        raw
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.to_string_lossy().to_string()
    }
}

fn apply_interpreter_override(command: &str, interpreter_override: &Option<String>) -> String {
    let Some(interpreter) = interpreter_override else {
        return command.to_string();
    };

    let mut parts = match shell_words::split(command) {
        Ok(v) if !v.is_empty() => v,
        _ => return command.to_string(),
    };

    let first = parts[0].to_lowercase();
    if matches!(first.as_str(), "python" | "python3" | "py") {
        parts[0] = interpreter.clone();
        parts
            .iter()
            .map(|p| {
                if p.contains(' ') {
                    format!("\"{}\"", p)
                } else {
                    p.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    } else if matches!(first.as_str(), "pytest" | "uvicorn" | "gunicorn") {
        let interpreter_path = Path::new(interpreter);
        let tool_path = if cfg!(windows) {
            interpreter_path
                .parent()
                .map(|parent| parent.join(format!("{}.exe", first)))
        } else {
            interpreter_path.parent().map(|parent| parent.join(&first))
        };

        if let Some(tool) = tool_path.filter(|p| p.is_file()) {
            parts[0] = tool.to_string_lossy().to_string();
        } else {
            let mut patched = Vec::with_capacity(parts.len() + 2);
            patched.push(interpreter.clone());
            patched.push("-m".to_string());
            patched.push(first);
            patched.extend(parts.into_iter().skip(1));
            parts = patched;
        }

        parts
            .iter()
            .map(|p| {
                if p.contains(' ') {
                    format!("\"{}\"", p)
                } else {
                    p.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        command.to_string()
    }
}

fn map_orchestrator_error(error: OrchestratorError) -> LaunchError {
    match error {
        OrchestratorError::StageFailed {
            stage,
            reason,
            command,
            cwd,
            stderr,
        } => {
            let mut parts = vec![format!("stage={}", stage), reason];
            if let Some(cmd) = command {
                parts.push(format!("command={}", cmd));
            }
            if let Some(path) = cwd {
                parts.push(format!("cwd={}", path));
            }
            if let Some(err) = stderr {
                parts.push(format!("stderr={}", err));
            }
            LaunchError::SpawnFailed {
                reason: parts.join(" | "),
            }
        }
        OrchestratorError::InvalidConfig(reason) => LaunchError::InvalidInput { reason },
        OrchestratorError::Io(err) => LaunchError::SpawnFailed {
            reason: err.to_string(),
        },
    }
}

fn resolve_vault_uris(
    env_map: HashMap<String, String>,
    cwd: &str,
    env_name: &str,
    vault: &VaultState,
) -> Result<HashMap<String, String>, LaunchError> {
    let needs_vault = env_map.values().any(|v| v.starts_with(VAULT_URI_PREFIX));
    if !needs_vault {
        return Ok(env_map);
    }

    let dek = vault.get_dek().ok_or(LaunchError::VaultLocked)?;

    let mut resolved = HashMap::new();
    for (key, value) in env_map {
        if let Some(secret_key) = value.strip_prefix(VAULT_URI_PREFIX) {
            match vault.db.get_variable(&dek, cwd, env_name, secret_key) {
                Ok(secret) => {
                    resolved.insert(key, secret.value);
                }
                Err(crate::vault::vault_db::VaultDbError::NotFound(_)) => {
                    return Err(LaunchError::VaultSecretMissing {
                        key: secret_key.to_string(),
                        env: env_name.to_string(),
                    });
                }
                Err(e) => {
                    return Err(LaunchError::VaultResolutionFailed {
                        key: secret_key.to_string(),
                        reason: e.to_string(),
                    });
                }
            }
        } else {
            resolved.insert(key, value);
        }
    }

    Ok(resolved)
}

fn sanitize_chunk(raw: &str, redaction_set: &[String]) -> String {
    let mut out = raw.to_string();
    for needle in redaction_set {
        if needle.len() < 4 {
            continue;
        }
        if out.contains(needle) {
            out = out.replace(needle, REDACTED_TOKEN);
        }
    }
    out
}

fn launch_log_status_from_lines(lines: &[String]) -> Option<String> {
    let mut saw_create = false;
    let mut saw_reuse = false;
    for line in lines {
        let l = line.to_lowercase();
        if l.contains("creating .venv") || l.contains("python -m venv") {
            saw_create = true;
        }
        if l.contains("reusing") {
            saw_reuse = true;
        }
    }
    if saw_create {
        Some("created".to_string())
    } else if saw_reuse {
        Some("reused".to_string())
    } else {
        None
    }
}

/// Spawn `varlock run -- <command>` as a subprocess and stream
/// stdout/stderr to the frontend in real time via a Tauri Channel.
///
/// Returns the process ID so the frontend can kill it later.
#[tauri::command]
pub async fn varlock_run(
    cwd: String,
    env: Option<String>,
    command: String,
    launch_options: Option<LaunchOptions>,
    on_event: Channel<ProcessEvent>,
    process_state: State<'_, ProcessState>,
    vault: State<'_, VaultState>,
) -> Result<String, LaunchError> {
    // Validate inputs
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err(LaunchError::InvalidInput {
            reason: "Command cannot be empty".to_string(),
        });
    }
    if cwd.trim().is_empty() {
        return Err(LaunchError::InvalidInput {
            reason: "Working directory cannot be empty".to_string(),
        });
    }

    let mut launch_options = launch_options.unwrap_or_default();

    let scoped_cwd = {
        if let Some(scope_path) = &launch_options.env_scope_path {
            normalize_scoped_cwd(&cwd, scope_path)?
        } else if let Some(cwd_override) = &launch_options.cwd_override {
            normalize_scoped_cwd(&cwd, cwd_override)?
        } else {
            cwd.clone()
        }
    };
    let scoped_cwd = normalize_output_path(Path::new(&scoped_cwd));

    let launch_request = launcher::types::LaunchRequest {
        root_cwd: cwd.clone(),
        scoped_cwd: scoped_cwd.clone(),
        raw_command: command.clone(),
        source: launch_options.source.clone(),
        interpreter_override: launch_options.interpreter_override.clone(),
        requires_venv: launch_options.requires_venv.unwrap_or(false),
        policy_override: launch_options.sync_policy.clone(),
    };

    let orchestrated =
        tokio::task::spawn_blocking(move || launcher::prepare_launch(launch_request))
            .await
            .map_err(|e| LaunchError::SpawnFailed {
                reason: format!("launcher background task failed: {}", e),
            })?
            .map_err(map_orchestrator_error)?;

    for event in &orchestrated.stage_events {
        let _ = on_event.send(ProcessEvent::LaunchTimeline {
            stage: event.stage.as_str().to_string(),
            status: event.status.clone(),
            detail: event.detail.clone(),
            runtime: event.runtime.as_ref().map(|r| r.as_str().to_string()),
        });
    }

    if let Ok(plan_json) = serde_json::to_string_pretty(&orchestrated.plan) {
        let _ = on_event.send(ProcessEvent::RunDetails { plan_json });
    }

    if !orchestrated.launch_logs.is_empty() {
        let env_status = launch_log_status_from_lines(&orchestrated.launch_logs);
        let _ = on_event.send(ProcessEvent::LaunchLog {
            env_status,
            interpreter_path: orchestrated.interpreter_override.clone(),
            lines: orchestrated.launch_logs.clone(),
        });
    }

    launch_options.interpreter_override = orchestrated.interpreter_override.clone();

    let effective_command =
        apply_interpreter_override(&command, &launch_options.interpreter_override);

    let load_result = cli::load(&scoped_cwd, env.as_deref())
        .await
        .map_err(|msg| LaunchError::EnvValidationFailed { issues: vec![msg] })?;
    if !load_result.valid {
        let issues = load_result
            .variables
            .iter()
            .filter(|v| !v.valid)
            .flat_map(|v| {
                if v.errors.is_empty() {
                    vec![format!("{}: unresolved or invalid", v.key)]
                } else {
                    v.errors
                        .iter()
                        .map(|e| format!("{}: {}", v.key, e))
                        .collect::<Vec<_>>()
                }
            })
            .collect::<Vec<_>>();
        return Err(LaunchError::EnvValidationFailed { issues });
    }

    let mut env_map = HashMap::new();
    for var in &load_result.variables {
        if let Some(value) = &var.value {
            env_map.insert(var.key.clone(), value.clone());
        }
    }

    let env_name = load_result.env.clone();
    let resolved_env = resolve_vault_uris(env_map, &scoped_cwd, &env_name, &vault)?;

    let mut redaction_set = Vec::new();
    for var in &load_result.variables {
        if var.sensitive {
            if let Some(v) = &var.value {
                if v.len() >= 4 {
                    redaction_set.push(v.clone());
                }
            }
        }
    }
    for value in resolved_env.values() {
        if value.len() >= 8 {
            redaction_set.push(value.clone());
        }
    }
    redaction_set.sort_by(|a, b| b.len().cmp(&a.len()));
    redaction_set.dedup();

    let (binary, args) = if cfg!(target_os = "windows") {
        (
            "cmd".to_string(),
            vec!["/C".to_string(), effective_command.clone()],
        )
    } else {
        (
            "sh".to_string(),
            vec!["-c".to_string(), effective_command.clone()],
        )
    };

    let mut cmd = Command::new(&binary);
    cmd.args(&args);
    cmd.current_dir(&scoped_cwd);
    cmd.envs(&resolved_env);

    if let Some(env_name) = env.as_deref() {
        cmd.env("APP_ENV", env_name);
    }

    // Pipe stdout and stderr for real-time streaming
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // On Windows, prevent the child process from creating a visible console window
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| LaunchError::SpawnFailed {
        reason: format!("Failed to spawn process: {}", e),
    })?;

    let process_id = uuid::Uuid::new_v4().to_string();

    // Take ownership of stdout/stderr before storing the child
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| LaunchError::SpawnFailed {
            reason: "Failed to capture stdout".to_string(),
        })?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| LaunchError::SpawnFailed {
            reason: "Failed to capture stderr".to_string(),
        })?;

    // Store the child process handle so we can kill it later
    process_state.insert(process_id.clone(), child);

    let pid = process_id.clone();
    let on_event_clone = on_event.clone();
    let processes = process_state.shared();
    let redaction_set_for_task = redaction_set.clone();

    // Spawn a background task to read stdout/stderr and stream to the frontend.
    // We track both streams independently so closing one doesn't lose the other.
    tokio::spawn(async move {
        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();
        let mut stdout_done = false;
        let mut stderr_done = false;
        let mut log_buffer: Vec<String> = Vec::new();

        while !stdout_done || !stderr_done {
            tokio::select! {
                // Read stdout line by line (only if not already closed)
                line = stdout_reader.next_line(), if !stdout_done => {
                    match line {
                        Ok(Some(data)) => {
                            let safe = sanitize_chunk(&data, &redaction_set_for_task);
                            log_buffer.push(format!("{}\n", safe));
                            let _ = on_event.send(ProcessEvent::Stdout {
                                data: format!("{}\r\n", safe),
                            });
                        }
                        Ok(None) => {
                            stdout_done = true;
                        }
                        Err(e) => {
                            let _ = on_event.send(ProcessEvent::Error {
                                message: format!("stdout read error: {}", e),
                            });
                            stdout_done = true;
                        }
                    }
                }
                // Read stderr line by line (only if not already closed)
                line = stderr_reader.next_line(), if !stderr_done => {
                    match line {
                        Ok(Some(data)) => {
                            let safe = sanitize_chunk(&data, &redaction_set_for_task);
                            log_buffer.push(format!("{}\n", safe));
                            let _ = on_event.send(ProcessEvent::Stderr {
                                data: format!("{}\r\n", safe),
                            });
                        }
                        Ok(None) => {
                            stderr_done = true;
                        }
                        Err(e) => {
                            let _ = on_event.send(ProcessEvent::Error {
                                message: format!("stderr read error: {}", e),
                            });
                            stderr_done = true;
                        }
                    }
                }
            }
        }

        // Explicit drop to end lifetime of buffered output and redaction material
        drop(log_buffer);
        drop(redaction_set_for_task);

        // Wait for the process to exit and get the exit code
        let child = {
            let mut processes = processes.lock().unwrap_or_else(|e| e.into_inner());
            processes.remove(&pid)
        };

        if let Some(mut child) = child {
            match child.wait().await {
                Ok(status) => {
                    let _ = on_event_clone.send(ProcessEvent::Exit {
                        code: status.code(),
                    });
                }
                Err(e) => {
                    let _ = on_event_clone.send(ProcessEvent::Error {
                        message: format!("Process wait error: {}", e),
                    });
                }
            }
        }
    });

    Ok(process_id)
}

/// Kill a running process by its ID.
#[tauri::command]
pub async fn process_kill(
    process_id: String,
    process_state: State<'_, ProcessState>,
) -> Result<(), String> {
    process_state.kill(&process_id)
}

#[tauri::command]
pub async fn stop_command(
    session_id: String,
    process_state: State<'_, ProcessState>,
) -> Result<(), String> {
    process_state.kill(&session_id)
}

/// Spawn a raw command directly (no varlock wrapping, no shell interpreter).
/// Uses shell-words to parse the command string into argv — no injection surface.
/// Used for projects without .env.schema or when varlock isn't needed.
#[tauri::command]
pub async fn direct_run(
    cwd: String,
    command: String,
    on_event: Channel<ProcessEvent>,
    process_state: State<'_, ProcessState>,
) -> Result<String, String> {
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("Command cannot be empty".to_string());
    }
    if cwd.trim().is_empty() {
        return Err("Working directory cannot be empty".to_string());
    }

    // Parse command string into argv without invoking a shell interpreter
    let argv =
        shell_words::split(&command).map_err(|e| format!("Invalid command syntax: {}", e))?;
    if argv.is_empty() {
        return Err("Empty command after parsing".to_string());
    }

    let mut cmd = Command::new(&argv[0]);
    cmd.args(&argv[1..]);
    cmd.current_dir(&cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let process_id = uuid::Uuid::new_v4().to_string();

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    process_state.insert(process_id.clone(), child);

    let pid = process_id.clone();
    let on_event_clone = on_event.clone();
    let processes = process_state.shared();

    tokio::spawn(async move {
        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();
        let mut stdout_done = false;
        let mut stderr_done = false;

        while !stdout_done || !stderr_done {
            tokio::select! {
                line = stdout_reader.next_line(), if !stdout_done => {
                    match line {
                        Ok(Some(data)) => {
                            let _ = on_event.send(ProcessEvent::Stdout {
                                data: format!("{}\r\n", data),
                            });
                        }
                        Ok(None) => { stdout_done = true; }
                        Err(e) => {
                            let _ = on_event.send(ProcessEvent::Error {
                                message: format!("stdout read error: {}", e),
                            });
                            stdout_done = true;
                        }
                    }
                }
                line = stderr_reader.next_line(), if !stderr_done => {
                    match line {
                        Ok(Some(data)) => {
                            let _ = on_event.send(ProcessEvent::Stderr {
                                data: format!("{}\r\n", data),
                            });
                        }
                        Ok(None) => { stderr_done = true; }
                        Err(e) => {
                            let _ = on_event.send(ProcessEvent::Error {
                                message: format!("stderr read error: {}", e),
                            });
                            stderr_done = true;
                        }
                    }
                }
            }
        }

        let child = {
            let mut processes = processes.lock().unwrap_or_else(|e| e.into_inner());
            processes.remove(&pid)
        };

        if let Some(mut child) = child {
            match child.wait().await {
                Ok(status) => {
                    let _ = on_event_clone.send(ProcessEvent::Exit {
                        code: status.code(),
                    });
                }
                Err(e) => {
                    let _ = on_event_clone.send(ProcessEvent::Error {
                        message: format!("Process wait error: {}", e),
                    });
                }
            }
        }
    });

    Ok(process_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "varlock_process_test_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn python_head_is_replaced_with_interpreter_override() {
        let command = apply_interpreter_override(
            "python app.py --port 8080",
            &Some("/tmp/.venv/bin/python".to_string()),
        );
        assert_eq!(command, "/tmp/.venv/bin/python app.py --port 8080");
    }

    #[test]
    fn pytest_falls_back_to_python_module_when_binary_missing() {
        let command =
            apply_interpreter_override("pytest -q", &Some("/tmp/.venv/bin/python".to_string()));
        assert_eq!(command, "/tmp/.venv/bin/python -m pytest -q");
    }

    #[test]
    fn pytest_uses_venv_binary_when_present() {
        let dir = mk_temp_dir("pytest_bin");
        let venv_bin_dir = if cfg!(windows) {
            dir.join(".venv").join("Scripts")
        } else {
            dir.join(".venv").join("bin")
        };
        std::fs::create_dir_all(&venv_bin_dir).expect("create venv bin");
        let interpreter = if cfg!(windows) {
            venv_bin_dir.join("python.exe")
        } else {
            venv_bin_dir.join("python")
        };
        let pytest = if cfg!(windows) {
            venv_bin_dir.join("pytest.exe")
        } else {
            venv_bin_dir.join("pytest")
        };
        std::fs::write(&interpreter, "").expect("write interpreter");
        std::fs::write(&pytest, "").expect("write pytest");

        let command = apply_interpreter_override(
            "pytest tests",
            &Some(interpreter.to_string_lossy().to_string()),
        );
        assert!(command.starts_with(&pytest.to_string_lossy().to_string()));
    }

    #[test]
    fn maps_orchestrator_stage_failure_to_spawn_failed() {
        let err = OrchestratorError::StageFailed {
            stage: "sync".to_string(),
            reason: "dependency sync failed".to_string(),
            command: Some("npm install".to_string()),
            cwd: Some("/tmp/app".to_string()),
            stderr: Some("network failure".to_string()),
        };

        match map_orchestrator_error(err) {
            LaunchError::SpawnFailed { reason } => {
                assert!(reason.contains("stage=sync"));
                assert!(reason.contains("dependency sync failed"));
                assert!(reason.contains("command=npm install"));
            }
            _ => panic!("expected spawn failed mapping"),
        }
    }

    #[test]
    fn launch_log_status_detects_created_and_reused() {
        assert_eq!(
            launch_log_status_from_lines(&[
                "Reusing virtual environment at .venv".to_string(),
                "Dependencies up to date".to_string(),
            ]),
            Some("reused".to_string())
        );
        assert_eq!(
            launch_log_status_from_lines(&[
                "Creating .venv".to_string(),
                "> python -m venv .venv".to_string(),
            ]),
            Some("created".to_string())
        );
    }
}
