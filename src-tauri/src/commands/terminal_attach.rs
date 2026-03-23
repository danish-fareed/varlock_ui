use std::process::Command;

/// Open the user's OS terminal at a specific directory.
/// For idle commands — opens a fresh terminal window in the project directory.
#[tauri::command]
pub fn open_terminal_at(cwd: String) -> Result<(), String> {
    let cwd = cwd.trim().to_string();
    if cwd.is_empty() {
        return Err("Working directory cannot be empty".to_string());
    }

    if !std::path::Path::new(&cwd).exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    #[cfg(target_os = "windows")]
    {
        open_terminal_windows(&cwd)
    }

    #[cfg(target_os = "macos")]
    {
        open_terminal_macos(&cwd)
    }

    #[cfg(target_os = "linux")]
    {
        open_terminal_linux(&cwd)
    }
}

/// Open the OS terminal for a running process — shows process context.
/// On Windows, opens a new terminal tab at the project directory with info about the running PID.
#[tauri::command]
pub fn attach_to_process(pid: u32, cwd: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if which_exists("wt.exe") {
            Command::new("cmd")
                .args([
                    "/C",
                    "start",
                    "",
                    "wt.exe",
                    "-d",
                    &cwd,
                    "--title",
                    &format!("Process PID {}", pid),
                ])
                .spawn()
                .map_err(|e| format!("Failed to open Windows Terminal: {}", e))?;
            return Ok(());
        }
        open_terminal_windows(&cwd)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        open_terminal_at(cwd)
    }
}

/// Run a command inside a visible OS terminal window.
/// The terminal stays open so the user can interact with stdin/stdout.
/// This is the "Run in Terminal" feature — the command runs in the OS's own terminal.
#[tauri::command]
pub fn run_in_terminal(cwd: String, command: String) -> Result<(), String> {
    let cwd = cwd.trim().to_string();
    let command = command.trim().to_string();
    if cwd.is_empty() {
        return Err("Working directory cannot be empty".to_string());
    }
    if command.is_empty() {
        return Err("Command cannot be empty".to_string());
    }
    if !std::path::Path::new(&cwd).exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    #[cfg(target_os = "windows")]
    {
        run_in_terminal_windows(&cwd, &command)
    }

    #[cfg(target_os = "macos")]
    {
        run_in_terminal_macos(&cwd, &command)
    }

    #[cfg(target_os = "linux")]
    {
        run_in_terminal_linux(&cwd, &command)
    }
}

/// Open an external editor at the project path
#[tauri::command]
pub fn open_in_editor(cwd: String, editor: String) -> Result<(), String> {
    let cwd = cwd.trim().to_string();
    if !std::path::Path::new(&cwd).exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/C", &editor, &cwd])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to open {} in {}: {}", cwd, editor, e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(&editor)
            .arg(&cwd)
            .spawn()
            .map_err(|e| format!("Failed to open {} in {}: {}", cwd, editor, e))?;
    }

    Ok(())
}

/// Open the OS native file explorer at the project path
#[tauri::command]
pub fn open_in_explorer(cwd: String) -> Result<(), String> {
    let cwd = cwd.trim().to_string();
    if !std::path::Path::new(&cwd).exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&cwd)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&cwd)
            .spawn()
            .map_err(|e| format!("Failed to open finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&cwd)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

// ── Platform-specific implementations ──

#[cfg(target_os = "windows")]
fn which_exists(binary: &str) -> bool {
    Command::new("where")
        .arg(binary)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn open_terminal_windows(cwd: &str) -> Result<(), String> {
    // Priority: Windows Terminal > PowerShell > cmd
    if which_exists("wt.exe") {
        Command::new("cmd")
            .args(["/C", "start", "", "wt.exe", "-d", cwd])
            .spawn()
            .map_err(|e| format!("Failed to open Windows Terminal: {}", e))?;
        return Ok(());
    }

    if which_exists("pwsh.exe") {
        Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                "pwsh.exe",
                "-NoExit",
                "-WorkingDirectory",
                cwd,
            ])
            .spawn()
            .map_err(|e| format!("Failed to open PowerShell: {}", e))?;
        return Ok(());
    }

    // Fallback to cmd.exe — quote cwd to prevent injection
    Command::new("cmd")
        .args([
            "/C",
            "start",
            "cmd.exe",
            "/K",
            &format!("cd /d \"{}\"", cwd),
        ])
        .spawn()
        .map_err(|e| format!("Failed to open cmd: {}", e))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn open_terminal_macos(cwd: &str) -> Result<(), String> {
    let script = format!(
        "tell app \"Terminal\" to do script \"cd '{}'\"",
        cwd.replace('\'', "'\\''")
    );
    Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_terminal_linux(cwd: &str) -> Result<(), String> {
    // Try common terminals in order
    let terminals = [
        ("gnome-terminal", vec!["--working-directory", cwd]),
        ("konsole", vec!["--workdir", cwd]),
        ("xfce4-terminal", vec!["--working-directory", cwd]),
        ("kitty", vec!["--directory", cwd]),
        ("alacritty", vec!["--working-directory", cwd]),
        ("xterm", vec!["-e", &format!("cd '{}' && $SHELL", cwd)]),
    ];

    for (term, args) in &terminals {
        if Command::new("which")
            .arg(term)
            .stdout(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            Command::new(term)
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to open {}: {}", term, e))?;
            return Ok(());
        }
    }

    Err("No supported terminal emulator found".to_string())
}

// ── Run-in-terminal platform implementations ──

#[cfg(target_os = "windows")]
fn run_in_terminal_windows(cwd: &str, command: &str) -> Result<(), String> {
    // Properly quote cwd to prevent injection via specially-crafted directory names
    let inner_cmd = format!("cd /d \"{}\" && {}", cwd, command);

    if which_exists("wt.exe") {
        Command::new("cmd")
            .args([
                "/C", "start", "", "wt.exe", "-d", cwd, "cmd", "/K", &inner_cmd,
            ])
            .spawn()
            .map_err(|e| format!("Failed to open Windows Terminal: {}", e))?;
        return Ok(());
    }

    if which_exists("pwsh.exe") {
        Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                "pwsh.exe",
                "-NoExit",
                "-WorkingDirectory",
                cwd,
                "-Command",
                command,
            ])
            .spawn()
            .map_err(|e| format!("Failed to open PowerShell: {}", e))?;
        return Ok(());
    }

    // Fallback: cmd.exe
    Command::new("cmd")
        .args(["/C", "start", "cmd.exe", "/K", &inner_cmd])
        .spawn()
        .map_err(|e| format!("Failed to open cmd: {}", e))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn run_in_terminal_macos(cwd: &str, command: &str) -> Result<(), String> {
    let script = format!(
        "tell app \"Terminal\" to do script \"cd '{}' && {}\"",
        cwd.replace('\'', "'\\''"),
        command.replace('"', "\\\"")
    );
    Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn run_in_terminal_linux(cwd: &str, command: &str) -> Result<(), String> {
    // Use shell-safe quoting for the cwd path
    let escaped_cwd = cwd.replace('\'', "'\\''");
    let full_cmd = format!("cd '{}' && {} ; exec $SHELL", escaped_cwd, command);
    let terminals = [
        ("gnome-terminal", vec!["--", "bash", "-c", &full_cmd]),
        (
            "konsole",
            vec!["--workdir", cwd, "-e", "bash", "-c", &full_cmd],
        ),
        (
            "xfce4-terminal",
            vec![
                "--working-directory",
                cwd,
                "-e",
                &format!("bash -c '{}'", full_cmd),
            ],
        ),
        ("kitty", vec!["--directory", cwd, "bash", "-c", &full_cmd]),
        (
            "alacritty",
            vec!["--working-directory", cwd, "-e", "bash", "-c", &full_cmd],
        ),
    ];

    for (term, args) in &terminals {
        if Command::new("which")
            .arg(term)
            .stdout(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            Command::new(term)
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to open {}: {}", term, e))?;
            return Ok(());
        }
    }

    Err("No supported terminal emulator found".to_string())
}
