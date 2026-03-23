use crate::discovery::python::{
    detect_venv_path, get_preferred_python_interpreter, python_binary_for_venv,
};
use crate::launcher::cache::RuntimeLaunchCache;
use crate::launcher::config::PythonOverrides;
use crate::launcher::driver::{stage_event, DriverContext, DriverResult, RuntimeDriver};
use crate::launcher::fingerprint::python_fingerprint;
use crate::launcher::types::{
    CommandStep, ExecutionPolicy, OrchestratorError, PipelineStage, RuntimeKind,
};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
enum PythonManager {
    Uv,
    Poetry,
    Pdm,
    Pip,
}

impl PythonManager {
    fn as_str(&self) -> &'static str {
        match self {
            PythonManager::Uv => "uv",
            PythonManager::Poetry => "poetry",
            PythonManager::Pdm => "pdm",
            PythonManager::Pip => "pip",
        }
    }
}

fn detect_manager(cwd: &Path, cfg: &PythonOverrides) -> PythonManager {
    if let Some(explicit) = cfg.manager.as_deref() {
        return match explicit.to_lowercase().as_str() {
            "uv" => PythonManager::Uv,
            "poetry" => PythonManager::Poetry,
            "pdm" => PythonManager::Pdm,
            _ => PythonManager::Pip,
        };
    }
    if cwd.join("uv.lock").is_file() {
        return PythonManager::Uv;
    }
    if cwd.join("poetry.lock").is_file() {
        return PythonManager::Poetry;
    }
    if cwd.join("pdm.lock").is_file() {
        return PythonManager::Pdm;
    }
    PythonManager::Pip
}

fn run_capture(
    cwd: &Path,
    program: &str,
    args: &[String],
) -> Result<(bool, Vec<String>), std::io::Error> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args).current_dir(cwd);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let out = cmd.output()?;
    let mut lines = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if !line.trim().is_empty() {
            lines.push(line.to_string());
        }
    }
    for line in String::from_utf8_lossy(&out.stderr).lines() {
        if !line.trim().is_empty() {
            lines.push(line.to_string());
        }
    }
    Ok((out.status.success(), lines))
}

fn venv_root(cwd: &Path, cfg: &PythonOverrides) -> PathBuf {
    if let Some(rel) = cfg.venv_path.as_deref() {
        return cwd.join(rel);
    }
    detect_venv_path(cwd).unwrap_or_else(|| cwd.join(".venv"))
}

fn ensure_env(
    cwd: &Path,
    root_cwd: &Path,
    cfg: &PythonOverrides,
    launch_logs: &mut Vec<String>,
    plan_steps: &mut Vec<CommandStep>,
) -> Result<PathBuf, OrchestratorError> {
    let root = venv_root(cwd, cfg);
    let py = python_binary_for_venv(&root);
    if py.is_file() {
        launch_logs.push(format!(
            "Reusing virtual environment at {}",
            root.to_string_lossy()
        ));
        return Ok(root);
    }
    let target = root
        .strip_prefix(cwd)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| ".venv".to_string());
    let create_args = vec!["-m".to_string(), "venv".to_string(), target];
    let preferred = cfg
        .preferred_interpreter_path
        .clone()
        .or_else(|| get_preferred_python_interpreter(root_cwd, cwd));
    let create_program = preferred.clone().unwrap_or_else(|| "python".to_string());
    plan_steps.push(CommandStep {
        stage: PipelineStage::Prepare,
        program: create_program.clone(),
        args: create_args.clone(),
        cwd: cwd.to_string_lossy().to_string(),
    });
    let (ok, lines) = match run_capture(cwd, &create_program, &create_args) {
        Ok(v) => v,
        Err(err) => {
            if preferred.is_some() {
                launch_logs.push(format!(
                    "Preferred interpreter unavailable ({}), falling back to system python",
                    create_program
                ));
                run_capture(cwd, "python", &create_args).map_err(OrchestratorError::Io)?
            } else {
                return Err(OrchestratorError::Io(err));
            }
        }
    };
    launch_logs.push(format!("> {} {}", create_program, create_args.join(" ")));
    launch_logs.extend(lines.clone());
    if !ok {
        if preferred.is_some() {
            let (fallback_ok, fallback_lines) =
                run_capture(cwd, "python", &create_args).map_err(OrchestratorError::Io)?;
            launch_logs.push(format!("> python {}", create_args.join(" ")));
            launch_logs.extend(fallback_lines.clone());
            if !fallback_ok {
                return Err(OrchestratorError::StageFailed {
                    stage: PipelineStage::Prepare.as_str().to_string(),
                    reason: "failed creating virtual environment".to_string(),
                    command: Some(format!("python {}", create_args.join(" "))),
                    cwd: Some(cwd.to_string_lossy().to_string()),
                    stderr: Some(fallback_lines.join("\n")),
                });
            }
        } else {
            return Err(OrchestratorError::StageFailed {
                stage: PipelineStage::Prepare.as_str().to_string(),
                reason: "failed creating virtual environment".to_string(),
                command: Some(format!("{} {}", create_program, create_args.join(" "))),
                cwd: Some(cwd.to_string_lossy().to_string()),
                stderr: Some(lines.join("\n")),
            });
        }
    }
    Ok(root)
}

fn sync_args_for(manager: &PythonManager, cfg: &PythonOverrides) -> Option<(String, Vec<String>)> {
    if let Some(custom) = cfg.install_command.as_deref() {
        if cfg!(windows) {
            return Some((
                "cmd".to_string(),
                vec!["/C".to_string(), custom.to_string()],
            ));
        }
        return Some(("sh".to_string(), vec!["-c".to_string(), custom.to_string()]));
    }

    let args = match manager {
        PythonManager::Uv => ("uv".to_string(), vec!["sync".to_string()]),
        PythonManager::Poetry => (
            "poetry".to_string(),
            vec!["install".to_string(), "--no-interaction".to_string()],
        ),
        PythonManager::Pdm => ("pdm".to_string(), vec!["install".to_string()]),
        PythonManager::Pip => (
            "python".to_string(),
            vec![
                "-m".to_string(),
                "pip".to_string(),
                "install".to_string(),
                "-r".to_string(),
                "requirements.txt".to_string(),
            ],
        ),
    };
    Some(args)
}

fn has_requirements(cwd: &Path) -> bool {
    if cwd.join("requirements.txt").is_file() {
        return true;
    }
    if let Ok(entries) = fs::read_dir(cwd) {
        return entries.flatten().any(|entry| {
            entry
                .path()
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("requirements") && n.ends_with(".txt"))
                .unwrap_or(false)
        });
    }
    false
}

pub struct PythonRuntimeDriver {
    pub overrides: PythonOverrides,
}

impl RuntimeDriver for PythonRuntimeDriver {
    fn runtime(&self) -> RuntimeKind {
        RuntimeKind::Python
    }

    fn execute(&self, cwd: &Path, ctx: DriverContext) -> Result<DriverResult, OrchestratorError> {
        let mut events = Vec::new();
        let mut launch_logs = Vec::new();
        let mut plan_steps = Vec::new();
        let manager = detect_manager(cwd, &self.overrides);

        events.push(stage_event(
            PipelineStage::Detect,
            "ok",
            format!("Python manager: {}", manager.as_str()),
            RuntimeKind::Python,
        ));

        let before_env = detect_venv_path(cwd).is_some();
        let root_cwd = Path::new(&ctx.request.root_cwd);
        let venv = ensure_env(
            cwd,
            root_cwd,
            &self.overrides,
            &mut launch_logs,
            &mut plan_steps,
        )?;
        let interpreter = python_binary_for_venv(&venv).to_string_lossy().to_string();
        events.push(stage_event(
            PipelineStage::Prepare,
            "ok",
            if before_env {
                "Reusing .venv".to_string()
            } else {
                "Creating .venv".to_string()
            },
            RuntimeKind::Python,
        ));

        let fingerprint = python_fingerprint(cwd);
        let fingerprint_changed = fingerprint != ctx.cached.fingerprint;
        let interpreter_changed = ctx
            .cached
            .resolved_binary_path
            .as_deref()
            .map(|v| v != interpreter)
            .unwrap_or(true);

        let should_sync = match ctx.policy {
            ExecutionPolicy::Never => false,
            ExecutionPolicy::Always => true,
            ExecutionPolicy::Auto => {
                !ctx.cached.last_prepare_ok
                    || !ctx.cached.last_sync_ok
                    || !before_env
                    || fingerprint_changed
                    || interpreter_changed
            }
        };

        if should_sync {
            let sync_cmd = sync_args_for(&manager, &self.overrides);
            if let Some((program, args)) = sync_cmd {
                let skip_pip = manager == PythonManager::Pip && !has_requirements(cwd);
                if skip_pip {
                    events.push(stage_event(
                        PipelineStage::Sync,
                        "ok",
                        "No requirements file; skipping sync",
                        RuntimeKind::Python,
                    ));
                } else {
                    plan_steps.push(CommandStep {
                        stage: PipelineStage::Sync,
                        program: program.clone(),
                        args: args.clone(),
                        cwd: cwd.to_string_lossy().to_string(),
                    });
                    let (ok, lines) = match run_capture(cwd, &program, &args) {
                        Ok(value) => value,
                        Err(err) => {
                            if ctx.policy == ExecutionPolicy::Always {
                                return Err(OrchestratorError::Io(err));
                            }
                            events.push(stage_event(
                                PipelineStage::Sync,
                                "warn",
                                format!(
                                    "Sync tool unavailable ({}), continuing with cached dependencies (auto mode)",
                                    program
                                ),
                                RuntimeKind::Python,
                            ));
                            launch_logs.push(format!(
                                "{} not available for sync, skipped in auto mode",
                                program
                            ));
                            let mut next_cache = RuntimeLaunchCache::default();
                            next_cache.fingerprint = fingerprint;
                            next_cache.last_prepare_ok = true;
                            next_cache.last_sync_ok = false;
                            next_cache.selected_manager = Some(manager.as_str().to_string());
                            next_cache.resolved_binary_path = Some(interpreter.clone());
                            return Ok(DriverResult {
                                manager: Some(manager.as_str().to_string()),
                                interpreter_override: Some(interpreter),
                                launch_logs,
                                events,
                                plan_steps,
                                next_cache,
                            });
                        }
                    };
                    launch_logs.push(format!("> {} {}", program, args.join(" ")));
                    launch_logs.extend(lines.clone());
                    if !ok {
                        if ctx.policy == ExecutionPolicy::Always {
                            return Err(OrchestratorError::StageFailed {
                                stage: PipelineStage::Sync.as_str().to_string(),
                                reason: "dependency sync failed".to_string(),
                                command: Some(format!("{} {}", program, args.join(" "))),
                                cwd: Some(cwd.to_string_lossy().to_string()),
                                stderr: Some(lines.join("\n")),
                            });
                        }
                        events.push(stage_event(
                            PipelineStage::Sync,
                            "warn",
                            "Sync failed, continuing with cached dependencies (auto mode)",
                            RuntimeKind::Python,
                        ));
                        let mut next_cache = RuntimeLaunchCache::default();
                        next_cache.fingerprint = fingerprint;
                        next_cache.last_prepare_ok = true;
                        next_cache.last_sync_ok = false;
                        next_cache.selected_manager = Some(manager.as_str().to_string());
                        next_cache.resolved_binary_path = Some(interpreter.clone());
                        return Ok(DriverResult {
                            manager: Some(manager.as_str().to_string()),
                            interpreter_override: Some(interpreter),
                            launch_logs,
                            events,
                            plan_steps,
                            next_cache,
                        });
                    }
                    events.push(stage_event(
                        PipelineStage::Sync,
                        "ok",
                        "Syncing dependencies",
                        RuntimeKind::Python,
                    ));
                }
            }
        } else {
            events.push(stage_event(
                PipelineStage::Sync,
                "ok",
                "Dependencies up to date",
                RuntimeKind::Python,
            ));
        }

        let mut next_cache = RuntimeLaunchCache::default();
        next_cache.fingerprint = fingerprint;
        next_cache.last_prepare_ok = true;
        next_cache.last_sync_ok = true;
        next_cache.selected_manager = Some(manager.as_str().to_string());
        next_cache.resolved_binary_path = Some(interpreter.clone());
        next_cache.last_success_unix_ms = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        );

        Ok(DriverResult {
            manager: Some(manager.as_str().to_string()),
            interpreter_override: Some(interpreter),
            launch_logs,
            events,
            plan_steps,
            next_cache,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launcher::driver::DriverContext;
    use crate::launcher::types::{ExecutionPolicy, LaunchRequest};

    fn mk_temp_dir(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "varlock_launcher_python_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    fn create_minimal_venv(dir: &Path) {
        let venv = dir.join(".venv");
        std::fs::create_dir_all(&venv).expect("mkdir .venv");
        std::fs::write(venv.join("pyvenv.cfg"), "").expect("write cfg");
        let py = python_binary_for_venv(&venv);
        let parent = py.parent().expect("py parent");
        std::fs::create_dir_all(parent).expect("mkdir py parent");
        std::fs::write(py, "").expect("write py");
    }

    #[test]
    fn python_sync_failure_is_soft_in_auto_mode() {
        let dir = mk_temp_dir("soft_sync_fail");
        std::fs::write(dir.join("requirements.txt"), "fastapi\n").expect("write req");
        create_minimal_venv(&dir);

        let driver = PythonRuntimeDriver {
            overrides: PythonOverrides {
                manager: Some("pip".to_string()),
                venv_path: Some(".venv".to_string()),
                install_command: Some("exit 1".to_string()),
                preferred_interpreter_path: None,
            },
        };
        let ctx = DriverContext {
            request: LaunchRequest {
                root_cwd: dir.to_string_lossy().to_string(),
                scoped_cwd: dir.to_string_lossy().to_string(),
                raw_command: "python main.py".to_string(),
                source: Some("python".to_string()),
                interpreter_override: None,
                requires_venv: true,
                policy_override: None,
            },
            policy: ExecutionPolicy::Auto,
            cached: RuntimeLaunchCache::default(),
        };

        let result = driver
            .execute(&dir, ctx)
            .expect("soft fail should continue");
        assert!(result.events.iter().any(|e| e.status == "warn"));
        assert!(!result.next_cache.last_sync_ok);
    }

    #[test]
    fn python_sync_failure_is_hard_in_always_mode() {
        let dir = mk_temp_dir("hard_sync_fail");
        std::fs::write(dir.join("requirements.txt"), "fastapi\n").expect("write req");
        create_minimal_venv(&dir);

        let driver = PythonRuntimeDriver {
            overrides: PythonOverrides {
                manager: Some("pip".to_string()),
                venv_path: Some(".venv".to_string()),
                install_command: Some("exit 1".to_string()),
                preferred_interpreter_path: None,
            },
        };
        let ctx = DriverContext {
            request: LaunchRequest {
                root_cwd: dir.to_string_lossy().to_string(),
                scoped_cwd: dir.to_string_lossy().to_string(),
                raw_command: "python main.py".to_string(),
                source: Some("python".to_string()),
                interpreter_override: None,
                requires_venv: true,
                policy_override: None,
            },
            policy: ExecutionPolicy::Always,
            cached: RuntimeLaunchCache::default(),
        };

        let err = driver
            .execute(&dir, ctx)
            .expect_err("always mode should hard fail");
        match err {
            OrchestratorError::StageFailed { stage, .. } => {
                assert_eq!(stage, "sync");
            }
            _ => panic!("expected stage failure"),
        }
    }
}
