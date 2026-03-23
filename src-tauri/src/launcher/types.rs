use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineStage {
    Detect,
    Prepare,
    Sync,
    Launch,
    Verify,
    Attach,
    Recover,
}

impl PipelineStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            PipelineStage::Detect => "detect",
            PipelineStage::Prepare => "prepare",
            PipelineStage::Sync => "sync",
            PipelineStage::Launch => "launch",
            PipelineStage::Verify => "verify",
            PipelineStage::Attach => "attach",
            PipelineStage::Recover => "recover",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionPolicy {
    Auto,
    Always,
    Never,
}

impl Default for ExecutionPolicy {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeKind {
    Python,
    Node,
    Rust,
    Go,
    DockerCompose,
    Shell,
}

impl RuntimeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            RuntimeKind::Python => "python",
            RuntimeKind::Node => "node",
            RuntimeKind::Rust => "rust",
            RuntimeKind::Go => "go",
            RuntimeKind::DockerCompose => "docker-compose",
            RuntimeKind::Shell => "shell",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageEvent {
    pub stage: PipelineStage,
    pub status: String,
    pub detail: String,
    pub runtime: Option<RuntimeKind>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandStep {
    pub stage: PipelineStage,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionPlan {
    pub plan_id: String,
    pub runtime: RuntimeKind,
    pub manager: Option<String>,
    pub policy: ExecutionPolicy,
    pub steps: Vec<CommandStep>,
}

#[derive(Debug, Clone)]
pub struct LaunchRequest {
    pub root_cwd: String,
    pub scoped_cwd: String,
    pub raw_command: String,
    pub source: Option<String>,
    pub interpreter_override: Option<String>,
    pub requires_venv: bool,
    pub policy_override: Option<ExecutionPolicy>,
}

#[derive(Debug, Clone)]
pub struct LaunchPreparationResult {
    pub runtime: RuntimeKind,
    pub manager: Option<String>,
    pub interpreter_override: Option<String>,
    pub stage_events: Vec<StageEvent>,
    pub launch_logs: Vec<String>,
    pub plan: CommandExecutionPlan,
}

#[derive(Debug, thiserror::Error)]
pub enum OrchestratorError {
    #[error("{stage} failed: {reason}")]
    StageFailed {
        stage: String,
        reason: String,
        command: Option<String>,
        cwd: Option<String>,
        stderr: Option<String>,
    },
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
