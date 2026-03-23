use std::path::Path;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use super::detect::find_varlock_binary;
use super::types::{
    VarlockLeak, VarlockLoadFullResult, VarlockLoadResult, VarlockScanResult, VarlockStatus,
};

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

/// Try to extract a JSON object from a string that may contain non-JSON text.
/// Finds the first `{` and last `}` and returns the substring between them.
fn extract_json(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end > start {
        Some(&s[start..=end])
    } else {
        None
    }
}

/// Extract a user-friendly error message from human-readable CLI output.
/// Strips emoji prefixes, blank lines, and formatting to produce a clean message.
fn extract_friendly_error(output: &str) -> String {
    let lines: Vec<&str> = output
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        // Strip common emoji-heavy header/footer lines
        .filter(|l| !l.starts_with("🚨") && !l.starts_with("💥"))
        .collect();

    if lines.is_empty() {
        return String::new();
    }

    // Clean each line: remove leading emoji/symbol characters
    let cleaned: Vec<String> = lines
        .iter()
        .map(|l| {
            l.trim_start_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-')
                .trim()
                .to_string()
        })
        .filter(|l| !l.is_empty())
        .collect();

    cleaned.join("\n")
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
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
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

            // The CLI may mix human-readable output with JSON.
            // Try to find JSON in stdout by locating the outermost { ... }.
            let json_str = extract_json(trimmed_stdout).unwrap_or(trimmed_stdout);

            match serde_json::from_str::<VarlockLoadFullResult>(json_str) {
                Ok(result) => Ok(result.into_load_result(env.unwrap_or("development").to_string())),
                Err(e) => {
                    // No valid JSON found — the CLI printed a human-readable error.
                    // Try to present a clean message instead of a parse error.
                    let friendly = extract_friendly_error(&combined_output);
                    if !friendly.is_empty() {
                        Err(friendly)
                    } else {
                        Err(format!(
                            "Failed to parse varlock output: {}. Raw output: {}",
                            e,
                            truncate_output(&combined_output, 500)
                        ))
                    }
                }
            }
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

/// Parse human-readable scan output (one leak per line: `FILE:LINE:COL KEY`).
/// Returns a `VarlockScanResult`. If the input is empty or has no parseable
/// lines, returns a "clean" result.
fn parse_scan_text(text: &str) -> VarlockScanResult {
    let mut leaks = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("🔍") || trimmed.starts_with("✅") {
            continue;
        }

        // Expected format: FILE:LINE:COL KEY
        // e.g.  .env.schema:8:4 PGSSLMODE
        let parts: Vec<&str> = trimmed.splitn(2, ' ').collect();
        if parts.len() != 2 {
            continue;
        }
        let location = parts[0];
        let key = parts[1].trim().to_string();

        let loc_parts: Vec<&str> = location.split(':').collect();
        if loc_parts.len() < 2 {
            continue;
        }
        let file = loc_parts[0].to_string();
        let line_num: u32 = loc_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

        leaks.push(VarlockLeak {
            file,
            line: line_num,
            key,
            severity: "high".to_string(),
        });
    }

    let clean = leaks.is_empty();
    let leak_count = leaks.len() as u32;
    VarlockScanResult {
        clean,
        leak_count,
        leaks,
    }
}

/// Run `varlock scan` and parse the output.
pub async fn scan(cwd: &str) -> Result<VarlockScanResult, String> {
    let binary = find_varlock_binary(None)
        .await
        .ok_or_else(|| "Varlock is not installed.".to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.args(["scan", "--format=json", "--path"]);
    cmd.arg(cwd);
    configure_no_window(&mut cmd);

    let output = output_with_timeout(&mut cmd, CLI_TIMEOUT, "varlock scan").await?;

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

    // Exit code 0 = clean, 1 = leaks found — both are valid scan outcomes.
    let exit_code = output.status.code();
    match exit_code {
        Some(0) | Some(1) => {
            // Try to find JSON anywhere in the combined output (stderr + stdout).
            if let Some(json_str) = extract_json(&combined_output) {
                if let Ok(result) = serde_json::from_str::<VarlockScanResult>(json_str) {
                    return Ok(result);
                }
            }

            // No valid JSON — fall back to parsing human-readable text output.
            Ok(parse_scan_text(&combined_output))
        }
        _ => {
            let code_str = exit_code
                .map(|c| c.to_string())
                .unwrap_or_else(|| "killed by signal".to_string());
            Err(format!(
                "varlock scan failed (exit {}): {}",
                code_str,
                truncate_output(&combined_output, 500)
            ))
        }
    }
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
    let mut args = vec![
        "run".to_string(),
        "--cwd".to_string(),
        cwd.to_string(),
        "--".to_string(),
    ];

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::varlock::types::VarlockScanResult;

    #[test]
    fn test_parse_scan_text_happy() {
        let text = ".env.schema:8:4 PGSSLMODE\nCargo.lock:1:16 S3_REGION\n";
        let result = parse_scan_text(text);

        assert!(!result.clean);
        assert_eq!(result.leak_count, 2);
        assert_eq!(result.leaks.len(), 2);

        assert_eq!(result.leaks[0].file, ".env.schema");
        assert_eq!(result.leaks[0].line, 8);
        assert_eq!(result.leaks[0].key, "PGSSLMODE");

        assert_eq!(result.leaks[1].file, "Cargo.lock");
        assert_eq!(result.leaks[1].line, 1);
        assert_eq!(result.leaks[1].key, "S3_REGION");
    }

    #[test]
    fn test_parse_scan_text_empty() {
        let result = parse_scan_text("");
        assert!(result.clean);
        assert_eq!(result.leak_count, 0);
        assert!(result.leaks.is_empty());
    }

    #[test]
    fn test_parse_scan_text_with_emoji_lines() {
        let text = "🔍 Scanning for leaks...\n.env:3:0 API_SECRET\n✅ Done.\n";
        let result = parse_scan_text(text);

        assert!(!result.clean);
        assert_eq!(result.leak_count, 1);
        assert_eq!(result.leaks[0].file, ".env");
        assert_eq!(result.leaks[0].key, "API_SECRET");
    }

    #[test]
    fn test_scan_json_fallback() {
        // Simulate JSON embedded in combined output with human text around it
        let combined = "🔍 Scanning...\n{\"clean\":false,\"leakCount\":1,\"leaks\":[{\"file\":\".env\",\"line\":5,\"key\":\"SECRET\",\"severity\":\"high\"}]}\n";
        let json_str = extract_json(combined);
        assert!(json_str.is_some());

        let result: VarlockScanResult = serde_json::from_str(json_str.unwrap()).unwrap();
        assert!(!result.clean);
        assert_eq!(result.leak_count, 1);
        assert_eq!(result.leaks[0].key, "SECRET");
    }

    #[test]
    fn test_extract_json_empty_string() {
        assert!(extract_json("").is_none());
    }

    #[test]
    fn test_extract_json_no_braces() {
        assert!(extract_json("no json here").is_none());
    }
}
