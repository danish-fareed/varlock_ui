use std::path::Path;
use std::time::Duration;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use super::detect::find_varlock_binary;
use super::types::{VarlockLoadFullResult, VarlockLoadResult, VarlockScanResult, VarlockStatus};

/// Default timeout for CLI operations (30 seconds).
const CLI_TIMEOUT: Duration = Duration::from_secs(30);

/// Timeout for npm install (5 minutes).
const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

/// Timeout for interactive init/setup flows (5 minutes).
const INIT_TIMEOUT: Duration = Duration::from_secs(300);

/// Configure a Command with Windows-specific settings to suppress console windows.
fn configure_no_window(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let _ = cmd; // suppress unused variable warning on non-Windows
}

/// Execute a command with a timeout, returning a descriptive error on timeout.
async fn output_with_timeout(
    cmd: &mut Command,
    timeout: Duration,
    description: &str,
) -> Result<std::process::Output, String> {
    match tokio::time::timeout(timeout, cmd.output()).await {
        Ok(result) => result.map_err(|e| format!("Failed to execute {}: {}", description, e)),
        Err(_) => Err(format!(
            "{} timed out after {} seconds",
            description,
            timeout.as_secs()
        )),
    }
}

/// Truncate a string to at most `max_len` characters, appending "..." if truncated.
fn truncate_output(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Check if varlock is installed and return its version.
pub async fn check_installed() -> VarlockStatus {
    match find_varlock_binary(None).await {
        Some(binary_path) => {
            let version = get_version(&binary_path).await;
            VarlockStatus {
                installed: true,
                version,
                path: Some(binary_path.to_string_lossy().to_string()),
            }
        }
        None => VarlockStatus {
            installed: false,
            version: None,
            path: None,
        },
    }
}

/// Get the varlock version string.
async fn get_version(binary_path: &Path) -> Option<String> {
    let mut cmd = Command::new(binary_path);
    cmd.arg("--version");
    configure_no_window(&mut cmd);

    let output = output_with_timeout(&mut cmd, CLI_TIMEOUT, "varlock --version")
        .await
        .ok()?;

    if output.status.success() {
        Some(
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string(),
        )
    } else {
        None
    }
}

/// Install varlock globally via npm.
pub async fn install() -> Result<String, String> {
    let npm_cmd = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    let mut cmd = Command::new(npm_cmd);
    cmd.args(["install", "-g", "varlock"]);
    configure_no_window(&mut cmd);

    let output = output_with_timeout(&mut cmd, INSTALL_TIMEOUT, "npm install -g varlock").await?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Run `varlock load --format=json-full` and normalize the output for the UI.
pub async fn load(cwd: &str, env: Option<&str>) -> Result<VarlockLoadResult, String> {
    let binary = find_varlock_binary(None)
        .await
        .ok_or_else(|| "Varlock is not installed. Please install it first.".to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.args(["load", "--format=json-full", "--path"]);
    cmd.arg(cwd);
    configure_no_window(&mut cmd);

    // Set environment override if specified
    if let Some(env_name) = env {
        cmd.arg("--env");
        cmd.arg(env_name);
    }

    let output = output_with_timeout(&mut cmd, CLI_TIMEOUT, "varlock load").await?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let trimmed_stdout = stdout.trim();
    let combined_output = if stderr.trim().is_empty() {
        trimmed_stdout.to_string()
    } else if trimmed_stdout.is_empty() {
        stderr.trim().to_string()
    } else {
        format!("{}\n{}", stderr.trim(), trimmed_stdout)
    };

    // Exit code 0 = valid, 1 = errors, 2 = warnings
    // All three produce valid JSON output.
    // On signal kill (Unix), .code() returns None -- treat as failure.
    let exit_code = output.status.code();
    match exit_code {
        Some(code) if code <= 2 => {
            if trimmed_stdout == "{}" {
                if combined_output.contains("No .env or .env.schema files found") {
                    return Err(
                        "Varlock project is not initialized yet. No .env or .env.schema files were found. Run `varlock init` in this project first.".to_string(),
                    );
                }

                return Err(
                    "Varlock returned an empty JSON object instead of variable data.".to_string(),
                );
            }

            serde_json::from_str::<VarlockLoadFullResult>(&stdout)
                .map(|result| result.into_load_result(env.unwrap_or("development").to_string()))
                .map_err(|e| {
                    format!(
                        "Failed to parse varlock output: {}. Raw output: {}",
                        e,
                        truncate_output(&combined_output, 500)
                    )
                })
        }
        _ => {
            let code_str = exit_code
                .map(|c| c.to_string())
                .unwrap_or_else(|| "killed by signal".to_string());
            Err(format!(
                "varlock load failed (exit {}): {}",
                code_str,
                truncate_output(&combined_output, 500)
            ))
        }
    }
}

/// Run `varlock init --yes` in a project directory.
pub async fn init(cwd: &str) -> Result<(), String> {
    let binary = find_varlock_binary(None)
        .await
        .ok_or_else(|| "Varlock is not installed.".to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.arg("init");
    cmd.current_dir(cwd);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    configure_no_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start varlock init: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(b"y\n")
            .await
            .map_err(|e| format!("Failed to answer varlock init prompt: {}", e))?;
        let _ = stdin.shutdown().await;
    }

    let output = match tokio::time::timeout(INIT_TIMEOUT, child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| format!("Failed to finish varlock init: {}", e))?,
        Err(_) => return Err("varlock init timed out after 300 seconds".to_string()),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined_output = if stderr.trim().is_empty() {
        stdout.trim().to_string()
    } else if stdout.trim().is_empty() {
        stderr.trim().to_string()
    } else {
        format!("{}\n{}", stderr.trim(), stdout.trim())
    };

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "varlock init failed: {}",
            truncate_output(&combined_output, 1000)
        ))
    }
}

/// Run `varlock scan` and parse the output.
pub async fn scan(cwd: &str) -> Result<VarlockScanResult, String> {
    let binary = find_varlock_binary(None)
        .await
        .ok_or_else(|| "Varlock is not installed.".to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.args(["scan", "--format=json"]);
    cmd.arg("--cwd");
    cmd.arg(cwd);
    configure_no_window(&mut cmd);

    let output = output_with_timeout(&mut cmd, CLI_TIMEOUT, "varlock scan").await?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    serde_json::from_str::<VarlockScanResult>(&stdout).map_err(|e| {
        format!(
            "Failed to parse varlock scan output: {}. Raw output: {}",
            e,
            truncate_output(&stdout, 500)
        )
    })
}

/// Build the command arguments for `varlock run`.
/// Returns (binary_path, full_args_vec) for use by the process spawner.
pub async fn build_run_command(
    cwd: &str,
    env: Option<&str>,
    command: &str,
) -> Result<(String, Vec<String>, Option<(String, String)>), String> {
    let binary = find_varlock_binary(None)
        .await
        .ok_or_else(|| "Varlock is not installed.".to_string())?;

    let binary_str = binary.to_string_lossy().to_string();

    // Build args: varlock run -- <user_command>
    let mut args = vec!["run".to_string(), "--cwd".to_string(), cwd.to_string(), "--".to_string()];

    // Split the user command into parts for the shell
    if cfg!(target_os = "windows") {
        args.push("cmd".to_string());
        args.push("/C".to_string());
        args.push(command.to_string());
    } else {
        args.push("sh".to_string());
        args.push("-c".to_string());
        args.push(command.to_string());
    }

    let env_override = env.map(|e| ("APP_ENV".to_string(), e.to_string()));

    Ok((binary_str, args, env_override))
}
