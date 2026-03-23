use crate::launcher::types::RuntimeKind;
use std::path::Path;

fn command_head(raw_command: &str) -> Option<String> {
    let parts = shell_words::split(raw_command).ok()?;
    parts.first().map(|v| v.to_lowercase())
}

pub fn detect_runtime(cwd: &Path, source: Option<&str>, raw_command: &str) -> RuntimeKind {
    let raw_l = raw_command.to_lowercase();
    if raw_l.starts_with("docker compose") || raw_l.starts_with("docker-compose") {
        return RuntimeKind::DockerCompose;
    }

    if let Some(head) = command_head(raw_command) {
        if matches!(
            head.as_str(),
            "npm" | "pnpm" | "yarn" | "bun" | "node" | "npx"
        ) {
            return RuntimeKind::Node;
        }
        if matches!(
            head.as_str(),
            "python"
                | "python3"
                | "py"
                | "pip"
                | "uv"
                | "poetry"
                | "pdm"
                | "pytest"
                | "uvicorn"
                | "gunicorn"
        ) {
            return RuntimeKind::Python;
        }
        if head == "cargo" {
            return RuntimeKind::Rust;
        }
        if head == "go" {
            return RuntimeKind::Go;
        }
    }

    if let Some(src) = source {
        let src_l = src.to_lowercase();
        if src_l.contains("python") {
            return RuntimeKind::Python;
        }
        if src_l.contains("compose") {
            return RuntimeKind::DockerCompose;
        }
        if src_l.contains("node")
            || src_l.contains("package")
            || src_l.contains("workspace command")
        {
            return RuntimeKind::Node;
        }
    }

    if cwd.join("docker-compose.yml").is_file() || cwd.join("docker-compose.yaml").is_file() {
        return RuntimeKind::DockerCompose;
    }
    if cwd.join("requirements.txt").is_file()
        || cwd.join("pyproject.toml").is_file()
        || cwd.join("uv.lock").is_file()
        || cwd.join("poetry.lock").is_file()
        || cwd.join("pdm.lock").is_file()
    {
        return RuntimeKind::Python;
    }
    if cwd.join("package.json").is_file() {
        return RuntimeKind::Node;
    }
    if cwd.join("Cargo.toml").is_file() {
        return RuntimeKind::Rust;
    }
    if cwd.join("go.mod").is_file() {
        return RuntimeKind::Go;
    }

    RuntimeKind::Shell
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "varlock_launcher_probe_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn detects_node_for_workspace_command_in_mixed_repo() {
        let dir = mk_temp_dir("workspace_node");
        std::fs::write(dir.join("pyproject.toml"), "[project]\nname='mixed'\n")
            .expect("write pyproject");
        std::fs::write(dir.join("package.json"), "{\"name\":\"mixed\"}\n").expect("write package");

        let runtime = detect_runtime(&dir, Some("workspace command"), "npm run dev");
        assert_eq!(runtime, RuntimeKind::Node);
    }

    #[test]
    fn detects_python_for_python_command() {
        let dir = mk_temp_dir("python_cmd");
        std::fs::write(dir.join("package.json"), "{\"name\":\"mixed\"}\n").expect("write package");

        let runtime = detect_runtime(&dir, Some("package script"), "python -m uvicorn app:app");
        assert_eq!(runtime, RuntimeKind::Python);
    }
}
