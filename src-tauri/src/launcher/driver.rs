use crate::launcher::cache::{LaunchCache, RuntimeLaunchCache};
use crate::launcher::types::{
    CommandExecutionPlan, CommandStep, ExecutionPolicy, LaunchRequest, OrchestratorError,
    PipelineStage, RuntimeKind, StageEvent,
};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct DriverContext {
    pub request: LaunchRequest,
    pub policy: ExecutionPolicy,
    pub cached: RuntimeLaunchCache,
}

#[derive(Debug, Clone)]
pub struct DriverResult {
    pub manager: Option<String>,
    pub interpreter_override: Option<String>,
    pub launch_logs: Vec<String>,
    pub events: Vec<StageEvent>,
    pub plan_steps: Vec<CommandStep>,
    pub next_cache: RuntimeLaunchCache,
}

pub trait RuntimeDriver {
    fn runtime(&self) -> RuntimeKind;
    fn execute(&self, cwd: &Path, ctx: DriverContext) -> Result<DriverResult, OrchestratorError>;
}

pub fn default_plan(runtime: RuntimeKind, policy: ExecutionPolicy) -> CommandExecutionPlan {
    CommandExecutionPlan {
        plan_id: uuid::Uuid::new_v4().to_string(),
        runtime,
        manager: None,
        policy,
        steps: Vec::new(),
    }
}

pub fn runtime_cache_for(cache: &LaunchCache, runtime: &RuntimeKind) -> RuntimeLaunchCache {
    cache
        .runtimes
        .get(runtime.as_str())
        .cloned()
        .unwrap_or_default()
}

pub fn insert_runtime_cache(
    cache: &mut LaunchCache,
    runtime: &RuntimeKind,
    value: RuntimeLaunchCache,
) {
    cache.runtimes.insert(runtime.as_str().to_string(), value);
}

pub fn stage_event(
    stage: PipelineStage,
    status: &str,
    detail: impl Into<String>,
    runtime: RuntimeKind,
) -> StageEvent {
    StageEvent {
        stage,
        status: status.to_string(),
        detail: detail.into(),
        runtime: Some(runtime),
    }
}
