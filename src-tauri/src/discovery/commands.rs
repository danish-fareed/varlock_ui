use crate::discovery::detector::{detect_topology, normalize_rel_path};
use crate::discovery::python::{detect_python_environment, get_preferred_python_interpreter};
use crate::discovery::types::{
    CloudJobConfig, CommandType, DiscoveredCommand, EnvScope, ProjectNode, ProjectNodeType,
    ProjectScan, ProjectTopology, RuntimeKind,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum DiscoverError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("topology error: {0}")]
    Topology(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommand {
    pub name: String,
    pub command: String,
    pub category: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct VibestartConfig {
    #[serde(default)]
    commands: Vec<CustomCommand>,
}

fn short_hash(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    digest[..10].iter().map(|b| format!("{:02x}", b)).collect()
}

fn is_shell_chain(raw: &str) -> bool {
    raw.contains("&&") || raw.contains("||") || raw.contains(';')
}

fn parse_command(raw: &str) -> (String, Vec<String>) {
    if is_shell_chain(raw) {
        if cfg!(windows) {
            return ("cmd".to_string(), vec!["/C".to_string(), raw.to_string()]);
        }
        return ("sh".to_string(), vec!["-lc".to_string(), raw.to_string()]);
    }
    match shell_words::split(raw) {
        Ok(parts) if !parts.is_empty() => (parts[0].clone(), parts[1..].to_vec()),
        _ => {
            if cfg!(windows) {
                ("cmd".to_string(), vec!["/C".to_string(), raw.to_string()])
            } else {
                ("sh".to_string(), vec!["-lc".to_string(), raw.to_string()])
            }
        }
    }
}

fn category_sort_order(category: &str) -> i32 {
    match category {
        "local-process" => 0,
        "orchestrator" => 1,
        "cloud-job" => 2,
        "one-shot" => 3,
        _ => 4,
    }
}

fn category_from_type(t: &CommandType) -> String {
    match t {
        CommandType::LocalProcess => "local-process".to_string(),
        CommandType::OneShot => "one-shot".to_string(),
        CommandType::CloudJob => "cloud-job".to_string(),
        CommandType::Orchestrator => "orchestrator".to_string(),
    }
}

fn humanize_name(key: &str) -> String {
    key.replace(':', " ")
        .replace('-', " ")
        .replace('_', " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn infer_uvicorn_target(node_path: &Path) -> String {
    if node_path.join("app/main.py").exists() {
        return "app.main:app".to_string();
    }
    if node_path.join("main.py").exists() {
        return "main:app".to_string();
    }
    if node_path.join("app.py").exists() {
        return "app:app".to_string();
    }
    if node_path.join("src/main.py").exists() {
        return "src.main:app".to_string();
    }
    if node_path.join("src/app.py").exists() {
        return "src.app:app".to_string();
    }
    if node_path.join("server.py").exists() {
        return "server:app".to_string();
    }
    "app:app".to_string()
}

fn classify_raw_command(
    script_name: &str,
    raw: &str,
    source_file: &str,
) -> (CommandType, Option<CloudJobConfig>) {
    let script_lower = script_name.to_lowercase();
    let raw_lower = raw.to_lowercase();

    if source_file.contains("docker-compose")
        || raw_lower.starts_with("docker compose up")
        || raw_lower.starts_with("docker-compose up")
        || raw_lower == "foreman start"
        || raw_lower == "honcho start"
    {
        return (CommandType::Orchestrator, None);
    }

    if (raw_lower.starts_with("eas build") && !raw_lower.contains("--local"))
        || raw_lower.starts_with("eas submit")
        || raw_lower.starts_with("vercel deploy")
    {
        let provider = if raw_lower.starts_with("vercel") {
            "vercel"
        } else {
            "eas"
        };
        return (
            CommandType::CloudJob,
            Some(CloudJobConfig {
                provider: provider.to_string(),
                submit_parser_regex: r"(?i)(build|deployment)\s*(id)?\s*[:=]\s*([A-Za-z0-9_-]+)"
                    .to_string(),
                job_id_field_name: "jobId".to_string(),
                status_command_template: "".to_string(),
                log_url_template: if provider == "vercel" {
                    "https://vercel.com/dashboard/deployments/{job_id}".to_string()
                } else {
                    "https://expo.dev/accounts/{account}/projects/{project}/builds/{job_id}"
                        .to_string()
                },
                poll_interval_ms: 5000,
            }),
        );
    }

    if matches!(script_lower.as_str(), "dev" | "start" | "serve" | "watch")
        || raw_lower.contains("expo start")
        || raw_lower.contains("next dev")
        || raw_lower.contains("vite")
        || raw_lower.contains("uvicorn --reload")
        || raw_lower.contains("gunicorn --reload")
        || raw_lower.contains("jest --watch")
        || raw_lower.contains("webpack --watch")
    {
        return (CommandType::LocalProcess, None);
    }

    if raw_lower.starts_with("eas build") && raw_lower.contains("--local") {
        return (CommandType::OneShot, None);
    }

    if matches!(
        script_lower.as_str(),
        "build" | "test" | "lint" | "typecheck" | "migrate" | "format" | "ci"
    ) {
        return (CommandType::OneShot, None);
    }

    (CommandType::OneShot, None)
}

fn find_scope<'a>(node: &ProjectNode, scopes: &'a [EnvScope]) -> Option<&'a EnvScope> {
    scopes.iter().find(|s| s.scope_path == node.rel_path)
}

fn make_command_id(
    project_id: &str,
    node_id: &str,
    name: &str,
    command: &str,
    args: &[String],
) -> String {
    let payload = format!(
        "{}|{}|{}|{}|{}",
        project_id,
        node_id,
        name,
        command,
        args.join("\u{1f}")
    );
    format!("cmd:{}", short_hash(&payload))
}

fn qualify_collisions(commands: &mut [DiscoveredCommand], nodes: &[ProjectNode]) {
    let mut count = HashMap::<String, usize>::new();
    for cmd in commands.iter() {
        *count.entry(cmd.name.clone()).or_insert(0) += 1;
    }
    let node_map: HashMap<String, String> = nodes
        .iter()
        .map(|n| (n.id.clone(), n.rel_path.clone()))
        .collect();

    for cmd in commands.iter_mut() {
        if count.get(&cmd.name).copied().unwrap_or(0) > 1 {
            let scope = node_map
                .get(&cmd.node_id)
                .cloned()
                .unwrap_or_else(|| ".".to_string());
            let suffix = if scope == "." { "root" } else { &scope };
            cmd.name = format!("{} ({})", cmd.name, suffix);
        }
    }
}

fn discover_node_commands(node: &ProjectNode, scopes: &[EnvScope]) -> Vec<DiscoveredCommand> {
    let node_path = PathBuf::from(&node.path);
    let mut out = Vec::new();
    let scope = find_scope(node, scopes).cloned().unwrap_or(EnvScope {
        scope_path: node.rel_path.clone(),
        files: Vec::new(),
        active_env_name: "default".to_string(),
        has_varlock: false,
        is_plain_dotenv: false,
    });

    if node.runtimes.contains(&RuntimeKind::Node) {
        let pkg = node_path.join("package.json");
        if let Ok(content) = fs::read_to_string(pkg) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) {
                    for (script, value) in scripts {
                        let raw = value.as_str().unwrap_or("");
                        let (kind, cloud_cfg) = classify_raw_command(script, raw, "package.json");
                        let (command, args) = parse_command(&format!("npm run {}", script));
                        let source = if node.node_type == ProjectNodeType::MonorepoRoot {
                            "workspace command"
                        } else {
                            "package script"
                        };
                        let id =
                            make_command_id(&node.project_id, &node.id, script, &command, &args);
                        out.push(DiscoveredCommand {
                            id,
                            project_id: node.project_id.clone(),
                            node_id: node.id.clone(),
                            name: humanize_name(script),
                            command,
                            args: args.clone(),
                            source: source.to_string(),
                            source_file: "package.json".to_string(),
                            command_type: kind.clone(),
                            cwd_override: node.rel_path.clone(),
                            interpreter_override: None,
                            requires_venv: false,
                            cloud_job_config: cloud_cfg,
                            env_scope: scope.clone(),
                            command_fingerprint: short_hash(&format!("{}|{}", script, raw)),
                            raw_cmd: format!("npm run {}", script),
                            category: category_from_type(&kind),
                            sort_order: category_sort_order(&category_from_type(&kind)),
                            is_custom: false,
                        });
                    }
                }
            }
        }
    }

    if node.runtimes.contains(&RuntimeKind::Python) {
        let has_requirements = node_path.join("requirements.txt").exists();
        let has_pyproject = node_path.join("pyproject.toml").exists();
        let pyproject_content = if has_pyproject {
            fs::read_to_string(node_path.join("pyproject.toml")).unwrap_or_default()
        } else {
            String::new()
        };
        let requirements_content = if has_requirements {
            fs::read_to_string(node_path.join("requirements.txt")).unwrap_or_default()
        } else {
            String::new()
        };
        let mut python_entries: Vec<(String, String, String)> = Vec::new();

        if node_path.join("manage.py").exists() {
            python_entries.push((
                "runserver".to_string(),
                "python manage.py runserver".to_string(),
                "manage.py".to_string(),
            ));
            python_entries.push((
                "migrate".to_string(),
                "python manage.py migrate".to_string(),
                "manage.py".to_string(),
            ));
        }

        if pyproject_content.contains("[tool.poetry.scripts]")
            || pyproject_content.contains("[project.scripts]")
        {
            python_entries.push((
                "install".to_string(),
                "pip install -e .".to_string(),
                "pyproject.toml".to_string(),
            ));
        }

        let py_lc = pyproject_content.to_lowercase();
        let req_lc = requirements_content.to_lowercase();
        let combined_lc = format!("{}\n{}", py_lc, req_lc);

        if combined_lc.contains("fastapi") || combined_lc.contains("uvicorn") {
            let app_target = infer_uvicorn_target(&node_path);
            python_entries.push((
                "dev".to_string(),
                format!("uvicorn {} --reload", app_target),
                "pyproject.toml".to_string(),
            ));
        } else if combined_lc.contains("flask") {
            python_entries.push((
                "dev".to_string(),
                "flask run --reload".to_string(),
                "pyproject.toml".to_string(),
            ));
        }

        if combined_lc.contains("pytest") {
            python_entries.push((
                "pytest".to_string(),
                "pytest".to_string(),
                "pyproject.toml".to_string(),
            ));
        }

        if combined_lc.contains("django") && node_path.join("manage.py").exists() {
            python_entries.push((
                "runserver".to_string(),
                "python manage.py runserver".to_string(),
                "manage.py".to_string(),
            ));
        }

        if node_path.join("main.py").exists()
            || node_path.join("app/main.py").exists()
            || node_path.join("app.py").exists()
            || node_path.join("server.py").exists()
        {
            let entry = if node_path.join("main.py").exists() {
                "main.py"
            } else if node_path.join("app/main.py").exists() {
                "app/main.py"
            } else if node_path.join("app.py").exists() {
                "app.py"
            } else {
                "server.py"
            };
            python_entries.push((
                "python".to_string(),
                format!("python {}", entry),
                entry.to_string(),
            ));
        }

        let has_pytest_cmd = python_entries.iter().any(|(_, raw, _)| raw == "pytest");
        if (has_requirements || has_pyproject) && !has_pytest_cmd {
            python_entries.push((
                "pytest".to_string(),
                "pytest".to_string(),
                "requirements.txt".to_string(),
            ));
        }

        for (name, raw, source_file) in python_entries {
            let (kind, cloud_cfg) = classify_raw_command(&name, &raw, &source_file);
            let (command, args) = parse_command(&raw);
            let id = make_command_id(&node.project_id, &node.id, &name, &command, &args);
            out.push(DiscoveredCommand {
                id,
                project_id: node.project_id.clone(),
                node_id: node.id.clone(),
                name: humanize_name(&name),
                command,
                args: args.clone(),
                source: "python".to_string(),
                source_file,
                command_type: kind.clone(),
                cwd_override: node.rel_path.clone(),
                interpreter_override: None,
                requires_venv: true,
                cloud_job_config: cloud_cfg,
                env_scope: scope.clone(),
                command_fingerprint: short_hash(&format!("{}|{}", name, raw)),
                raw_cmd: raw,
                category: category_from_type(&kind),
                sort_order: category_sort_order(&category_from_type(&kind)),
                is_custom: false,
            });
        }

        if let Some(preferred) = get_preferred_python_interpreter(&node_path, &node_path) {
            for cmd in out
                .iter_mut()
                .filter(|c| c.node_id == node.id && c.requires_venv)
            {
                cmd.interpreter_override = Some(preferred.clone());
            }
        } else if let Ok(py_env) = detect_python_environment(&node_path) {
            for cmd in out
                .iter_mut()
                .filter(|c| c.node_id == node.id && c.requires_venv)
            {
                cmd.interpreter_override = Some(py_env.interpreter.to_string_lossy().to_string());
            }
        } else if let Some(interpreter) = &node.python_interpreter_path {
            for cmd in out
                .iter_mut()
                .filter(|c| c.node_id == node.id && c.requires_venv)
            {
                cmd.interpreter_override = Some(interpreter.clone());
            }
        }
    }

    if node.runtimes.contains(&RuntimeKind::DockerCompose) {
        let compose = if node_path.join("docker-compose.yml").exists() {
            "docker-compose.yml"
        } else {
            "docker-compose.yaml"
        };
        let up = "docker compose up";
        let down = "docker compose down";
        let (c_up, a_up) = parse_command(up);
        let (c_down, a_down) = parse_command(down);
        for (name, raw, command, args) in [
            ("docker-up", up, c_up, a_up),
            ("docker-down", down, c_down, a_down),
        ] {
            let (kind, cloud_cfg) = classify_raw_command(name, raw, compose);
            let id = make_command_id(&node.project_id, &node.id, name, &command, &args);
            out.push(DiscoveredCommand {
                id,
                project_id: node.project_id.clone(),
                node_id: node.id.clone(),
                name: humanize_name(name),
                command,
                args: args.clone(),
                source: "compose".to_string(),
                source_file: compose.to_string(),
                command_type: kind.clone(),
                cwd_override: node.rel_path.clone(),
                interpreter_override: None,
                requires_venv: false,
                cloud_job_config: cloud_cfg,
                env_scope: scope.clone(),
                command_fingerprint: short_hash(&format!("{}|{}", name, raw)),
                raw_cmd: raw.to_string(),
                category: category_from_type(&kind),
                sort_order: category_sort_order(&category_from_type(&kind)),
                is_custom: false,
            });
        }
    }

    out
}

fn parse_vibestart(node: &ProjectNode, scope: &EnvScope) -> Vec<DiscoveredCommand> {
    let path = PathBuf::from(&node.path).join(".vibestart.json");
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let cfg: VibestartConfig = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    cfg.commands
        .iter()
        .map(|custom| {
            let (command, args) = parse_command(&custom.command);
            let (kind, cloud_cfg) =
                classify_raw_command(&custom.name, &custom.command, ".vibestart.json");
            let id = make_command_id(&node.project_id, &node.id, &custom.name, &command, &args);
            DiscoveredCommand {
                id,
                project_id: node.project_id.clone(),
                node_id: node.id.clone(),
                name: custom.name.clone(),
                command,
                args: args.clone(),
                source: "custom".to_string(),
                source_file: ".vibestart.json".to_string(),
                command_type: kind.clone(),
                cwd_override: node.rel_path.clone(),
                interpreter_override: None,
                requires_venv: false,
                cloud_job_config: cloud_cfg,
                env_scope: scope.clone(),
                command_fingerprint: short_hash(&format!("{}|{}", custom.name, custom.command)),
                raw_cmd: custom.command.clone(),
                category: custom.category.clone(),
                sort_order: category_sort_order(&custom.category),
                is_custom: true,
            }
        })
        .collect()
}

pub fn discover_commands(
    topology: &ProjectTopology,
) -> Result<Vec<DiscoveredCommand>, DiscoverError> {
    let mut out = Vec::new();
    let mut dedupe = HashSet::<String>::new();

    for node in &topology.nodes {
        let scope = topology
            .env_scopes
            .iter()
            .find(|s| s.scope_path == node.rel_path)
            .cloned()
            .unwrap_or(EnvScope {
                scope_path: node.rel_path.clone(),
                files: Vec::new(),
                active_env_name: "default".to_string(),
                has_varlock: false,
                is_plain_dotenv: false,
            });

        for cmd in discover_node_commands(node, &topology.env_scopes)
            .into_iter()
            .chain(parse_vibestart(node, &scope).into_iter())
        {
            if dedupe.insert(cmd.command_fingerprint.clone()) {
                out.push(cmd);
            }
        }
    }

    qualify_collisions(&mut out, &topology.nodes);
    out.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then(a.cwd_override.cmp(&b.cwd_override))
            .then(a.name.cmp(&b.name))
    });
    Ok(out)
}

fn detect_tech_stack(topology: &ProjectTopology) -> Vec<String> {
    let mut stack = BTreeMap::<String, usize>::new();
    for node in &topology.nodes {
        for runtime in &node.runtimes {
            let label = match runtime {
                RuntimeKind::Node => "Node.js",
                RuntimeKind::Python => "Python",
                RuntimeKind::DockerCompose => "Docker",
                RuntimeKind::Rust => "Rust",
                RuntimeKind::Go => "Go",
            };
            *stack.entry(label.to_string()).or_insert(0) += 1;
        }
    }
    stack.keys().cloned().collect()
}

fn root_env_info(root: &Path, scopes: &[EnvScope]) -> (String, Vec<String>, bool) {
    let root_scope = scopes.iter().find(|s| s.scope_path == ".");
    let files = root_scope.map(|s| s.files.clone()).unwrap_or_default();
    let has_varlock = root.join(".env.schema").exists();
    let env_tier = if has_varlock {
        "varlock"
    } else if !files.is_empty() {
        "dotenv"
    } else {
        "none"
    };
    (env_tier.to_string(), files, has_varlock)
}

pub fn scan_project_from_path(cwd: &str) -> Result<ProjectScan, DiscoverError> {
    let root_path = Path::new(cwd);
    let mut topology =
        detect_topology(root_path).map_err(|e| DiscoverError::Topology(e.to_string()))?;
    let commands = discover_commands(&topology)?;
    topology.commands = commands.clone();

    let root_abs = topology
        .nodes
        .iter()
        .find(|n| n.id == topology.root_node_id)
        .map(|n| PathBuf::from(&n.path))
        .ok_or_else(|| DiscoverError::Topology("missing root node".to_string()))?;

    let (env_tier, env_files, has_varlock) = root_env_info(&root_abs, &topology.env_scopes);

    let tech_stack = detect_tech_stack(&topology);

    Ok(ProjectScan {
        project_id: topology.project_id,
        root_node_id: topology.root_node_id,
        nodes: topology.nodes,
        commands,
        env_scopes: topology.env_scopes,
        tech_stack,
        has_varlock,
        env_tier,
        env_files,
    })
}

pub fn save_custom_command_to_vibestart(
    cwd: &str,
    name: String,
    command: String,
    category: String,
) -> Result<(), DiscoverError> {
    let path = Path::new(cwd).join(".vibestart.json");
    let mut cfg: VibestartConfig = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        VibestartConfig::default()
    };

    cfg.commands.push(CustomCommand {
        name,
        command,
        category,
    });

    fs::write(
        path,
        serde_json::to_string_pretty(&cfg).unwrap_or_else(|_| "{}".to_string()),
    )?;
    Ok(())
}

pub fn source_label(scope_path: &str, source_file: &str) -> String {
    format!("{}:{}", scope_path, source_file)
}

pub fn qualify_command_name(node: &ProjectNode, raw_name: &str) -> String {
    if node.rel_path == "." {
        raw_name.to_string()
    } else {
        format!("{} ({})", raw_name, node.rel_path)
    }
}

pub fn infer_env_scope_for_command(node: &ProjectNode, _cmd_cwd_rel: &str) -> String {
    node.rel_path.clone()
}

pub fn canonical_cwd_for_node(root: &Path, node: &ProjectNode) -> Result<String, DiscoverError> {
    normalize_rel_path(root, Path::new(&node.path))
        .map_err(|e| DiscoverError::Topology(e.to_string()))
}
