use crate::launcher::cache::RuntimeLaunchCache;
use crate::launcher::driver::{stage_event, DriverContext, DriverResult, RuntimeDriver};
use crate::launcher::types::{OrchestratorError, PipelineStage, RuntimeKind};
use std::path::Path;

pub struct ShellRuntimeDriver;

impl RuntimeDriver for ShellRuntimeDriver {
    fn runtime(&self) -> RuntimeKind {
        RuntimeKind::Shell
    }

    fn execute(&self, _cwd: &Path, ctx: DriverContext) -> Result<DriverResult, OrchestratorError> {
        let events = vec![
            stage_event(
                PipelineStage::Detect,
                "ok",
                "Using shell driver",
                RuntimeKind::Shell,
            ),
            stage_event(
                PipelineStage::Prepare,
                "ok",
                "No preparation required",
                RuntimeKind::Shell,
            ),
            stage_event(
                PipelineStage::Sync,
                "ok",
                "No dependency sync required",
                RuntimeKind::Shell,
            ),
        ];

        let mut next_cache = RuntimeLaunchCache::default();
        next_cache.last_prepare_ok = true;
        next_cache.last_sync_ok = true;
        next_cache.last_success_unix_ms = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        );

        Ok(DriverResult {
            manager: None,
            interpreter_override: ctx.request.interpreter_override,
            launch_logs: Vec::new(),
            events,
            plan_steps: Vec::new(),
            next_cache,
        })
    }
}
