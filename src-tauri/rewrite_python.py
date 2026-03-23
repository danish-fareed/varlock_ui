import re

with open('src/discovery/python.rs', 'r') as f:
    content = f.read()

# Make run_and_collect async
content = content.replace('fn run_and_collect(', 'async fn run_and_collect(')
content = content.replace('std::process::Command::new', 'tokio::process::Command::new')

# Add creation_flags for Windows in run_and_collect
cmd_block = """    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args).current_dir(cwd);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().await?;"""

content = re.sub(
    r'let output = tokio::process::Command::new\(program\)\s*\.args\(args\)\s*\.current_dir\(cwd\)\s*\.output\(\)\?;',
    cmd_block,
    content
)

# Make resolve_and_warmup_with_runner async
content = content.replace(
    'fn resolve_and_warmup_with_runner<F>(node_abs_path: &Path, mut runner: F) -> PythonEnvWarmupLog\nwhere\n    F: FnMut(&Path, &str, &[String]) -> Result<(bool, Vec<String>), std::io::Error>,',
    '''async fn resolve_and_warmup_with_runner<F, Fut>(node_abs_path: &Path, mut runner: F) -> PythonEnvWarmupLog
where
    F: FnMut(&Path, &str, &[String]) -> Fut,
    Fut: std::future::Future<Output = Result<(bool, Vec<String>), std::io::Error>>,'''
)

# Await the runner calls
content = content.replace('runner(node_abs_path, "python", &args)', 'runner(node_abs_path, "python", &args).await')
content = content.replace('runner(node_abs_path, &interpreter_str, &probe_args)', 'runner(node_abs_path, &interpreter_str, &probe_args).await')
content = content.replace('runner(node_abs_path, "python", &create_args)', 'runner(node_abs_path, "python", &create_args).await')
content = content.replace('runner(node_abs_path, &interpreter_str, &args)', 'runner(node_abs_path, &interpreter_str, &args).await')

# Make resolve_and_warmup_python_env async
content = content.replace(
    'pub fn resolve_and_warmup_python_env(node_abs_path: &Path) -> PythonEnvWarmupLog {\n    resolve_and_warmup_with_runner(node_abs_path, run_and_collect)\n}',
    'pub async fn resolve_and_warmup_python_env(node_abs_path: &Path) -> PythonEnvWarmupLog {\n    resolve_and_warmup_with_runner(node_abs_path, run_and_collect).await\n}'
)

# Make rebuild_default_python_env async
content = content.replace('pub fn rebuild_default_python_env', 'pub async fn rebuild_default_python_env')
content = content.replace('let mut warmup = resolve_and_warmup_python_env(node_abs_path);', 'let mut warmup = resolve_and_warmup_python_env(node_abs_path).await;')

# Fix tests
content = content.replace('#[test]', '#[tokio::test]')
content = content.replace('resolve_and_warmup_with_runner(&dir, |cwd, program, args| {', 'resolve_and_warmup_with_runner(&dir, |cwd, program, args| async move {')
content = content.replace('resolve_and_warmup_with_runner(&dir, |_cwd, program, args| {', 'resolve_and_warmup_with_runner(&dir, |_cwd, program, args| async move {')
content = content.replace('rebuild_default_python_env(&dir)', 'rebuild_default_python_env(&dir).await')

with open('src/discovery/python.rs', 'w') as f:
    f.write(content)
