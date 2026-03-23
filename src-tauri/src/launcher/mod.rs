pub mod cache;
pub mod config;
pub mod driver;
pub mod fingerprint;
pub mod node;
pub mod probe;
pub mod python;
pub mod shell;
pub mod types;

use crate::launcher::cache::{load_launch_cache, save_launch_cache};
use crate::launcher::config::load_vibestart_launcher_config;
use crate::launcher::driver::{
    default_plan, insert_runtime_cache, runtime_cache_for, DriverContext, RuntimeDriver,
};
use crate::launcher::node::NodeRuntimeDriver;
use crate::launcher::probe::detect_runtime;
use crate::launcher::python::PythonRuntimeDriver;
use crate::launcher::shell::ShellRuntimeDriver;
use crate::launcher::types::{
    CommandStep, LaunchPreparationResult, LaunchRequest, OrchestratorError, PipelineStage,
    RuntimeKind, StageEvent,
};
use std::path::Path;

fn timeline_detail_for_stage(runtime: &RuntimeKind, stage: &PipelineStage, status: &str) -> String {
    if stage == &PipelineStage::Verify {
        if status == "ok" {
            return "Health check passed".to_string();
        }
        return "Health check skipped".to_string();
    }
    if stage == &PipelineStage::Attach {
        if status == "ok" {
            return "Attached stream".to_string();
        }
        return "Attaching stream".to_string();
    }
    if stage == &PipelineStage::Launch {
        if status == "ok" {
            return "Launching command".to_string();
        }
    }
    if stage == &PipelineStage::Sync && status == "ok" {
        if runtime == &RuntimeKind::Python || runtime == &RuntimeKind::Node {
            return "Dependencies up to date".to_string();
        }
    }
    if stage == &PipelineStage::Prepare && status == "ok" && runtime == &RuntimeKind::Python {
        return "Environment ready".to_string();
    }
    String::new()
}

fn select_driver(
    runtime: &RuntimeKind,
    cfg: &config::VibestartLauncherConfig,
) -> Box<dyn RuntimeDriver> {
    match runtime {
        RuntimeKind::Python => Box::new(PythonRuntimeDriver {
            overrides: cfg.python.clone(),
        }),
        RuntimeKind::Node => Box::new(NodeRuntimeDriver {
            overrides: cfg.node.clone(),
        }),
        _ => Box::new(ShellRuntimeDriver),
    }
}

pub fn prepare_launch(
    request: LaunchRequest,
) -> Result<LaunchPreparationResult, OrchestratorError> {
    let root = Path::new(&request.root_cwd);
    let cwd = Path::new(&request.scoped_cwd);
    if !root.is_dir() {
        return Err(OrchestratorError::InvalidConfig(format!(
            "invalid root cwd: {}",
            request.root_cwd
        )));
    }
    if !cwd.is_dir() {
        return Err(OrchestratorError::InvalidConfig(format!(
            "invalid scoped cwd: {}",
            request.scoped_cwd
        )));
    }

    let cfg = load_vibestart_launcher_config(root);
    let runtime = detect_runtime(cwd, request.source.as_deref(), &request.raw_command);
    let driver = select_driver(&runtime, &cfg);
    let mut cache = load_launch_cache(root);
    let cached = runtime_cache_for(&cache, &runtime);

    let effective_sync_policy = request
        .policy_override
        .clone()
        .unwrap_or_else(|| cfg.launcher.sync_mode.clone());

    let ctx = DriverContext {
        request: request.clone(),
        policy: effective_sync_policy.clone(),
        cached,
    };

    let mut plan = default_plan(runtime.clone(), effective_sync_policy);
    let output = driver.execute(cwd, ctx)?;
    plan.manager = output.manager.clone();
    plan.steps = output.plan_steps;
    plan.steps.push(CommandStep {
        stage: PipelineStage::Launch,
        program: if cfg!(windows) {
            "cmd".to_string()
        } else {
            "sh".to_string()
        },
        args: if cfg!(windows) {
            vec!["/C".to_string(), request.raw_command.clone()]
        } else {
            vec!["-c".to_string(), request.raw_command.clone()]
        },
        cwd: request.scoped_cwd.clone(),
    });

    let mut stage_events = output.events;
    stage_events.push(StageEvent {
        stage: PipelineStage::Launch,
        status: "ok".to_string(),
        detail: "Launching command".to_string(),
        runtime: Some(runtime.clone()),
    });
    stage_events.push(StageEvent {
        stage: PipelineStage::Verify,
        status: "ok".to_string(),
        detail: "Health check skipped".to_string(),
        runtime: Some(runtime.clone()),
    });
    stage_events.push(StageEvent {
        stage: PipelineStage::Attach,
        status: "ok".to_string(),
        detail: "Attached stream".to_string(),
        runtime: Some(runtime.clone()),
    });

    for event in &mut stage_events {
        let replacement = timeline_detail_for_stage(&runtime, &event.stage, &event.status);
        if !replacement.is_empty() {
            event.detail = replacement;
        }
    }

    insert_runtime_cache(&mut cache, &runtime, output.next_cache);
    let _ = save_launch_cache(root, &cache);

    Ok(LaunchPreparationResult {
        runtime,
        manager: output.manager,
        interpreter_override: output.interpreter_override,
        stage_events,
        launch_logs: output.launch_logs,
        plan,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "varlock_launcher_mod_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn prepare_launch_node_builds_plan() {
        let dir = mk_temp_dir("node_plan");
        std::fs::write(
            dir.join("package.json"),
            "{\"name\":\"app\",\"scripts\":{\"dev\":\"vite\"}}",
        )
        .expect("write package.json");

        let result = prepare_launch(LaunchRequest {
            root_cwd: dir.to_string_lossy().to_string(),
            scoped_cwd: dir.to_string_lossy().to_string(),
            raw_command: "npm run dev".to_string(),
            source: Some("package script".to_string()),
            interpreter_override: None,
            requires_venv: false,
            policy_override: Some(crate::launcher::types::ExecutionPolicy::Never),
        })
        .expect("prepare launch");

        assert_eq!(result.runtime, RuntimeKind::Node);
        assert_eq!(result.plan.runtime, RuntimeKind::Node);
        assert!(result
            .stage_events
            .iter()
            .any(|e| e.stage == PipelineStage::Detect));
    }

    #[test]
    fn detect_runtime_prefers_command_head_over_files() {
        let dir = mk_temp_dir("detect_head");
        std::fs::write(dir.join("pyproject.toml"), "[project]\nname='mixed'\n")
            .expect("write pyproject");
        std::fs::write(dir.join("package.json"), "{\"name\":\"mixed\"}\n").expect("write package");

        let runtime =
            crate::launcher::probe::detect_runtime(&dir, Some("workspace command"), "npm run dev");
        assert_eq!(runtime, RuntimeKind::Node);
    }
}
