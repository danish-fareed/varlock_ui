use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;

/// Timeout for detection commands.
const DETECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Locate the varlock binary on the system.
/// Search order:
/// 1. User-configured custom path (if provided)
/// 2. System PATH
/// 3. Common npm global install locations
pub async fn find_varlock_binary(custom_path: Option<&str>) -> Option<PathBuf> {
    // 1. Check user-configured path
    if let Some(path) = custom_path {
        let p = normalize_windows_binary_path(PathBuf::from(path));
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Check system PATH using platform-specific `which`/`where` command
    if let Some(path) = find_in_path().await {
        return Some(path);
    }

    // 3. Check common npm global install locations
    for candidate in common_install_paths() {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

/// Use the system's `which` (Unix) or `where` (Windows) to find varlock in PATH.
async fn find_in_path() -> Option<PathBuf> {
    let cmd_name = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let mut cmd = Command::new(cmd_name);
    cmd.arg("varlock");

    // On Windows, prevent the console window from flashing
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = match tokio::time::timeout(DETECT_TIMEOUT, cmd.output()).await {
        Ok(result) => result.ok()?,
        Err(_) => {
            eprintln!("Warning: '{}' command timed out", cmd_name);
            return None;
        }
    };

    if output.status.success() {
        let candidates: Vec<PathBuf> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(PathBuf::from)
            .collect();

        select_windows_binary(candidates)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn normalize_windows_binary_path(path: PathBuf) -> PathBuf {
    if path.extension().is_some() {
        return path;
    }

    let cmd_path = path.with_extension("cmd");
    if cmd_path.exists() {
        return cmd_path;
    }

    let exe_path = path.with_extension("exe");
    if exe_path.exists() {
        return exe_path;
    }

    path
}

#[cfg(not(target_os = "windows"))]
fn normalize_windows_binary_path(path: PathBuf) -> PathBuf {
    path
}

#[cfg(target_os = "windows")]
fn select_windows_binary(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates
        .iter()
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("cmd"))
        .cloned()
        .or_else(|| {
            candidates
                .iter()
                .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("exe"))
                .cloned()
        })
        .or_else(|| {
            candidates
                .into_iter()
                .next()
                .map(normalize_windows_binary_path)
        })
}

#[cfg(not(target_os = "windows"))]
fn select_windows_binary(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().next()
}

/// Return a list of common locations where varlock might be installed.
fn common_install_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(home) = dirs::home_dir() {
        if cfg!(target_os = "windows") {
            // npm global installs on Windows
            paths.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("npm")
                    .join("varlock.cmd"),
            );
            paths.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("npm")
                    .join("varlock"),
            );
        } else {
            // npm global installs on Unix
            paths.push(home.join(".npm-global").join("bin").join("varlock"));

            // pnpm global (Unix only)
            paths.push(
                home.join(".local")
                    .join("share")
                    .join("pnpm")
                    .join("varlock"),
            );

            // yarn global (Unix only)
            paths.push(home.join(".yarn").join("bin").join("varlock"));
        }
    }

    // Standard Unix paths
    if !cfg!(target_os = "windows") {
        paths.push(PathBuf::from("/usr/local/bin/varlock"));
        paths.push(PathBuf::from("/usr/bin/varlock"));
    }

    paths
}
