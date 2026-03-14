use crate::state::process_state::ProcessState;
use crate::varlock::cli;
use crate::varlock::types::ProcessEvent;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Spawn `varlock run -- <command>` as a subprocess and stream
/// stdout/stderr to the frontend in real time via a Tauri Channel.
///
/// Returns the process ID so the frontend can kill it later.
#[tauri::command]
pub async fn varlock_run(
    cwd: String,
    env: Option<String>,
    command: String,
    on_event: Channel<ProcessEvent>,
    process_state: State<'_, ProcessState>,
) -> Result<String, String> {
    // Validate inputs
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("Command cannot be empty".to_string());
    }
    if cwd.trim().is_empty() {
        return Err("Working directory cannot be empty".to_string());
    }

    let (binary, args, env_override) =
        cli::build_run_command(&cwd, env.as_deref(), &command).await?;

    let mut cmd = Command::new(&binary);
    cmd.args(&args);
    cmd.current_dir(&cwd);

    // Set environment override
    if let Some((key, value)) = &env_override {
        cmd.env(key, value);
    }

    // Pipe stdout and stderr for real-time streaming
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // On Windows, prevent the child process from creating a visible console window
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let process_id = uuid::Uuid::new_v4().to_string();

    // Take ownership of stdout/stderr before storing the child
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    // Store the child process handle so we can kill it later
    process_state.insert(process_id.clone(), child);

    let pid = process_id.clone();
    let on_event_clone = on_event.clone();
    let processes = process_state.shared();

    // Spawn a background task to read stdout/stderr and stream to the frontend.
    // We track both streams independently so closing one doesn't lose the other.
    tokio::spawn(async move {
        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();
        let mut stdout_done = false;
        let mut stderr_done = false;

        while !stdout_done || !stderr_done {
            tokio::select! {
                // Read stdout line by line (only if not already closed)
                line = stdout_reader.next_line(), if !stdout_done => {
                    match line {
                        Ok(Some(data)) => {
                            let _ = on_event.send(ProcessEvent::Stdout {
                                data: format!("{}\r\n", data),
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
                            let _ = on_event.send(ProcessEvent::Stderr {
                                data: format!("{}\r\n", data),
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
