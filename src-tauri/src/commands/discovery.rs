use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredCommand {
    pub id: String,
    pub name: String,
    pub raw_cmd: String,
    pub source_file: String,
    pub category: String,
    pub is_custom: bool,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScan {
    pub commands: Vec<DiscoveredCommand>,
    pub tech_stack: Vec<String>,
    pub has_varlock: bool,
    pub env_tier: String,
    pub env_files: Vec<String>,
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

// ── Category assignment ──

fn categorize_command(name: &str) -> &'static str {
    let lower = name.to_lowercase();

    // Dev server
    if lower == "dev"
        || lower == "start"
        || lower == "serve"
        || lower.contains("dev:")
        || lower.contains(":dev")
        || lower == "watch"
        || lower.contains("dev-server")
    {
        return "dev-server";
    }

    // Build
    if lower == "build"
        || lower.contains("compile")
        || lower.contains("bundle")
        || lower.contains("build:")
    {
        return "build";
    }

    // Test
    if lower == "test"
        || lower.contains("spec")
        || lower.contains("jest")
        || lower.contains("vitest")
        || lower.contains("mocha")
        || lower.contains("test:")
        || lower.contains(":test")
    {
        return "test";
    }

    // Database
    if lower.contains("migrate")
        || lower.contains("seed")
        || lower.starts_with("db:")
        || lower.starts_with("db-")
        || lower.contains("prisma")
    {
        return "database";
    }

    // Code quality
    if lower == "lint"
        || lower == "format"
        || lower == "typecheck"
        || lower.contains("lint:")
        || lower.contains("prettier")
        || lower.contains("eslint")
    {
        return "code-quality";
    }

    // Deploy
    if lower.contains("deploy") || lower.contains("release") || lower.contains("publish") {
        return "deploy";
    }

    "other"
}

/// Human-friendly name from a script key.
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

// ── Sort order by category ──

fn category_sort_order(category: &str) -> i32 {
    match category {
        "dev-server" => 0,
        "test" => 1,
        "build" => 2,
        "database" => 3,
        "docker" => 4,
        "code-quality" => 5,
        "deploy" => 6,
        "custom" => 7,
        _ => 8,
    }
}

// ── Parsers ──

fn parse_package_json(cwd: &Path) -> Vec<DiscoveredCommand> {
    let path = cwd.join("package.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let parsed: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let scripts = match parsed.get("scripts").and_then(|s| s.as_object()) {
        Some(s) => s,
        None => return vec![],
    };

    scripts
        .iter()
        .map(|(key, val)| {
            let raw_cmd = val.as_str().unwrap_or("").to_string();
            let category = categorize_command(key);
            let sort = category_sort_order(category);
            DiscoveredCommand {
                id: format!("pkg:{}", key),
                name: humanize_name(key),
                raw_cmd: format!("npm run {}", key),
                source_file: "package.json".to_string(),
                category: category.to_string(),
                is_custom: false,
                sort_order: sort,
            }
        })
        .collect()
}

fn parse_makefile(cwd: &Path) -> Vec<DiscoveredCommand> {
    let path = cwd.join("Makefile");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut targets = vec![];
    let mut phony_targets: Vec<String> = vec![];

    // Collect .PHONY targets
    for line in content.lines() {
        if line.starts_with(".PHONY:") {
            let rest = line.strip_prefix(".PHONY:").unwrap_or("").trim();
            for target in rest.split_whitespace() {
                phony_targets.push(target.to_string());
            }
        }
    }

    // Collect all named targets
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with('.') || trimmed.starts_with('\t') {
            continue;
        }
        if let Some(colon_pos) = trimmed.find(':') {
            let target = &trimmed[..colon_pos].trim();
            // Skip targets starting with _ or containing %
            if target.starts_with('_') || target.contains('%') || target.is_empty() {
                continue;
            }
            // Only include if it matches [a-zA-Z][a-zA-Z0-9_-]*
            if target
                .chars()
                .next()
                .map(|c| c.is_ascii_alphabetic())
                .unwrap_or(false)
                && target
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                if !targets.contains(&target.to_string()) {
                    targets.push(target.to_string());
                }
            }
        }
    }

    targets
        .into_iter()
        .map(|target| {
            let category = categorize_command(&target);
            let sort = category_sort_order(category);
            DiscoveredCommand {
                id: format!("make:{}", target),
                name: humanize_name(&target),
                raw_cmd: format!("make {}", target),
                source_file: "Makefile".to_string(),
                category: category.to_string(),
                is_custom: false,
                sort_order: sort,
            }
        })
        .collect()
}

fn parse_docker_compose(cwd: &Path) -> Vec<DiscoveredCommand> {
    let path = if cwd.join("docker-compose.yml").exists() {
        cwd.join("docker-compose.yml")
    } else if cwd.join("docker-compose.yaml").exists() {
        cwd.join("docker-compose.yaml")
    } else if cwd.join("compose.yml").exists() {
        cwd.join("compose.yml")
    } else if cwd.join("compose.yaml").exists() {
        cwd.join("compose.yaml")
    } else {
        return vec![];
    };

    let source_file = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut cmds = vec![
        DiscoveredCommand {
            id: "docker:up".to_string(),
            name: "Docker Up".to_string(),
            raw_cmd: "docker compose up".to_string(),
            source_file: source_file.clone(),
            category: "docker".to_string(),
            is_custom: false,
            sort_order: category_sort_order("docker"),
        },
        DiscoveredCommand {
            id: "docker:up-build".to_string(),
            name: "Docker Up (Build)".to_string(),
            raw_cmd: "docker compose up --build".to_string(),
            source_file: source_file.clone(),
            category: "docker".to_string(),
            is_custom: false,
            sort_order: category_sort_order("docker"),
        },
    ];

    // Parse services (basic YAML parsing — look for services: section)
    let mut in_services = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "services:" {
            in_services = true;
            continue;
        }
        if in_services {
            // Top-level key under services (not indented further than 2 spaces from services)
            if !line.starts_with(' ') && !line.starts_with('\t') && !trimmed.is_empty() {
                in_services = false;
                continue;
            }
            // Service name is indented exactly 2 spaces and ends with ':'
            let stripped = line.strip_prefix("  ").unwrap_or("");
            if !stripped.starts_with(' ')
                && stripped.ends_with(':')
                && !stripped.starts_with('#')
                && !stripped.is_empty()
            {
                let service = stripped.trim_end_matches(':').trim();
                if !service.is_empty() {
                    cmds.push(DiscoveredCommand {
                        id: format!("docker:svc:{}", service),
                        name: format!("Docker {}", humanize_name(service)),
                        raw_cmd: format!("docker compose up {}", service),
                        source_file: source_file.clone(),
                        category: "docker".to_string(),
                        is_custom: false,
                        sort_order: category_sort_order("docker"),
                    });
                }
            }
        }
    }

    cmds
}

fn parse_pyproject(cwd: &Path) -> Vec<DiscoveredCommand> {
    let path = cwd.join("pyproject.toml");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut cmds = vec![];

    // Basic TOML parsing for task runner sections
    // Look for [tool.taskipy.tasks], [tool.poe.tasks], [tool.scripts]
    let mut in_tasks_section = false;
    let mut section_name = String::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Check for section headers
        if trimmed.starts_with('[') {
            in_tasks_section = false;
            if trimmed.contains("tool.taskipy.tasks")
                || trimmed.contains("tool.poe.tasks")
                || trimmed.contains("tool.scripts")
                || trimmed.contains("project.scripts")
            {
                in_tasks_section = true;
                section_name = trimmed.to_string();
            }
            continue;
        }

        if in_tasks_section && trimmed.contains('=') {
            let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
            if parts.len() == 2 {
                let key = parts[0].trim().trim_matches('"');
                let val = parts[1]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !key.is_empty() && !val.is_empty() {
                    let category = categorize_command(key);
                    cmds.push(DiscoveredCommand {
                        id: format!("py:{}", key),
                        name: humanize_name(key),
                        raw_cmd: val.to_string(),
                        source_file: "pyproject.toml".to_string(),
                        category: category.to_string(),
                        is_custom: false,
                        sort_order: category_sort_order(category),
                    });
                }
            }
        }
    }

    // Python framework fallbacks — detect common frameworks
    if cmds.is_empty() {
        cmds.extend(detect_python_frameworks(cwd));
    }

    cmds
}

fn detect_python_frameworks(cwd: &Path) -> Vec<DiscoveredCommand> {
    let mut cmds = vec![];

    // Check requirements.txt or pyproject.toml dependencies
    let requirements = fs::read_to_string(cwd.join("requirements.txt")).unwrap_or_default();
    let pyproject = fs::read_to_string(cwd.join("pyproject.toml")).unwrap_or_default();
    let combined = format!("{}\n{}", requirements, pyproject).to_lowercase();

    // Django
    if cwd.join("manage.py").exists() {
        cmds.push(DiscoveredCommand {
            id: "py:runserver".to_string(),
            name: "Django Dev Server".to_string(),
            raw_cmd: "python manage.py runserver".to_string(),
            source_file: "manage.py".to_string(),
            category: "dev-server".to_string(),
            is_custom: false,
            sort_order: category_sort_order("dev-server"),
        });
        cmds.push(DiscoveredCommand {
            id: "py:migrate".to_string(),
            name: "Django Migrate".to_string(),
            raw_cmd: "python manage.py migrate".to_string(),
            source_file: "manage.py".to_string(),
            category: "database".to_string(),
            is_custom: false,
            sort_order: category_sort_order("database"),
        });
    }

    // FastAPI + Uvicorn
    if combined.contains("fastapi") && combined.contains("uvicorn") {
        let main_file = if cwd.join("app/main.py").exists() {
            "app.main:app"
        } else if cwd.join("main.py").exists() {
            "main:app"
        } else {
            "app:app"
        };
        cmds.push(DiscoveredCommand {
            id: "py:uvicorn".to_string(),
            name: "FastAPI Dev Server".to_string(),
            raw_cmd: format!("uvicorn {} --reload", main_file),
            source_file: "requirements.txt".to_string(),
            category: "dev-server".to_string(),
            is_custom: false,
            sort_order: category_sort_order("dev-server"),
        });
    } else if combined.contains("uvicorn") {
        cmds.push(DiscoveredCommand {
            id: "py:uvicorn".to_string(),
            name: "Uvicorn Server".to_string(),
            raw_cmd: "uvicorn app:app --reload".to_string(),
            source_file: "requirements.txt".to_string(),
            category: "dev-server".to_string(),
            is_custom: false,
            sort_order: category_sort_order("dev-server"),
        });
    }

    // Flask
    if combined.contains("flask") && !combined.contains("fastapi") {
        cmds.push(DiscoveredCommand {
            id: "py:flask".to_string(),
            name: "Flask Dev Server".to_string(),
            raw_cmd: "flask run --reload".to_string(),
            source_file: "requirements.txt".to_string(),
            category: "dev-server".to_string(),
            is_custom: false,
            sort_order: category_sort_order("dev-server"),
        });
    }

    // pytest
    if combined.contains("pytest") {
        cmds.push(DiscoveredCommand {
            id: "py:pytest".to_string(),
            name: "Pytest".to_string(),
            raw_cmd: "pytest".to_string(),
            source_file: "requirements.txt".to_string(),
            category: "test".to_string(),
            is_custom: false,
            sort_order: category_sort_order("test"),
        });
    }

    cmds
}

fn parse_vibestart(cwd: &Path) -> Vec<DiscoveredCommand> {
    let path = cwd.join(".vibestart.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let config: VibestartConfig = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    config
        .commands
        .iter()
        .enumerate()
        .map(|(i, cmd)| {
            let sort = category_sort_order(&cmd.category);
            DiscoveredCommand {
                id: format!("custom:{}", i),
                name: cmd.name.clone(),
                raw_cmd: cmd.command.clone(),
                source_file: ".vibestart.json".to_string(),
                category: cmd.category.clone(),
                is_custom: true,
                sort_order: sort,
            }
        })
        .collect()
}

// ── Tech stack detection ──

fn detect_tech_stack(cwd: &Path) -> Vec<String> {
    let mut stack = vec![];

    // Node.js ecosystem
    if cwd.join("package.json").exists() {
        let pkg_content = fs::read_to_string(cwd.join("package.json")).unwrap_or_default();
        let combined = pkg_content.to_lowercase();

        if combined.contains("\"next\"") || combined.contains("\"next\":") {
            stack.push("Next.js".to_string());
        } else if combined.contains("\"react\"") {
            stack.push("React".to_string());
        }
        if combined.contains("\"vue\"") {
            stack.push("Vue".to_string());
        }
        if combined.contains("\"svelte\"") || combined.contains("\"@sveltejs") {
            stack.push("Svelte".to_string());
        }
        if combined.contains("\"express\"") {
            stack.push("Express".to_string());
        }
        if combined.contains("\"typescript\"") || cwd.join("tsconfig.json").exists() {
            stack.push("TypeScript".to_string());
        }
        if combined.contains("\"vite\"") {
            stack.push("Vite".to_string());
        }

        // If nothing specific detected, just show Node.js
        if stack.is_empty() {
            stack.push("Node.js".to_string());
        }
    }

    // Python
    if cwd.join("pyproject.toml").exists()
        || cwd.join("requirements.txt").exists()
        || cwd.join("setup.py").exists()
        || cwd.join("manage.py").exists()
    {
        let combined = fs::read_to_string(cwd.join("requirements.txt"))
            .unwrap_or_default()
            .to_lowercase()
            + &fs::read_to_string(cwd.join("pyproject.toml"))
                .unwrap_or_default()
                .to_lowercase();

        if combined.contains("django") {
            stack.push("Django".to_string());
        } else if combined.contains("fastapi") {
            stack.push("FastAPI".to_string());
        } else if combined.contains("flask") {
            stack.push("Flask".to_string());
        } else {
            stack.push("Python".to_string());
        }
    }

    // Docker
    if cwd.join("docker-compose.yml").exists()
        || cwd.join("docker-compose.yaml").exists()
        || cwd.join("compose.yml").exists()
        || cwd.join("compose.yaml").exists()
        || cwd.join("Dockerfile").exists()
    {
        stack.push("Docker".to_string());
    }

    // Rust
    if cwd.join("Cargo.toml").exists() {
        stack.push("Rust".to_string());
    }

    // Go
    if cwd.join("go.mod").exists() {
        stack.push("Go".to_string());
    }

    // Varlock
    if cwd.join(".env.schema").exists() {
        stack.push("varlock".to_string());
    }

    stack
}

// ── Env file detection ──

fn find_env_files(cwd: &Path) -> Vec<String> {
    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(cwd) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".env" || (name.starts_with(".env.") && !name.ends_with(".schema")) {
                files.push(name);
            }
        }
    }
    files.sort();
    files
}

fn detect_env_tier(cwd: &Path) -> String {
    if cwd.join(".env.schema").exists() {
        "varlock".to_string()
    } else if find_env_files(cwd)
        .iter()
        .any(|f| f.starts_with(".env"))
    {
        "dotenv".to_string()
    } else {
        "none".to_string()
    }
}

// ── Main scan function ──

fn scan_project_inner(cwd: &str) -> ProjectScan {
    let path = Path::new(cwd);

    let mut commands = vec![];
    commands.extend(parse_package_json(path));
    commands.extend(parse_makefile(path));
    commands.extend(parse_docker_compose(path));
    commands.extend(parse_pyproject(path));

    // Custom commands from .vibestart.json override discovery
    let custom = parse_vibestart(path);
    // Remove discovered commands that have the same raw_cmd as a custom command
    let custom_cmds: Vec<String> = custom.iter().map(|c| c.raw_cmd.clone()).collect();
    commands.retain(|c| !custom_cmds.contains(&c.raw_cmd));
    commands.extend(custom);

    // Sort by category order, then by name
    commands.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then(a.name.cmp(&b.name))
    });

    ProjectScan {
        commands,
        tech_stack: detect_tech_stack(path),
        has_varlock: path.join(".env.schema").exists(),
        env_tier: detect_env_tier(path),
        env_files: find_env_files(path),
    }
}

// ── Tauri commands ──

/// Scan a project directory and return discovered commands, tech stack, and env info.
#[tauri::command]
pub fn scan_project(cwd: String) -> Result<ProjectScan, String> {
    let path = Path::new(&cwd);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }
    Ok(scan_project_inner(&cwd))
}

/// Save a custom command to .vibestart.json in the project root.
#[tauri::command]
pub fn save_custom_command(
    cwd: String,
    name: String,
    command: String,
    category: String,
) -> Result<(), String> {
    let path = Path::new(&cwd).join(".vibestart.json");

    let mut config: VibestartConfig = if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read .vibestart.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        VibestartConfig::default()
    };

    config.commands.push(CustomCommand {
        name,
        command,
        category,
    });

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize .vibestart.json: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write .vibestart.json: {}", e))?;

    Ok(())
}
