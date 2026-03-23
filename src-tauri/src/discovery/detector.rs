use crate::discovery::python::{detect_venv_path, python_binary_for_venv};
use crate::discovery::types::{
    EnvScope, ProjectNode, ProjectNodeType, ProjectTopology, RuntimeKind, WorkspacePackageManager,
};
use serde_json::Value;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_DEPTH_DEFAULT: usize = 6;

#[derive(Debug, thiserror::Error)]
pub enum DetectError {
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("path resolution failed: {0}")]
    PathResolution(String),
}

#[derive(Debug, Clone)]
pub struct ResolvedRoot {
    pub root: PathBuf,
    pub initially_selected_child: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct MonorepoSignals {
    pub has_signals: bool,
}

#[derive(Debug, Clone)]
pub struct DetectedRoot {
    pub path: PathBuf,
    pub runtimes: Vec<RuntimeKind>,
    pub is_runnable: bool,
}

fn canonicalize_dir(path: &Path) -> Result<PathBuf, DetectError> {
    let canonical = path.canonicalize()?;
    if !canonical.is_dir() {
        return Err(DetectError::InvalidPath(format!(
            "{} is not a directory",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn short_hash(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    digest[..8].iter().map(|b| format!("{:02x}", b)).collect()
}

fn node_id(project_id: &str, rel_path: &str) -> String {
    format!("node:{}:{}", project_id, short_hash(rel_path))
}

fn project_id_for_path(path: &Path) -> String {
    format!("proj:{}", short_hash(&path.to_string_lossy()))
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | ".venv"
            | "venv"
            | "env"
            | "dist"
            | "build"
            | ".next"
            | ".turbo"
            | ".nx"
            | "target"
            | ".idea"
            | ".vscode"
            | "coverage"
            | "__pycache__"
    )
}

fn has_workspace_in_package_json(path: &Path) -> bool {
    let pkg_path = path.join("package.json");
    let content = match fs::read_to_string(pkg_path) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let json: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };

    if json.get("workspaces").is_some() {
        return true;
    }

    false
}

fn has_cargo_workspace(path: &Path) -> bool {
    let cargo = path.join("Cargo.toml");
    if !cargo.exists() {
        return false;
    }
    fs::read_to_string(cargo)
        .map(|c| c.contains("[workspace]"))
        .unwrap_or(false)
}

pub fn is_monorepo_root(path: &Path) -> Result<MonorepoSignals, DetectError> {
    let path = canonicalize_dir(path)?;
    let has_signals = has_workspace_in_package_json(&path)
        || path.join("pnpm-workspace.yaml").exists()
        || path.join("turbo.json").exists()
        || path.join("nx.json").exists()
        || path.join("lerna.json").exists()
        || path.join("rush.json").exists()
        || has_cargo_workspace(&path)
        || path.join("go.work").exists();

    Ok(MonorepoSignals { has_signals })
}

pub fn resolve_registration_root(input_path: &Path) -> Result<ResolvedRoot, DetectError> {
    let input = canonicalize_dir(input_path)?;
    if is_monorepo_root(&input)?.has_signals {
        return Ok(ResolvedRoot {
            root: input,
            initially_selected_child: None,
        });
    }

    let mut cursor = input.parent().map(|p| p.to_path_buf());
    let mut found: Option<PathBuf> = None;

    while let Some(current) = cursor {
        if is_monorepo_root(&current)?.has_signals {
            found = Some(current.clone());
            break;
        }
        if current.join(".git").exists() {
            break;
        }
        cursor = current.parent().map(|p| p.to_path_buf());
    }

    if let Some(root) = found {
        Ok(ResolvedRoot {
            root,
            initially_selected_child: Some(input),
        })
    } else {
        Ok(ResolvedRoot {
            root: input,
            initially_selected_child: None,
        })
    }
}

pub fn detect_workspace_package_manager(path: &Path) -> WorkspacePackageManager {
    if path.join("pnpm-workspace.yaml").exists() {
        WorkspacePackageManager::Pnpm
    } else if path.join("bun.lockb").exists() || path.join("bun.lock").exists() {
        WorkspacePackageManager::Bun
    } else if path.join("yarn.lock").exists() {
        WorkspacePackageManager::Yarn
    } else {
        WorkspacePackageManager::Npm
    }
}

fn has_node_runtime(path: &Path) -> bool {
    path.join("package.json").exists()
}

fn has_python_runtime(path: &Path) -> bool {
    path.join("pyproject.toml").exists()
        || path.join("requirements.txt").exists()
        || path.join("setup.py").exists()
}

fn has_rust_runtime(path: &Path) -> bool {
    path.join("Cargo.toml").exists()
}

fn has_go_runtime(path: &Path) -> bool {
    path.join("go.mod").exists()
}

fn has_compose_runtime(path: &Path) -> bool {
    path.join("docker-compose.yml").exists() || path.join("docker-compose.yaml").exists()
}

fn runtime_sort_key(runtime: &RuntimeKind) -> i32 {
    match runtime {
        RuntimeKind::DockerCompose => 0,
        RuntimeKind::Node => 1,
        RuntimeKind::Python => 2,
        RuntimeKind::Rust => 3,
        RuntimeKind::Go => 4,
    }
}

pub fn detect_runtime_kinds(path: &Path) -> Result<Vec<RuntimeKind>, DetectError> {
    let path = canonicalize_dir(path)?;
    let mut runtimes = Vec::new();
    if has_compose_runtime(&path) {
        runtimes.push(RuntimeKind::DockerCompose);
    }
    if has_node_runtime(&path) {
        runtimes.push(RuntimeKind::Node);
    }
    if has_python_runtime(&path) {
        runtimes.push(RuntimeKind::Python);
    }
    if has_rust_runtime(&path) {
        runtimes.push(RuntimeKind::Rust);
    }
    if has_go_runtime(&path) {
        runtimes.push(RuntimeKind::Go);
    }
    runtimes.sort_by_key(runtime_sort_key);
    Ok(runtimes)
}

pub fn is_runnable_node_package(path: &Path) -> Result<bool, DetectError> {
    let pkg_path = path.join("package.json");
    if !pkg_path.exists() {
        return Ok(false);
    }

    let content = match fs::read_to_string(pkg_path) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    let json: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };

    if let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) {
        for key in scripts.keys() {
            let lower = key.to_lowercase();
            if matches!(
                lower.as_str(),
                "dev" | "start" | "serve" | "preview" | "android" | "ios" | "web"
            ) {
                return Ok(true);
            }
        }
    }

    let markers = [
        "app.config.js",
        "app.json",
        "eas.json",
        "next.config.js",
        "next.config.mjs",
        "vite.config.ts",
        "vite.config.js",
    ];
    Ok(markers.iter().any(|name| path.join(name).exists()))
}

pub fn is_runnable_python_project(path: &Path) -> Result<bool, DetectError> {
    let markers = ["main.py", "manage.py", "wsgi.py", "asgi.py"];
    if markers.iter().any(|f| path.join(f).exists()) || path.join("app/main.py").exists() {
        return Ok(true);
    }

    let pyproject = path.join("pyproject.toml");
    if pyproject.exists() {
        let c = fs::read_to_string(pyproject)
            .unwrap_or_default()
            .to_lowercase();
        if c.contains("scripts") {
            return Ok(true);
        }
    }

    if path.join("Makefile").exists() {
        let make = fs::read_to_string(path.join("Makefile")).unwrap_or_default();
        let lower = make.to_lowercase();
        if lower.contains("run") || lower.contains("test") || lower.contains("train") {
            return Ok(true);
        }
    }
    Ok(false)
}

fn is_runtime_root(path: &Path) -> bool {
    has_node_runtime(path)
        || has_python_runtime(path)
        || has_rust_runtime(path)
        || has_go_runtime(path)
        || has_compose_runtime(path)
}

fn include_child_for_monorepo(rel_path: &str, path: &Path) -> bool {
    let normalized = rel_path.replace('\\', "/");
    if normalized.starts_with("apps/") || normalized.starts_with("services/") {
        return true;
    }
    if normalized.starts_with("packages/") {
        let node_ok = is_runnable_node_package(path).unwrap_or(false);
        let py_ok = is_runnable_python_project(path).unwrap_or(false);
        return node_ok || py_ok;
    }
    true
}

fn walk_nested(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    visited: &mut HashSet<PathBuf>,
    out: &mut Vec<DetectedRoot>,
    monorepo: bool,
) -> Result<(), DetectError> {
    if depth > max_depth {
        return Ok(());
    }

    let canonical = match current.canonicalize() {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };

    if !canonical.starts_with(root) {
        return Ok(());
    }

    if !visited.insert(canonical.clone()) {
        return Ok(());
    }

    if depth > 0 && is_runtime_root(&canonical) {
        let rel = normalize_rel_path(root, &canonical)?;
        if !monorepo || include_child_for_monorepo(&rel, &canonical) {
            let runtimes = detect_runtime_kinds(&canonical)?;
            let runnable = is_runnable_node_package(&canonical).unwrap_or(false)
                || is_runnable_python_project(&canonical).unwrap_or(false)
                || runtimes.contains(&RuntimeKind::DockerCompose)
                || runtimes.contains(&RuntimeKind::Rust)
                || runtimes.contains(&RuntimeKind::Go);
            out.push(DetectedRoot {
                path: canonical,
                runtimes,
                is_runnable: runnable,
            });
        }
    }

    let read_dir = match fs::read_dir(current) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };

    for entry in read_dir.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(v) => v,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_dir(&name) {
            continue;
        }
        walk_nested(root, &p, depth + 1, max_depth, visited, out, monorepo)?;
    }

    Ok(())
}

pub fn discover_nested_roots(
    root: &Path,
    max_depth: usize,
) -> Result<Vec<DetectedRoot>, DetectError> {
    let root = canonicalize_dir(root)?;
    let mut out = Vec::new();
    let mut visited = HashSet::new();
    let monorepo = is_monorepo_root(&root)?.has_signals;
    walk_nested(&root, &root, 0, max_depth, &mut visited, &mut out, monorepo)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn normalize_rel_path(root: &Path, child: &Path) -> Result<String, DetectError> {
    let root = root
        .canonicalize()
        .map_err(|e| DetectError::PathResolution(e.to_string()))?;
    let child = child
        .canonicalize()
        .map_err(|e| DetectError::PathResolution(e.to_string()))?;

    if !child.starts_with(&root) {
        return Err(DetectError::PathResolution(format!(
            "{} escapes root {}",
            child.display(),
            root.display()
        )));
    }

    let rel = child
        .strip_prefix(&root)
        .map_err(|e| DetectError::PathResolution(format!("failed to strip prefix: {}", e)))?;

    let s = rel.to_string_lossy().replace('\\', "/");
    if s.is_empty() {
        Ok(".".to_string())
    } else {
        Ok(s)
    }
}

fn collect_scope_files(scope_dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(scope_dir) {
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".env" || (name.starts_with(".env.") && !name.ends_with(".schema")) {
                files.push(name);
            }
        }
    }
    files.sort();
    files
}

pub fn detect_env_scope(
    project_root: &Path,
    scope_rel_path: &Path,
) -> Result<EnvScope, DetectError> {
    let root = canonicalize_dir(project_root)?;
    let scope_abs = root.join(scope_rel_path);
    let scope_abs = canonicalize_dir(&scope_abs)?;
    let scope_path = normalize_rel_path(&root, &scope_abs)?;

    let files = collect_scope_files(&scope_abs);
    let has_varlock = scope_abs.join(".env.schema").exists();
    let is_plain_dotenv = files.len() == 1 && files[0] == ".env";
    let mut env_names = BTreeSet::new();
    for f in &files {
        if let Some(name) = f.strip_prefix(".env.") {
            env_names.insert(name.to_string());
        }
    }

    let active_env_name = if is_plain_dotenv {
        "default".to_string()
    } else if env_names.contains("development") {
        "development".to_string()
    } else {
        env_names
            .iter()
            .next()
            .cloned()
            .unwrap_or_else(|| "default".to_string())
    };

    Ok(EnvScope {
        scope_path,
        files,
        active_env_name,
        has_varlock,
        is_plain_dotenv,
    })
}

pub fn detect_topology(input_path: &Path) -> Result<ProjectTopology, DetectError> {
    let resolved = resolve_registration_root(input_path)?;
    let root = resolved.root;
    let project_id = project_id_for_path(&root);
    let monorepo = is_monorepo_root(&root)?.has_signals;
    let workspace_pm = if monorepo {
        Some(detect_workspace_package_manager(&root))
    } else {
        None
    };

    let root_runtimes = detect_runtime_kinds(&root)?;
    let root_python_interpreter = if root_runtimes.contains(&RuntimeKind::Python) {
        detect_venv_path(&root)
            .map(|venv| python_binary_for_venv(&venv).to_string_lossy().to_string())
    } else {
        None
    };

    let root_rel = ".".to_string();
    let root_node = ProjectNode {
        id: node_id(&project_id, &root_rel),
        project_id: project_id.clone(),
        parent_id: None,
        name: root
            .file_name()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
        path: root.to_string_lossy().to_string(),
        rel_path: root_rel.clone(),
        node_type: if monorepo {
            ProjectNodeType::MonorepoRoot
        } else {
            ProjectNodeType::Standalone
        },
        runtimes: root_runtimes,
        python_interpreter_path: root_python_interpreter,
        workspace_package_manager: workspace_pm,
        is_runnable: true,
        sort_order: 0,
    };

    let nested = discover_nested_roots(&root, MAX_DEPTH_DEFAULT)?;
    let mut nodes = vec![root_node.clone()];
    for (idx, child) in nested.iter().enumerate() {
        let rel = normalize_rel_path(&root, &child.path)?;
        if rel == "." {
            continue;
        }
        let node_type = if monorepo {
            ProjectNodeType::MonorepoChild
        } else {
            ProjectNodeType::Subproject
        };
        let python_interpreter_path = if child.runtimes.contains(&RuntimeKind::Python) {
            detect_venv_path(&child.path)
                .map(|venv| python_binary_for_venv(&venv).to_string_lossy().to_string())
        } else {
            None
        };
        nodes.push(ProjectNode {
            id: node_id(&project_id, &rel),
            project_id: project_id.clone(),
            parent_id: Some(root_node.id.clone()),
            name: rel.clone(),
            path: child.path.to_string_lossy().to_string(),
            rel_path: rel,
            node_type,
            runtimes: child.runtimes.clone(),
            python_interpreter_path,
            workspace_package_manager: None,
            is_runnable: child.is_runnable,
            sort_order: (idx + 1) as i32,
        });
    }

    if let Some(initial_child) = resolved.initially_selected_child {
        let rel = normalize_rel_path(&root, &initial_child)?;
        if rel != "." && !nodes.iter().any(|n| n.rel_path == rel) {
            let runtimes = detect_runtime_kinds(&initial_child)?;
            let python_interpreter_path = if runtimes.contains(&RuntimeKind::Python) {
                detect_venv_path(&initial_child)
                    .map(|venv| python_binary_for_venv(&venv).to_string_lossy().to_string())
            } else {
                None
            };
            nodes.push(ProjectNode {
                id: node_id(&project_id, &rel),
                project_id: project_id.clone(),
                parent_id: Some(root_node.id.clone()),
                name: rel.clone(),
                path: initial_child.to_string_lossy().to_string(),
                rel_path: rel,
                node_type: if monorepo {
                    ProjectNodeType::MonorepoChild
                } else {
                    ProjectNodeType::Subproject
                },
                runtimes,
                python_interpreter_path,
                workspace_package_manager: None,
                is_runnable: true,
                sort_order: nodes.len() as i32,
            });
        }
    }

    let mut env_scopes = Vec::new();
    for node in &nodes {
        let rel = if node.rel_path == "." {
            PathBuf::from(".")
        } else {
            PathBuf::from(&node.rel_path)
        };
        if let Ok(scope) = detect_env_scope(&root, &rel) {
            env_scopes.push(scope);
        }
    }

    Ok(ProjectTopology {
        project_id,
        root_node_id: root_node.id,
        nodes,
        commands: Vec::new(),
        env_scopes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_temp_dir(name: &str) -> PathBuf {
        let base =
            std::env::temp_dir().join(format!("varlock_ui_test_{}_{}", name, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).expect("create temp dir");
        base
    }

    #[test]
    fn detect_standalone_node_project_topology() {
        let dir = mk_temp_dir("standalone_node");
        std::fs::write(
            dir.join("package.json"),
            r#"{"name":"app","scripts":{"dev":"vite"}}"#,
        )
        .expect("write package.json");

        let topology = detect_topology(&dir).expect("topology");
        assert_eq!(topology.nodes.len(), 1);
        assert_eq!(topology.nodes[0].rel_path, ".");
        assert!(topology.nodes[0].runtimes.contains(&RuntimeKind::Node));
    }

    #[test]
    fn detect_monorepo_root_from_package_workspaces() {
        let dir = mk_temp_dir("mono_root");
        std::fs::write(
            dir.join("package.json"),
            r#"{"name":"mono","workspaces":["apps/*"]}"#,
        )
        .expect("write package.json");
        std::fs::create_dir_all(dir.join("apps/web")).expect("mkdir apps/web");
        std::fs::write(
            dir.join("apps/web/package.json"),
            r#"{"name":"web","scripts":{"dev":"next dev"}}"#,
        )
        .expect("write child package");

        let topology = detect_topology(&dir).expect("topology");
        assert!(matches!(
            topology.nodes[0].node_type,
            ProjectNodeType::MonorepoRoot
        ));
        assert!(topology.nodes.iter().any(|n| n.rel_path == "apps/web"));
    }

    #[test]
    fn detect_plain_dotenv_scope_sets_default_env() {
        let dir = mk_temp_dir("plain_dotenv");
        std::fs::write(dir.join(".env"), "PORT=3000\n").expect("write env");

        let scope = detect_env_scope(&dir, Path::new(".")).expect("scope");
        assert_eq!(scope.active_env_name, "default");
        assert!(scope.is_plain_dotenv);
    }

    #[test]
    fn discover_nested_children_ignores_symlink_loops() {
        let dir = mk_temp_dir("symlink_loop");
        std::fs::write(dir.join("package.json"), r#"{"name":"app"}"#).expect("pkg");
        std::fs::create_dir_all(dir.join("apps/web")).expect("mkdir apps/web");
        std::fs::write(
            dir.join("apps/web/package.json"),
            r#"{"name":"web","scripts":{"dev":"vite"}}"#,
        )
        .expect("child pkg");

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&dir, dir.join("apps/web/loop")).expect("symlink");
        }
        #[cfg(windows)]
        {
            // Best-effort on Windows: skip if symlink requires elevated privileges.
            let _ = std::os::windows::fs::symlink_dir(&dir, dir.join("apps/web/loop"));
        }

        let nested = discover_nested_roots(&dir, 6).expect("nested roots");
        assert!(nested
            .iter()
            .any(|r| r.path.ends_with("apps\\web") || r.path.ends_with("apps/web")));
    }

    #[test]
    fn detect_runtime_precedence_is_deterministic() {
        let dir = mk_temp_dir("runtime_precedence");
        std::fs::write(dir.join("package.json"), r#"{"name":"app"}"#).expect("pkg");
        std::fs::write(dir.join("requirements.txt"), "fastapi\n").expect("req");
        std::fs::write(
            dir.join("docker-compose.yml"),
            "services:\n  web:\n    image: nginx\n",
        )
        .expect("compose");

        let runtimes = detect_runtime_kinds(&dir).expect("runtimes");
        assert_eq!(runtimes[0], RuntimeKind::DockerCompose);
        assert_eq!(runtimes[1], RuntimeKind::Node);
        assert_eq!(runtimes[2], RuntimeKind::Python);
    }
}
