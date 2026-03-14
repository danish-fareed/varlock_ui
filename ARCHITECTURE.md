# Varlock UI - Architecture Plan

## 1. Overview

A Tauri v2 desktop application that provides a graphical interface for the Varlock CLI. The app manages environment variables across projects, streams CLI output via xterm.js, and stays decoupled from Varlock's internals by treating the CLI + filesystem as the only interface.

**Core MVP scope:**

- Project management (add/remove/switch projects via sidebar)
- Environment switching (environment cards with status indicators)
- Variable list display (populated from `varlock load --format=json`)
- Terminal panel with real-time streaming (via `varlock run`)
- Varlock auto-detection + install prompt

---

## 2. Project Structure

```
varlock_ui/
├── package.json                    # Frontend deps + scripts
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html                      # Vite entry
│
├── src/                            # React frontend
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root component + routing
│   │
│   ├── components/                 # UI components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # Project list, add project button
│   │   │   ├── TopBar.tsx          # Project title, actions, scan/run buttons
│   │   │   └── AppLayout.tsx       # Grid layout (sidebar + main)
│   │   │
│   │   ├── project/
│   │   │   ├── ProjectList.tsx     # Sidebar project list
│   │   │   ├── ProjectItem.tsx     # Single project row with status dot
│   │   │   └── AddProjectDialog.tsx # Directory picker + varlock init flow
│   │   │
│   │   ├── environment/
│   │   │   ├── EnvironmentCards.tsx # Grid of env cards
│   │   │   ├── EnvironmentCard.tsx  # Single env card with actions
│   │   │   └── EnvironmentSwitcher.tsx # Env selector for terminal sidebar
│   │   │
│   │   ├── variables/
│   │   │   ├── VariableList.tsx     # Table of variables
│   │   │   ├── VariableRow.tsx      # Single variable row
│   │   │   └── VariableFilters.tsx  # Filter pills (All, Secrets, Errors, Required)
│   │   │
│   │   └── terminal/
│   │       ├── TerminalPanel.tsx    # Full terminal view with sidebar
│   │       ├── TerminalInstance.tsx # xterm.js wrapper (imperative)
│   │       ├── TerminalTabs.tsx     # Tab bar for multiple terminals
│   │       └── ValidationBar.tsx   # Bottom bar with var counts/status
│   │
│   ├── stores/                     # Zustand state management
│   │   ├── projectStore.ts         # Projects list, active project, persistence
│   │   ├── environmentStore.ts     # Environments, active env, varlock load data
│   │   └── terminalStore.ts        # Terminal sessions, running processes
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useVarlockCommand.ts    # Invoke Tauri commands for varlock CLI
│   │   ├── useTerminalStream.ts    # Stream setup for xterm.js via Tauri Channel
│   │   └── useResizeObserver.ts    # Container resize for FitAddon
│   │
│   ├── lib/                        # Utilities and types
│   │   ├── types.ts                # TypeScript types (VarlockLoadResult, Variable, etc.)
│   │   ├── commands.ts             # Tauri invoke wrappers (typed)
│   │   └── constants.ts            # App constants
│   │
│   └── styles/
│       └── globals.css             # Tailwind imports + custom theme tokens
│
├── src-tauri/                      # Rust backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json            # Permissions for commands + shell
│   │
│   └── src/
│       ├── main.rs                 # Entry point (calls lib::run)
│       ├── lib.rs                  # Tauri builder, plugin registration, command registration
│       │
│       ├── commands/               # Tauri command handlers
│       │   ├── mod.rs
│       │   ├── varlock.rs          # varlock load, init, scan, version
│       │   ├── process.rs          # varlock run (streaming subprocess)
│       │   ├── project.rs          # Project CRUD, directory picker
│       │   └── filesystem.rs       # Read/write .env files, file watching
│       │
│       ├── varlock/                # Varlock CLI integration layer
│       │   ├── mod.rs
│       │   ├── cli.rs              # Build CLI commands, locate binary
│       │   ├── types.rs            # Serde types matching varlock JSON output
│       │   └── detect.rs           # Auto-detect varlock, install if missing
│       │
│       └── state/                  # App state managed by Tauri
│           ├── mod.rs
│           ├── app_state.rs        # Projects list, settings
│           └── process_state.rs    # Running process handles (for kill)
│
└── design/                         # Existing HTML mockups
    ├── varlock_gui_main_view.html
    ├── varlock_terminal_panel.html
    ├── varlock_add_project_migrate.html
    ├── varlock_interface_contract.html
    └── varlock_ui_separation_architecture.html
```

---

## 3. Architecture Layers

### Layer 1: Rust Backend (src-tauri)

```
┌─────────────────────────────────────────────┐
│                Tauri Commands                │
│  (varlock_load, varlock_run, varlock_scan,   │
│   varlock_init, project_add, project_list,   │
│   read_env_file, write_env_file, etc.)       │
├─────────────────────────────────────────────┤
│            Varlock Integration               │
│  cli.rs    - Build command args, locate bin  │
│  detect.rs - Find/install varlock            │
│  types.rs  - Serde structs for JSON output   │
├─────────────────────────────────────────────┤
│              App State                       │
│  app_state.rs    - Project list, settings    │
│  process_state.rs - Running child processes  │
├─────────────────────────────────────────────┤
│          Tauri Runtime + Plugins             │
│  tauri-plugin-dialog       (dir picker)      │
│  tauri-plugin-fs           (file r/w)        │
└─────────────────────────────────────────────┘
```

### Layer 2: React Frontend (src)

```
┌─────────────────────────────────────────────┐
│              UI Components                   │
│  Layout / Project / Environment / Variables  │
│  Terminal (xterm.js)                         │
├─────────────────────────────────────────────┤
│            Zustand Stores                    │
│  projectStore / environmentStore /           │
│  terminalStore                               │
├─────────────────────────────────────────────┤
│         Hooks + Command Layer                │
│  useVarlockCommand / useTerminalStream       │
│  commands.ts (typed invoke wrappers)         │
├─────────────────────────────────────────────┤
│          Tauri IPC Bridge                    │
│  invoke() for commands                       │
│  Channel for streaming                       │
│  listen() for events                         │
└─────────────────────────────────────────────┘
```

---

## 4. Key Data Flows

### 4a. Loading Variables (Dashboard View)

```
User opens project
  → Frontend: invoke('varlock_load', { cwd, env })
    → Rust: tokio::process::Command("varlock", ["load", "--format=json", "--cwd=...", "--env=..."])
      → Varlock CLI runs, outputs JSON to stdout
    → Rust: parse stdout as VarlockLoadResult, return to frontend
  → Frontend: store result in environmentStore
  → Frontend: render EnvironmentCards + VariableList
```

### 4b. Streaming Terminal Output (Terminal View)

```
User clicks "Launch Terminal"
  → Frontend: create Channel<ProcessEvent>
  → Frontend: invoke('varlock_run', { cwd, env, command, onEvent: channel })
    → Rust: spawn tokio::process::Command("varlock", ["run", "--", ...cmd])
      with stdout/stderr piped
    → Rust: tokio::select! loop reading stdout/stderr line by line
      → Each chunk: channel.send(ProcessEvent::Stdout { data })
      → On exit: channel.send(ProcessEvent::Exit { code })
    → Rust: store ChildProcess handle in ProcessState (for kill)
  → Frontend: channel.onmessage → terminal.write(data)
  → User sees real-time output in xterm.js
```

### 4c. Killing a Running Process

```
User clicks "Stop process"
  → Frontend: invoke('process_kill', { processId })
    → Rust: lookup handle in ProcessState → child.kill()
    → Rust: cleanup entry from ProcessState
  → Frontend: terminal shows exit signal
```

### 4d. Auto-detect Varlock

```
App startup
  → Rust: check_varlock_installed()
    → Try: Command::new("varlock").arg("--version").output()
    → If found: return version string
    → If not found: return VarlockNotFound error
  → Frontend: show "Varlock not found" dialog with "Install" button
  → User clicks Install
    → Frontend: invoke('install_varlock')
      → Rust: Command::new("npm").args(["install", "-g", "varlock"]).output()
      → Return success/error
```

---

## 5. Rust Types (Key Structs)

```rust
// varlock/types.rs - mirrors varlock load JSON output
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VarlockLoadResult {
    pub env: String,
    pub valid: bool,
    pub error_count: u32,
    pub warning_count: u32,
    pub variables: Vec<VarlockVariable>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VarlockVariable {
    pub key: String,
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub var_type: String,
    pub sensitive: bool,
    pub required: bool,
    pub valid: bool,
    pub source: Option<String>,
    pub errors: Vec<String>,
}

// Process streaming events sent via Channel
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum ProcessEvent {
    Stdout { data: String },
    Stderr { data: String },
    Exit { code: Option<i32> },
    Error { message: String },
}

// Project management
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub environments: Vec<String>,
    pub status: ProjectStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ProjectStatus {
    Valid,
    Warning,
    Error,
    Unknown,
}
```

---

## 6. TypeScript Types

```typescript
// lib/types.ts
interface VarlockLoadResult {
  env: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  variables: VarlockVariable[];
}

interface VarlockVariable {
  key: string;
  value: string | null;
  type: string;
  sensitive: boolean;
  required: boolean;
  valid: boolean;
  source: string | null;
  errors: string[];
}

type ProcessEvent =
  | { event: "stdout"; data: { data: string } }
  | { event: "stderr"; data: { data: string } }
  | { event: "exit"; data: { code: number | null } }
  | { event: "error"; data: { message: string } };

interface Project {
  id: string;
  name: string;
  path: string;
  environments: string[];
  status: "valid" | "warning" | "error" | "unknown";
}
```

---

## 7. Tauri Commands (API Surface)

| Command | Params | Returns | Notes |
|---------|--------|---------|-------|
| `check_varlock` | - | `{ installed: bool, version?: string }` | Startup check |
| `install_varlock` | - | `Result<string, string>` | npm install -g |
| `varlock_load` | `cwd, env?` | `VarlockLoadResult` | Main data source |
| `varlock_run` | `cwd, env?, command, onEvent: Channel` | `void` | Streaming |
| `varlock_scan` | `cwd` | `VarlockScanResult` | Security audit |
| `varlock_init` | `cwd` | `Result<(), string>` | Project init |
| `process_kill` | `processId` | `Result<(), string>` | Stop running process |
| `project_list` | - | `Vec<Project>` | From persisted state |
| `project_add` | `path` | `Project` | Add + detect envs |
| `project_remove` | `id` | `void` | Remove from list |
| `pick_directory` | - | `Option<String>` | Native dir picker |
| `read_env_file` | `path` | `String` | Read .env.* content |
| `write_env_file` | `path, content` | `void` | Write .env.* content |

---

## 8. Key Implementation Decisions

### Terminal Streaming: Tauri Channels (not Events)

Channels are the recommended mechanism for ordered, high-throughput streaming. They guarantee delivery order and are faster than the event system. The `varlock_run` command accepts a `Channel<ProcessEvent>` parameter and sends stdout/stderr chunks through it.

### Subprocess Management: Direct Rust (tokio::process)

Rather than using the shell plugin from the frontend, we manage subprocesses entirely in Rust. This gives us:

- Full control over process lifecycle
- Proper cleanup on app exit
- Ability to store process handles for kill
- Better security (no shell command exposure to frontend)

### State Persistence: JSON file in app data dir

Projects list and user preferences are stored as a JSON file in Tauri's app data directory (`app_data_dir()`). Simple, no database needed for MVP.

### File Watching: Rust-side notify crate

Use the `notify` crate in Rust to watch `.env.*` and `.env.schema` files. When a change is detected, emit a Tauri event to the frontend, which then calls `varlock_load` to refresh.

### Varlock Binary Detection Order

1. Check user-configured path (if set in preferences)
2. Check `PATH` for `varlock`
3. Check common locations (`~/.npm/bin`, `node_modules/.bin`)
4. If not found, prompt user to install via `npm install -g varlock`

---

## 9. Dependencies

### Frontend (package.json)

```
react, react-dom          - UI framework
@xterm/xterm              - Terminal emulator
@xterm/addon-fit          - Auto-resize terminal
@xterm/addon-webgl        - GPU rendering
@tauri-apps/api           - Tauri IPC bridge
zustand                   - State management
tailwindcss               - Styling
typescript                - Type safety
vite                      - Bundler
```

### Rust (Cargo.toml)

```
tauri (v2)                - Desktop framework
tauri-plugin-dialog       - Native file/directory dialogs
tauri-plugin-fs           - File system access
serde, serde_json         - JSON serialization
tokio                     - Async runtime (subprocess, streaming)
uuid                      - Process/project IDs
notify                    - File system watching
dirs                      - Platform-specific directories
```

---

## 10. Implementation Order (MVP)

| Phase | Tasks |
|-------|-------|
| **Phase 1: Project scaffold** | Create Tauri v2 + React + TS project, configure Tailwind, install deps |
| **Phase 2: Rust backend core** | Varlock detection, `varlock_load` command, project state management |
| **Phase 3: Frontend shell** | App layout (sidebar + main), project list, Zustand stores |
| **Phase 4: Dashboard view** | Environment cards, variable list table, data from `varlock_load` |
| **Phase 5: Terminal panel** | xterm.js component, `varlock_run` streaming via Channel, process management |
| **Phase 6: Add project flow** | Directory picker, `varlock init`, environment detection |
| **Phase 7: File watching** | notify crate watcher, auto-refresh on .env changes |
| **Phase 8: Polish** | Error handling, loading states, responsive sizing, edge cases |

---

## 11. Cross-Platform Notes

- Use `which` (Unix) / `where` (Windows) to locate varlock binary
- Use `sh -c` (Unix) / `cmd /C` (Windows) for shell commands in `varlock run`
- Use Tauri's `app_data_dir()` for platform-appropriate config storage
- Terminal font: specify fallback chain (`"Cascadia Code", "Fira Code", "Menlo", "Consolas", monospace`)
- File paths: always use `PathBuf` and `std::path::MAIN_SEPARATOR` in Rust

---

## 12. Interface Contract Summary

The UI communicates with Varlock through exactly 5 interfaces:

1. **`varlock load --format=json`** - The heartbeat. Returns all variables, their resolved values (masked if sensitive), types, validation status, and errors. Called on project open, env switch, file change, and manual refresh.

2. **`varlock run -- <command>`** - The terminal launcher. Streams stdout/stderr in real time to xterm.js. Varlock resolves env vars and injects them before spawning the child process.

3. **`varlock scan`** - Security audit. Scans project files for plaintext secret leaks. Returns structured results with file paths, line numbers, and severity.

4. **Exit codes** - Health signal. `0` = all valid (green), `1` = errors (red), `2` = warnings only (amber).

5. **Filesystem** - The write interface. Varlock has no write API. The UI writes `.env.schema` and `.env.*` files directly, then calls `varlock load` to re-validate.

**Key rule:** Your UI writes files -> Varlock reads them -> Varlock outputs JSON -> Your UI displays it.
