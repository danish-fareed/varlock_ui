use crate::launcher::cache::RuntimeLaunchCache;
use crate::launcher::config::NodeOverrides;
use crate::launcher::driver::{stage_event, DriverContext, DriverResult, RuntimeDriver};
use crate::launcher::fingerprint::node_fingerprint;
use crate::launcher::types::{
    CommandStep, ExecutionPolicy, OrchestratorError, PipelineStage, RuntimeKind,
};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
enum NodeManager {
    Pnpm,
    Yarn,
    Npm,
    Bun,
}

impl NodeManager {
    fn as_str(&self) -> &'static str {
        match self {
            NodeManager::Pnpm => "pnpm",
            NodeManager::Yarn => "yarn",
            NodeManager::Npm => "npm",
            NodeManager::Bun => "bun",
        }
    }

    fn executable_name(&self) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            match self {
                NodeManager::Pnpm => "pnpm.cmd",
                NodeManager::Yarn => "yarn.cmd",
                NodeManager::Npm => "npm.cmd",
                NodeManager::Bun => "bun.exe",
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            self.as_str()
        }
    }
}

fn detect_manager(cwd: &Path, cfg: &NodeOverrides) -> NodeManager {
    if let Some(explicit) = cfg.manager.as_deref() {
        return match explicit.to_lowercase().as_str() {
            "pnpm" => NodeManager::Pnpm,
            "yarn" => NodeManager::Yarn,
            "bun" => NodeManager::Bun,
            _ => NodeManager::Npm,
        };
    }
    if cwd.join("pnpm-lock.yaml").is_file() {
        return NodeManager::Pnpm;
    }
    if cwd.join("yarn.lock").is_file() {
        return NodeManager::Yarn;
    }
    if cwd.join("bun.lock").is_file() || cwd.join("bun.lockb").is_file() {
        return NodeManager::Bun;
    }
    NodeManager::Npm
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

fn install_cmd(manager: &NodeManager, cfg: &NodeOverrides, cwd: &Path) -> (String, Vec<String>) {
    if let Some(custom) = cfg.install_command.as_deref() {
        if cfg!(windows) {
            return (
                "cmd".to_string(),
                vec!["/C".to_string(), custom.to_string()],
            );
        }
        return ("sh".to_string(), vec!["-c".to_string(), custom.to_string()]);
    }
    match manager {
        NodeManager::Pnpm => (
            manager.executable_name().to_string(),
            vec!["install".to_string()],
        ),
        NodeManager::Yarn => (
            manager.executable_name().to_string(),
            vec!["install".to_string()],
        ),
        NodeManager::Bun => (
            manager.executable_name().to_string(),
            vec!["install".to_string()],
        ),
        NodeManager::Npm => (
            manager.executable_name().to_string(),
            if cwd.join("package-lock.json").is_file() {
                vec!["ci".to_string()]
            } else {
                vec!["install".to_string()]
            },
        ),
    }
}

pub struct NodeRuntimeDriver {
    pub overrides: NodeOverrides,
}

impl RuntimeDriver for NodeRuntimeDriver {
    fn runtime(&self) -> RuntimeKind {
        RuntimeKind::Node
    }

    fn execute(&self, cwd: &Path, ctx: DriverContext) -> Result<DriverResult, OrchestratorError> {
        let manager = detect_manager(cwd, &self.overrides);
        let mut events = Vec::new();
        let mut launch_logs = Vec::new();
        let mut plan_steps = Vec::new();

        events.push(stage_event(
            PipelineStage::Detect,
            "ok",
            format!("Node manager: {}", manager.as_str()),
            RuntimeKind::Node,
        ));
        events.push(stage_event(
            PipelineStage::Prepare,
            "ok",
            "Node runtime ready",
            RuntimeKind::Node,
        ));

        let fingerprint = node_fingerprint(cwd);
        let should_sync = match ctx.policy {
            ExecutionPolicy::Never => false,
            ExecutionPolicy::Always => true,
            ExecutionPolicy::Auto => {
                !ctx.cached.last_prepare_ok
                    || !ctx.cached.last_sync_ok
                    || fingerprint != ctx.cached.fingerprint
            }
        };

        if should_sync {
            let (program, args) = install_cmd(&manager, &self.overrides, cwd);
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
                        RuntimeKind::Node,
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
                    next_cache.resolved_binary_path = which::which(manager.executable_name())
                        .ok()
                        .map(|path| path.to_string_lossy().to_string());
                    return Ok(DriverResult {
                        manager: Some(manager.as_str().to_string()),
                        interpreter_override: ctx.request.interpreter_override,
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
                    RuntimeKind::Node,
                ));
                let mut next_cache = RuntimeLaunchCache::default();
                next_cache.fingerprint = fingerprint;
                next_cache.last_prepare_ok = true;
                next_cache.last_sync_ok = false;
                next_cache.selected_manager = Some(manager.as_str().to_string());
                next_cache.resolved_binary_path = which::which(manager.executable_name())
                    .ok()
                    .map(|path| path.to_string_lossy().to_string());
                return Ok(DriverResult {
                    manager: Some(manager.as_str().to_string()),
                    interpreter_override: ctx.request.interpreter_override,
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
                RuntimeKind::Node,
            ));
        } else {
            events.push(stage_event(
                PipelineStage::Sync,
                "ok",
                "Dependencies up to date",
                RuntimeKind::Node,
            ));
        }

        let mut next_cache = RuntimeLaunchCache::default();
        next_cache.fingerprint = fingerprint;
        next_cache.last_prepare_ok = true;
        next_cache.last_sync_ok = true;
        next_cache.selected_manager = Some(manager.as_str().to_string());
        next_cache.resolved_binary_path = which::which(manager.executable_name())
            .ok()
            .map(|path| path.to_string_lossy().to_string());
        next_cache.last_success_unix_ms = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        );

        Ok(DriverResult {
            manager: Some(manager.as_str().to_string()),
            interpreter_override: ctx.request.interpreter_override,
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
            "varlock_launcher_node_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn node_sync_failure_is_soft_in_auto_mode() {
        let dir = mk_temp_dir("soft_sync_fail");
        std::fs::write(dir.join("package.json"), "{\"name\":\"app\"}\n").expect("write pkg");
        std::fs::write(dir.join("package-lock.json"), "{\"lockfileVersion\":3}\n")
            .expect("write lock");

        let driver = NodeRuntimeDriver {
            overrides: NodeOverrides {
                manager: Some("npm".to_string()),
                install_command: Some("exit 1".to_string()),
            },
        };
        let ctx = DriverContext {
            request: LaunchRequest {
                root_cwd: dir.to_string_lossy().to_string(),
                scoped_cwd: dir.to_string_lossy().to_string(),
                raw_command: "npm run dev".to_string(),
                source: Some("workspace command".to_string()),
                interpreter_override: None,
                requires_venv: false,
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
    fn node_sync_failure_is_hard_in_always_mode() {
        let dir = mk_temp_dir("hard_sync_fail");
        std::fs::write(dir.join("package.json"), "{\"name\":\"app\"}\n").expect("write pkg");
        std::fs::write(dir.join("package-lock.json"), "{\"lockfileVersion\":3}\n")
            .expect("write lock");

        let driver = NodeRuntimeDriver {
            overrides: NodeOverrides {
                manager: Some("npm".to_string()),
                install_command: Some("exit 1".to_string()),
            },
        };
        let ctx = DriverContext {
            request: LaunchRequest {
                root_cwd: dir.to_string_lossy().to_string(),
                scoped_cwd: dir.to_string_lossy().to_string(),
                raw_command: "npm run dev".to_string(),
                source: Some("workspace command".to_string()),
                interpreter_override: None,
                requires_venv: false,
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
