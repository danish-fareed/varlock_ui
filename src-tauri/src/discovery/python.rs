use crate::discovery::types::{CommandType, DiscoveredCommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const VENV_CANDIDATES: [&str; 3] = [".venv", "venv", "env"];

#[derive(Debug, Clone)]
pub enum PythonEnvKind {
    Venv,
    Poetry,
    Conda,
}

#[derive(Debug, Clone)]
pub struct PythonEnvInfo {
    pub kind: PythonEnvKind,
    pub root: PathBuf,
    pub interpreter: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PythonEnvSetupStatus {
    Created,
    Reused,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonEnvWarmupLog {
    pub status: PythonEnvSetupStatus,
    pub interpreter_path: Option<String>,
    pub output_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonVenvCandidate {
    pub name: String,
    pub path: String,
    pub valid: bool,
    pub interpreter_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonEnvState {
    pub is_python_project: bool,
    pub has_requirements: bool,
    pub has_pyproject: bool,
    pub selected_env: Option<PythonVenvCandidate>,
    pub candidates: Vec<PythonVenvCandidate>,
    pub preferred_base_interpreter_path: Option<String>,
    pub available_interpreters: Vec<PythonInterpreterCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonInterpreterCandidate {
    pub label: String,
    pub version: Option<String>,
    pub executable_path: String,
    pub source: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PythonDetectError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct ResolvedLaunchCommand {
    pub command: String,
    pub args: Vec<String>,
    pub interpreter_override: Option<String>,
    pub requires_venv_warning: bool,
}

pub fn python_binary_for_venv(venv_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        venv_dir.join("bin").join("python")
    }
}

pub fn bin_path_for_venv_tool(venv_dir: &Path, tool: &str) -> PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join(format!("{}.exe", tool))
    } else {
        venv_dir.join("bin").join(tool)
    }
}

pub fn is_valid_venv_dir(venv_dir: &Path) -> bool {
    if !venv_dir.is_dir() {
        return false;
    }
    let pyvenv_cfg = venv_dir.join("pyvenv.cfg");
    let python_bin = python_binary_for_venv(venv_dir);
    pyvenv_cfg.is_file() && python_bin.is_file()
}

pub fn detect_venv_path(node_abs_path: &Path) -> Option<PathBuf> {
    for candidate in VENV_CANDIDATES {
        let p = node_abs_path.join(candidate);
        if is_valid_venv_dir(&p) {
            return Some(p);
        }
    }
    None
}

pub fn is_python_project(node_abs_path: &Path) -> bool {
    node_abs_path.join("requirements.txt").is_file()
        || node_abs_path.join("pyproject.toml").is_file()
}

pub fn inspect_python_env_state(node_abs_path: &Path) -> PythonEnvState {
    let mut candidates = Vec::new();
    for candidate in VENV_CANDIDATES {
        let candidate_path = node_abs_path.join(candidate);
        if !candidate_path.exists() {
            continue;
        }
        let interpreter = python_binary_for_venv(&candidate_path);
        let valid = is_valid_venv_dir(&candidate_path);
        candidates.push(PythonVenvCandidate {
            name: candidate.to_string(),
            path: candidate_path.to_string_lossy().to_string(),
            valid,
            interpreter_path: if interpreter.is_file() {
                Some(interpreter.to_string_lossy().to_string())
            } else {
                None
            },
        });
    }

    let selected_env = detect_venv_path(node_abs_path).map(|venv| PythonVenvCandidate {
        name: venv
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| ".venv".to_string()),
        path: venv.to_string_lossy().to_string(),
        valid: true,
        interpreter_path: Some(python_binary_for_venv(&venv).to_string_lossy().to_string()),
    });

    PythonEnvState {
        is_python_project: is_python_project(node_abs_path),
        has_requirements: node_abs_path.join("requirements.txt").is_file(),
        has_pyproject: node_abs_path.join("pyproject.toml").is_file(),
        selected_env,
        candidates,
        preferred_base_interpreter_path: None,
        available_interpreters: Vec::new(),
    }
}

fn probe_python_metadata(cwd: &Path, program: &str) -> Option<(String, Option<String>)> {
    let args = vec![
        "-c".to_string(),
        "import sys; print(sys.executable); print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')"
            .to_string(),
    ];
    let (ok, lines) = run_and_collect(cwd, program, &args).ok()?;
    if !ok || lines.is_empty() {
        return None;
    }
    let path = lines[0].trim().to_string();
    if path.is_empty() {
        return None;
    }
    let version = lines.get(1).map(|v| v.trim().to_string());
    Some((path, version.filter(|v| !v.is_empty())))
}

fn add_candidate(
    out: &mut Vec<PythonInterpreterCandidate>,
    seen: &mut HashSet<String>,
    path: String,
    version: Option<String>,
    source: &str,
) {
    let key = if cfg!(windows) {
        path.to_lowercase()
    } else {
        path.clone()
    };
    if seen.contains(&key) {
        return;
    }
    seen.insert(key);
    let label = match &version {
        Some(v) => format!("Python {}", v),
        None => "Python".to_string(),
    };
    out.push(PythonInterpreterCandidate {
        label,
        version,
        executable_path: path,
        source: source.to_string(),
    });
}

pub fn list_python_interpreters(node_abs_path: &Path) -> Vec<PythonInterpreterCandidate> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for cmd in ["python", "python3"] {
        if let Some((path, version)) = probe_python_metadata(node_abs_path, cmd) {
            add_candidate(&mut out, &mut seen, path, version, "path");
        }
    }

    let py_args = vec!["-0p".to_string()];
    if let Ok((ok, lines)) = run_and_collect(node_abs_path, "py", &py_args) {
        if ok {
            for line in lines {
                let token = line
                    .split_whitespace()
                    .last()
                    .map(|v| v.trim_matches('*').trim_matches('"').to_string());
                let Some(candidate_path) = token else {
                    continue;
                };
                if !Path::new(&candidate_path).is_file() {
                    continue;
                }
                if let Some((path, version)) = probe_python_metadata(node_abs_path, &candidate_path)
                {
                    add_candidate(&mut out, &mut seen, path, version, "py-launcher");
                }
            }
        }
    }

    if let Some(venv) = detect_venv_path(node_abs_path) {
        let py = python_binary_for_venv(&venv);
        if py.is_file() {
            let py_str = py.to_string_lossy().to_string();
            if let Some((path, version)) = probe_python_metadata(node_abs_path, &py_str) {
                add_candidate(&mut out, &mut seen, path, version, "venv");
            }
        }
    }

    out.sort_by(|a, b| {
        a.label
            .cmp(&b.label)
            .then_with(|| a.executable_path.cmp(&b.executable_path))
    });
    out
}

fn run_and_collect(
    cwd: &Path,
    program: &str,
    args: &[String],
) -> Result<(bool, Vec<String>), std::io::Error> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args).current_dir(cwd);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output()?;

    let mut lines = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if !line.trim().is_empty() {
            lines.push(line.to_string());
        }
    }
    for line in String::from_utf8_lossy(&output.stderr).lines() {
        if !line.trim().is_empty() {
            lines.push(line.to_string());
        }
    }
    Ok((output.status.success(), lines))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PythonPreferenceStore {
    scopes: HashMap<String, PythonScopePreference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PythonScopePreference {
    interpreter_path: String,
    version: Option<String>,
    updated_unix_ms: u64,
}

fn python_preferences_path(root_cwd: &Path) -> PathBuf {
    root_cwd
        .join(".vibestart")
        .join("cache")
        .join("python-preferences.json")
}

fn normalize_scope_key(root_cwd: &Path, scoped_cwd: &Path) -> String {
    scoped_cwd
        .strip_prefix(root_cwd)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| ".".to_string())
}

fn load_python_preferences(root_cwd: &Path) -> PythonPreferenceStore {
    let path = python_preferences_path(root_cwd);
    let content = match fs::read_to_string(path) {
        Ok(v) => v,
        Err(_) => return PythonPreferenceStore::default(),
    };
    serde_json::from_str::<PythonPreferenceStore>(&content).unwrap_or_default()
}

fn save_python_preferences(root_cwd: &Path, prefs: &PythonPreferenceStore) -> Result<(), String> {
    let path = python_preferences_path(root_cwd);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, payload).map_err(|e| e.to_string())
}

pub fn get_preferred_python_interpreter(root_cwd: &Path, scoped_cwd: &Path) -> Option<String> {
    let prefs = load_python_preferences(root_cwd);
    let key = normalize_scope_key(root_cwd, scoped_cwd);
    prefs.scopes.get(&key).map(|s| s.interpreter_path.clone())
}

pub fn set_preferred_python_interpreter(
    root_cwd: &Path,
    scoped_cwd: &Path,
    interpreter_path: String,
    version: Option<String>,
) -> Result<(), String> {
    if !Path::new(&interpreter_path).is_file() {
        return Err(format!("Interpreter path not found: {}", interpreter_path));
    }
    let mut prefs = load_python_preferences(root_cwd);
    let key = normalize_scope_key(root_cwd, scoped_cwd);
    let updated_unix_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    prefs.scopes.insert(
        key,
        PythonScopePreference {
            interpreter_path,
            version,
            updated_unix_ms,
        },
    );
    save_python_preferences(root_cwd, &prefs)
}

fn append_command_log(
    output_lines: &mut Vec<String>,
    program: &str,
    args: &[String],
    lines: &[String],
) {
    output_lines.push(format!("> {} {}", program, args.join(" ")));
    output_lines.extend(lines.iter().cloned());
}

fn resolve_and_warmup_with_runner<F>(
    node_abs_path: &Path,
    preferred_base_interpreter: Option<&str>,
    mut runner: F,
) -> PythonEnvWarmupLog
where
    F: FnMut(&Path, &str, &[String]) -> Result<(bool, Vec<String>), std::io::Error>,
{
    let mut output_lines = Vec::new();

    if !is_python_project(node_abs_path) {
        output_lines.push(
            "No requirements.txt or pyproject.toml found; skipping Python venv setup".to_string(),
        );
        return PythonEnvWarmupLog {
            status: PythonEnvSetupStatus::Failed,
            interpreter_path: None,
            output_lines,
        };
    }

    let mut status = PythonEnvSetupStatus::Reused;
    let mut venv_root = detect_venv_path(node_abs_path);
    if venv_root.is_none() {
        status = PythonEnvSetupStatus::Created;
        let args = vec!["-m".to_string(), "venv".to_string(), ".venv".to_string()];
        let create_program = preferred_base_interpreter.unwrap_or("python");
        match runner(node_abs_path, create_program, &args) {
            Ok((ok, lines)) => {
                append_command_log(&mut output_lines, create_program, &args, &lines);
                if !ok {
                    if preferred_base_interpreter.is_some() {
                        output_lines.push(
                            "Preferred interpreter failed; retrying with system python".to_string(),
                        );
                        match runner(node_abs_path, "python", &args) {
                            Ok((ok2, lines2)) => {
                                append_command_log(&mut output_lines, "python", &args, &lines2);
                                if !ok2 {
                                    output_lines
                                        .push("Failed to create virtual environment".to_string());
                                    return PythonEnvWarmupLog {
                                        status: PythonEnvSetupStatus::Failed,
                                        interpreter_path: None,
                                        output_lines,
                                    };
                                }
                            }
                            Err(err2) => {
                                output_lines.push(format!(
                                    "Failed to create virtual environment: {}",
                                    err2
                                ));
                                return PythonEnvWarmupLog {
                                    status: PythonEnvSetupStatus::Failed,
                                    interpreter_path: None,
                                    output_lines,
                                };
                            }
                        }
                    } else {
                        output_lines.push("Failed to create virtual environment".to_string());
                        return PythonEnvWarmupLog {
                            status: PythonEnvSetupStatus::Failed,
                            interpreter_path: None,
                            output_lines,
                        };
                    }
                }
            }
            Err(err) => {
                if preferred_base_interpreter.is_some() {
                    output_lines.push(format!(
                        "Preferred interpreter failed ({}); retrying with system python",
                        err
                    ));
                    match runner(node_abs_path, "python", &args) {
                        Ok((ok2, lines2)) => {
                            append_command_log(&mut output_lines, "python", &args, &lines2);
                            if !ok2 {
                                output_lines
                                    .push("Failed to create virtual environment".to_string());
                                return PythonEnvWarmupLog {
                                    status: PythonEnvSetupStatus::Failed,
                                    interpreter_path: None,
                                    output_lines,
                                };
                            }
                        }
                        Err(err2) => {
                            output_lines
                                .push(format!("Failed to create virtual environment: {}", err2));
                            return PythonEnvWarmupLog {
                                status: PythonEnvSetupStatus::Failed,
                                interpreter_path: None,
                                output_lines,
                            };
                        }
                    }
                } else {
                    output_lines.push(format!("Failed to create virtual environment: {}", err));
                    return PythonEnvWarmupLog {
                        status: PythonEnvSetupStatus::Failed,
                        interpreter_path: None,
                        output_lines,
                    };
                }
            }
        }
        venv_root = detect_venv_path(node_abs_path);
    }

    let Some(venv_root) = venv_root else {
        output_lines.push("No valid Python virtual environment found after setup".to_string());
        return PythonEnvWarmupLog {
            status: PythonEnvSetupStatus::Failed,
            interpreter_path: None,
            output_lines,
        };
    };

    let mut venv_root = venv_root;
    let mut interpreter = python_binary_for_venv(&venv_root);
    let mut interpreter_str = interpreter.to_string_lossy().to_string();

    let probe_args = vec![
        "-c".to_string(),
        "import sys; print(sys.executable)".to_string(),
    ];
    let probe_ok = match runner(node_abs_path, &interpreter_str, &probe_args) {
        Ok((ok, lines)) => {
            append_command_log(&mut output_lines, &interpreter_str, &probe_args, &lines);
            ok
        }
        Err(err) => {
            output_lines.push(format!(
                "Failed to execute resolved interpreter {}: {}",
                interpreter_str, err
            ));
            false
        }
    };

    if !probe_ok {
        output_lines
            .push("Resolved environment is not executable; creating fresh .venv".to_string());
        status = PythonEnvSetupStatus::Created;

        let create_args = vec![
            "-m".to_string(),
            "venv".to_string(),
            "--clear".to_string(),
            ".venv".to_string(),
        ];
        match runner(node_abs_path, "python", &create_args) {
            Ok((ok, lines)) => {
                append_command_log(&mut output_lines, "python", &create_args, &lines);
                if !ok {
                    output_lines.push("Failed to rebuild .venv".to_string());
                    return PythonEnvWarmupLog {
                        status: PythonEnvSetupStatus::Failed,
                        interpreter_path: None,
                        output_lines,
                    };
                }
            }
            Err(err) => {
                output_lines.push(format!("Failed to rebuild .venv: {}", err));
                return PythonEnvWarmupLog {
                    status: PythonEnvSetupStatus::Failed,
                    interpreter_path: None,
                    output_lines,
                };
            }
        }

        let Some(refreshed) = detect_venv_path(node_abs_path) else {
            output_lines.push("Unable to locate .venv after rebuild".to_string());
            return PythonEnvWarmupLog {
                status: PythonEnvSetupStatus::Failed,
                interpreter_path: None,
                output_lines,
            };
        };
        venv_root = refreshed;
        interpreter = python_binary_for_venv(&venv_root);
        interpreter_str = interpreter.to_string_lossy().to_string();
    }

    let should_install_deps = status == PythonEnvSetupStatus::Created;

    if should_install_deps && node_abs_path.join("requirements.txt").is_file() {
        let args = vec![
            "-m".to_string(),
            "pip".to_string(),
            "install".to_string(),
            "-r".to_string(),
            "requirements.txt".to_string(),
        ];
        match runner(node_abs_path, &interpreter_str, &args) {
            Ok((ok, lines)) => {
                append_command_log(&mut output_lines, &interpreter_str, &args, &lines);
                if !ok {
                    output_lines
                        .push("Failed to install requirements.txt dependencies".to_string());
                    return PythonEnvWarmupLog {
                        status: PythonEnvSetupStatus::Failed,
                        interpreter_path: Some(interpreter_str),
                        output_lines,
                    };
                }
            }
            Err(err) => {
                output_lines.push(format!(
                    "Failed to install requirements.txt dependencies: {}",
                    err
                ));
                return PythonEnvWarmupLog {
                    status: PythonEnvSetupStatus::Failed,
                    interpreter_path: Some(interpreter_str),
                    output_lines,
                };
            }
        }
    }

    if should_install_deps && node_abs_path.join("pyproject.toml").is_file() {
        let args = vec![
            "-m".to_string(),
            "pip".to_string(),
            "install".to_string(),
            "-e".to_string(),
            ".".to_string(),
        ];
        match runner(node_abs_path, &interpreter_str, &args) {
            Ok((ok, lines)) => {
                append_command_log(&mut output_lines, &interpreter_str, &args, &lines);
                if !ok {
                    output_lines.push("Failed to install pyproject dependencies".to_string());
                    return PythonEnvWarmupLog {
                        status: PythonEnvSetupStatus::Failed,
                        interpreter_path: Some(interpreter_str),
                        output_lines,
                    };
                }
            }
            Err(err) => {
                output_lines.push(format!("Failed to install pyproject dependencies: {}", err));
                return PythonEnvWarmupLog {
                    status: PythonEnvSetupStatus::Failed,
                    interpreter_path: Some(interpreter_str),
                    output_lines,
                };
            }
        }
    }

    PythonEnvWarmupLog {
        status,
        interpreter_path: Some(interpreter.to_string_lossy().to_string()),
        output_lines,
    }
}

pub fn resolve_and_warmup_python_env(node_abs_path: &Path) -> PythonEnvWarmupLog {
    resolve_and_warmup_with_runner(node_abs_path, None, run_and_collect)
}

pub fn resolve_and_warmup_python_env_with_preferred(
    node_abs_path: &Path,
    preferred_base_interpreter: Option<String>,
) -> PythonEnvWarmupLog {
    resolve_and_warmup_with_runner(
        node_abs_path,
        preferred_base_interpreter.as_deref(),
        run_and_collect,
    )
}

pub fn rebuild_default_python_env(node_abs_path: &Path) -> PythonEnvWarmupLog {
    let mut output_lines = Vec::new();
    let default_venv = node_abs_path.join(".venv");
    if default_venv.exists() {
        if !default_venv.is_dir() {
            output_lines.push(".venv exists but is not a directory".to_string());
            return PythonEnvWarmupLog {
                status: PythonEnvSetupStatus::Failed,
                interpreter_path: None,
                output_lines,
            };
        }
        if let Err(err) = std::fs::remove_dir_all(&default_venv) {
            output_lines.push(format!("Failed to remove .venv: {}", err));
            return PythonEnvWarmupLog {
                status: PythonEnvSetupStatus::Failed,
                interpreter_path: None,
                output_lines,
            };
        }
        output_lines.push("Removed existing .venv".to_string());
    }

    let mut warmup = resolve_and_warmup_python_env(node_abs_path);
    if !output_lines.is_empty() {
        let mut merged = output_lines;
        merged.extend(warmup.output_lines);
        warmup.output_lines = merged;
    }
    warmup
}

pub fn rebuild_default_python_env_with_preferred(
    node_abs_path: &Path,
    preferred_base_interpreter: Option<String>,
) -> PythonEnvWarmupLog {
    let mut output_lines = Vec::new();
    let default_venv = node_abs_path.join(".venv");
    if default_venv.exists() {
        if !default_venv.is_dir() {
            output_lines.push(".venv exists but is not a directory".to_string());
            return PythonEnvWarmupLog {
                status: PythonEnvSetupStatus::Failed,
                interpreter_path: None,
                output_lines,
            };
        }
        if let Err(err) = std::fs::remove_dir_all(&default_venv) {
            output_lines.push(format!("Failed to remove .venv: {}", err));
            return PythonEnvWarmupLog {
                status: PythonEnvSetupStatus::Failed,
                interpreter_path: None,
                output_lines,
            };
        }
        output_lines.push("Removed existing .venv".to_string());
    }

    let mut warmup =
        resolve_and_warmup_python_env_with_preferred(node_abs_path, preferred_base_interpreter);
    if !output_lines.is_empty() {
        let mut merged = output_lines;
        merged.extend(warmup.output_lines);
        warmup.output_lines = merged;
    }
    warmup
}

pub fn resolve_poetry_env(_node_abs_path: &Path) -> Option<PathBuf> {
    None
}

pub fn resolve_conda_env(node_abs_path: &Path) -> Option<PathBuf> {
    let local = node_abs_path.join("conda-meta");
    if local.exists() {
        return Some(node_abs_path.to_path_buf());
    }
    None
}

pub fn detect_python_environment(node_abs_path: &Path) -> Result<PythonEnvInfo, PythonDetectError> {
    if let Some(venv) = detect_venv_path(node_abs_path) {
        return Ok(PythonEnvInfo {
            kind: PythonEnvKind::Venv,
            interpreter: python_binary_for_venv(&venv),
            root: venv,
        });
    }

    if let Some(poetry) = resolve_poetry_env(node_abs_path) {
        return Ok(PythonEnvInfo {
            kind: PythonEnvKind::Poetry,
            interpreter: python_binary_for_venv(&poetry),
            root: poetry,
        });
    }

    if let Some(conda) = resolve_conda_env(node_abs_path) {
        return Ok(PythonEnvInfo {
            kind: PythonEnvKind::Conda,
            interpreter: python_binary_for_venv(&conda),
            root: conda,
        });
    }

    Err(PythonDetectError::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no python environment found",
    )))
}

pub fn apply_python_substitution(
    cmd: &DiscoveredCommand,
    env: &PythonEnvInfo,
) -> ResolvedLaunchCommand {
    let mut command = cmd.command.clone();
    let mut args = cmd.args.clone();
    let mut interpreter_override = Some(env.interpreter.to_string_lossy().to_string());
    let mut warning = false;

    let lower = command.to_lowercase();
    if matches!(lower.as_str(), "python" | "python3" | "py") {
        command = env.interpreter.to_string_lossy().to_string();
    } else if lower == "pytest" {
        let pytest = bin_path_for_venv_tool(&env.root, "pytest");
        if pytest.exists() {
            command = pytest.to_string_lossy().to_string();
            interpreter_override = None;
        } else {
            command = env.interpreter.to_string_lossy().to_string();
            args = std::iter::once("-m".to_string())
                .chain(std::iter::once("pytest".to_string()))
                .chain(args)
                .collect();
        }
    } else if lower == "uvicorn" || lower == "gunicorn" {
        let bin = bin_path_for_venv_tool(&env.root, &lower);
        if bin.exists() {
            command = bin.to_string_lossy().to_string();
            interpreter_override = None;
        } else {
            command = env.interpreter.to_string_lossy().to_string();
            args = std::iter::once("-m".to_string())
                .chain(std::iter::once(lower))
                .chain(args)
                .collect();
        }
    } else if cmd.command_type == CommandType::LocalProcess && cmd.requires_venv {
        warning = true;
    }

    ResolvedLaunchCommand {
        command,
        args,
        interpreter_override,
        requires_venv_warning: warning,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> PathBuf {
        let base =
            std::env::temp_dir().join(format!("varlock_py_test_{}_{}", name, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn detect_venv_prefers_dotvenv_over_venv() {
        let dir = mk_temp_dir("venv_preference");
        std::fs::create_dir_all(dir.join(".venv")).expect("mkdir .venv");
        std::fs::create_dir_all(dir.join("venv")).expect("mkdir venv");

        std::fs::write(dir.join(".venv").join("pyvenv.cfg"), "").expect("write dotvenv cfg");
        std::fs::write(dir.join("venv").join("pyvenv.cfg"), "").expect("write venv cfg");

        let dotvenv_py = python_binary_for_venv(&dir.join(".venv"));
        let dotvenv_parent = dotvenv_py.parent().expect("dotvenv parent");
        std::fs::create_dir_all(dotvenv_parent).expect("mkdir dotvenv bin");
        std::fs::write(&dotvenv_py, "").expect("write dotvenv python");

        let venv_py = python_binary_for_venv(&dir.join("venv"));
        let venv_parent = venv_py.parent().expect("venv parent");
        std::fs::create_dir_all(venv_parent).expect("mkdir venv bin");
        std::fs::write(&venv_py, "").expect("write venv python");

        let found = detect_venv_path(&dir).expect("venv found");
        assert!(found.ends_with(".venv"));
    }

    #[test]
    fn detect_venv_uses_env_directory_name() {
        let dir = mk_temp_dir("env_candidate");
        std::fs::create_dir_all(dir.join("env")).expect("mkdir env");
        std::fs::write(dir.join("env").join("pyvenv.cfg"), "").expect("write env cfg");
        let env_py = python_binary_for_venv(&dir.join("env"));
        let env_parent = env_py.parent().expect("env parent");
        std::fs::create_dir_all(env_parent).expect("mkdir env bin");
        std::fs::write(&env_py, "").expect("write env python");

        let found = detect_venv_path(&dir).expect("venv found");
        assert!(found.ends_with("env"));
    }

    #[test]
    fn invalid_venv_missing_pyvenv_cfg_is_rejected() {
        let dir = mk_temp_dir("invalid_venv");
        std::fs::create_dir_all(dir.join(".venv")).expect("mkdir .venv");
        let py = python_binary_for_venv(&dir.join(".venv"));
        let parent = py.parent().expect("py parent");
        std::fs::create_dir_all(parent).expect("mkdir py parent");
        std::fs::write(&py, "").expect("write py");

        assert!(detect_venv_path(&dir).is_none());
    }

    #[test]
    fn create_venv_when_missing_and_install_requirements() {
        let dir = mk_temp_dir("create_venv");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");

        let mut invoked: Vec<String> = Vec::new();
        let log = resolve_and_warmup_with_runner(&dir, None, |cwd, program, args| {
            invoked.push(format!("{} {}", program, args.join(" ")));
            if program == "python" && args == ["-m", "venv", ".venv"] {
                let venv_root = cwd.join(".venv");
                std::fs::create_dir_all(&venv_root).expect("mkdir .venv");
                std::fs::write(venv_root.join("pyvenv.cfg"), "").expect("cfg");
                let py = python_binary_for_venv(&venv_root);
                let parent = py.parent().expect("parent");
                std::fs::create_dir_all(parent).expect("mkdir bin");
                std::fs::write(py, "").expect("write py");
                return Ok((true, vec!["created".to_string()]));
            }
            Ok((true, vec!["ok".to_string()]))
        });

        assert_eq!(log.status, PythonEnvSetupStatus::Created);
        assert!(log.interpreter_path.is_some());
        assert!(invoked
            .iter()
            .any(|cmd| cmd.contains("python -m venv .venv")));
        assert!(invoked
            .iter()
            .any(|cmd| cmd.contains("-m pip install -r requirements.txt")));
    }

    #[test]
    fn installer_selection_for_pyproject_and_requirements() {
        let dir = mk_temp_dir("installer_selection");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");
        std::fs::write(
            dir.join("pyproject.toml"),
            "[project]\nname='app'\nversion='0.1.0'\n",
        )
        .expect("write pyproject");
        std::fs::create_dir_all(dir.join(".venv")).expect("mkdir .venv");
        std::fs::write(dir.join(".venv").join("pyvenv.cfg"), "").expect("write cfg");
        let py = python_binary_for_venv(&dir.join(".venv"));
        let parent = py.parent().expect("py parent");
        std::fs::create_dir_all(parent).expect("mkdir py parent");
        std::fs::write(&py, "").expect("write py");

        let mut invoked: Vec<String> = Vec::new();
        let log = resolve_and_warmup_with_runner(&dir, None, |_cwd, program, args| {
            invoked.push(format!("{} {}", program, args.join(" ")));
            Ok((true, vec!["ok".to_string()]))
        });

        assert_eq!(log.status, PythonEnvSetupStatus::Reused);
        assert!(!invoked
            .iter()
            .any(|cmd| cmd.contains("-m pip install -r requirements.txt")));
        assert!(!invoked
            .iter()
            .any(|cmd| cmd.contains("-m pip install -e .")));
    }

    #[test]
    fn warmup_rebuilds_when_existing_env_python_is_not_executable() {
        let dir = mk_temp_dir("broken_existing_env");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");
        std::fs::create_dir_all(dir.join("venv")).expect("mkdir venv");
        std::fs::write(dir.join("venv").join("pyvenv.cfg"), "").expect("write cfg");
        let bad_py = python_binary_for_venv(&dir.join("venv"));
        let bad_parent = bad_py.parent().expect("bad py parent");
        std::fs::create_dir_all(bad_parent).expect("mkdir bad py parent");
        std::fs::write(&bad_py, "").expect("write bad py");

        let mut invoked: Vec<String> = Vec::new();
        let log = resolve_and_warmup_with_runner(&dir, None, |cwd, program, args| {
            invoked.push(format!("{} {}", program, args.join(" ")));

            if program == bad_py.to_string_lossy()
                && args == ["-c", "import sys; print(sys.executable)"]
            {
                return Ok((
                    false,
                    vec!["No Python at '/bad/path/python.exe'".to_string()],
                ));
            }

            if program == "python" && args == ["-m", "venv", "--clear", ".venv"] {
                let venv_root = cwd.join(".venv");
                std::fs::create_dir_all(&venv_root).expect("mkdir .venv");
                std::fs::write(venv_root.join("pyvenv.cfg"), "").expect("write new cfg");
                let py = python_binary_for_venv(&venv_root);
                let parent = py.parent().expect("new py parent");
                std::fs::create_dir_all(parent).expect("mkdir new py parent");
                std::fs::write(py, "").expect("write new py");
                return Ok((true, vec!["rebuilt".to_string()]));
            }

            Ok((true, vec!["ok".to_string()]))
        });

        assert_eq!(log.status, PythonEnvSetupStatus::Created);
        assert!(invoked
            .iter()
            .any(|cmd| cmd.contains("-m venv --clear .venv")));
        assert!(
            invoked
                .iter()
                .any(|cmd| cmd.contains(".venv")
                    && cmd.contains("-m pip install -r requirements.txt"))
        );
    }

    #[test]
    fn inspect_state_returns_candidates_and_selected_env() {
        let dir = mk_temp_dir("inspect_state");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");
        std::fs::create_dir_all(dir.join(".venv")).expect("mkdir .venv");
        std::fs::write(dir.join(".venv").join("pyvenv.cfg"), "").expect("write cfg");
        let py = python_binary_for_venv(&dir.join(".venv"));
        let parent = py.parent().expect("py parent");
        std::fs::create_dir_all(parent).expect("mkdir py parent");
        std::fs::write(&py, "").expect("write py");

        let state = inspect_python_env_state(&dir);
        assert!(state.is_python_project);
        assert!(state.has_requirements);
        assert!(state.selected_env.is_some());
        assert_eq!(state.candidates.len(), 1);
    }

    #[test]
    fn rebuild_default_env_removes_dotvenv_before_warmup() {
        let dir = mk_temp_dir("rebuild_default");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");
        std::fs::create_dir_all(dir.join(".venv")).expect("mkdir .venv");
        std::fs::write(dir.join(".venv").join("pyvenv.cfg"), "").expect("write cfg");
        let py = python_binary_for_venv(&dir.join(".venv"));
        let parent = py.parent().expect("py parent");
        std::fs::create_dir_all(parent).expect("mkdir py parent");
        std::fs::write(&py, "").expect("write py");

        let log = rebuild_default_python_env(&dir);
        assert!(!matches!(log.status, PythonEnvSetupStatus::Failed));
        assert!(log
            .output_lines
            .iter()
            .any(|line| line.contains("Removed existing .venv")));
    }

    #[test]
    fn rebuild_default_env_fails_when_dotvenv_is_file() {
        let dir = mk_temp_dir("rebuild_dotvenv_file");
        std::fs::write(dir.join("requirements.txt"), "pytest\n").expect("write requirements");
        std::fs::write(dir.join(".venv"), "not a dir").expect("write bad dotvenv");

        let log = rebuild_default_python_env(&dir);
        assert_eq!(log.status, PythonEnvSetupStatus::Failed);
        assert!(log
            .output_lines
            .iter()
            .any(|line| line.contains("not a directory")));
    }

    #[test]
    fn detect_venv_windows_python_path() {
        let path = python_binary_for_venv(Path::new("C:/repo/.venv"));
        if cfg!(windows) {
            assert!(path.to_string_lossy().ends_with("Scripts\\python.exe"));
        } else {
            assert!(path.to_string_lossy().ends_with("bin/python"));
        }
    }

    #[test]
    fn substitute_python_command_to_venv_python() {
        let env = PythonEnvInfo {
            kind: PythonEnvKind::Venv,
            root: PathBuf::from("/tmp/.venv"),
            interpreter: PathBuf::from("/tmp/.venv/bin/python"),
        };

        let cmd = DiscoveredCommand {
            id: "1".to_string(),
            project_id: "p".to_string(),
            node_id: "n".to_string(),
            name: "Run".to_string(),
            command: "python".to_string(),
            args: vec!["main.py".to_string()],
            source: "python".to_string(),
            source_file: "main.py".to_string(),
            command_type: CommandType::LocalProcess,
            cwd_override: ".".to_string(),
            interpreter_override: None,
            requires_venv: true,
            cloud_job_config: None,
            env_scope: crate::discovery::types::EnvScope {
                scope_path: ".".to_string(),
                files: vec![],
                active_env_name: "default".to_string(),
                has_varlock: false,
                is_plain_dotenv: false,
            },
            command_fingerprint: "fp".to_string(),
            raw_cmd: "python main.py".to_string(),
            category: "local-process".to_string(),
            sort_order: 0,
            is_custom: false,
        };

        let resolved = apply_python_substitution(&cmd, &env);
        assert_eq!(resolved.command, "/tmp/.venv/bin/python");
        assert_eq!(resolved.args, vec!["main.py"]);
    }
}
