import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  EditableProjectFile,
  LaunchError,
  MergedLoadResult,
  MigrationPreview,
  MigrationResult,
  VarlockLoadResult,
  VarlockScanResult,
  VarlockStatus,
  ProcessEvent,
  Project,
  ProjectScan,
  CommandType,
  ExecutionPolicy,
  PythonEnvState,
  PythonEnvWarmupLog,
  PythonInterpreterCandidate,
} from "./types";

export interface StopStrategy {
  command: string;
  args: string[];
}

export interface LaunchOptions {
  cwdOverride?: string;
  interpreterOverride?: string;
  syncPolicy?: ExecutionPolicy;
  commandType?: CommandType;
  orchestratorStop?: StopStrategy;
  envScopePath?: string;
  requiresVenv?: boolean;
  source?: string;
}

// ── Varlock CLI commands ──

export async function checkVarlock(): Promise<VarlockStatus> {
  return invoke<VarlockStatus>("check_varlock");
}

export async function installVarlock(): Promise<string> {
  return invoke<string>("install_varlock");
}

export async function varlockLoad(
  cwd: string,
  env?: string,
): Promise<VarlockLoadResult> {
  return invoke<VarlockLoadResult>("varlock_load", { cwd, env });
}

export async function varlockLoadMerged(
  cwd: string,
  env?: string,
): Promise<MergedLoadResult> {
  return invoke<MergedLoadResult>("varlock_load_merged", { cwd, env });
}

export async function varlockInit(cwd: string): Promise<void> {
  return invoke<void>("varlock_init", { cwd });
}

export async function varlockScan(cwd: string): Promise<VarlockScanResult> {
  return invoke<VarlockScanResult>("varlock_scan", { cwd });
}

// ── Migration ──

export async function getMigrationPreview(cwd: string): Promise<MigrationPreview> {
  return invoke<MigrationPreview>("get_migration_preview", { cwd });
}

export async function migrateProjectToVarlock(cwd: string): Promise<MigrationResult> {
  return invoke<MigrationResult>("migrate_project_to_varlock", { cwd });
}

/** Backward-compatible aliases. */
export const migrationPlan = getMigrationPreview;
export const migrationApply = async (
  cwd: string,
  _schemaContent: string,
  _createBackups: boolean,
) => migrateProjectToVarlock(cwd);

// ── Process management ──

export async function varlockRun(
  cwd: string,
  command: string,
  onEvent: (event: ProcessEvent) => void,
  env?: string,
  launchOptions?: LaunchOptions,
): Promise<string> {
  const channel = new Channel<ProcessEvent>();
  channel.onmessage = onEvent;
  try {
    return await invoke<string>("varlock_run", {
      cwd,
      env,
      command,
      launchOptions,
      onEvent: channel,
    });
  } catch (err) {
    throw err as LaunchError;
  }
}

export async function processKill(processId: string): Promise<void> {
  return invoke<void>("process_kill", { processId });
}

export async function stopCommand(sessionId: string): Promise<void> {
  return invoke<void>("stop_command", { sessionId });
}

export async function directRun(
  cwd: string,
  command: string,
  onEvent: (event: ProcessEvent) => void,
): Promise<string> {
  const channel = new Channel<ProcessEvent>();
  channel.onmessage = onEvent;
  return invoke<string>("direct_run", {
    cwd,
    command,
    onEvent: channel,
  });
}

// ── Project management ──

export async function projectList(): Promise<Project[]> {
  return invoke<Project[]>("project_list");
}

export async function projectAdd(path: string): Promise<Project> {
  return invoke<Project>("project_add", { path });
}

export async function projectCloneGithub(
  url: string,
  destinationParent: string,
  folderName?: string,
): Promise<Project> {
  return invoke<Project>("project_clone_github", {
    url,
    destinationParent,
    folderName,
  });
}

export async function projectRemove(id: string): Promise<void> {
  return invoke<void>("project_remove", { id });
}

export async function pickDirectory(): Promise<string | null> {
  return invoke<string | null>("pick_directory");
}

// ── Filesystem ──

export async function readEnvFile(path: string): Promise<string> {
  return invoke<string>("read_env_file", { path });
}

export async function writeEnvFile(
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>("write_env_file", { path, content });
}

export async function listEnvFiles(cwd: string): Promise<string[]> {
  return invoke<string[]>("list_env_files", { cwd });
}

export async function listEditableProjectFiles(
  cwd: string,
): Promise<EditableProjectFile[]> {
  return invoke<EditableProjectFile[]>("list_editable_project_files", { cwd });
}

export async function readProjectFile(
  cwd: string,
  relativePath: string,
): Promise<string> {
  return invoke<string>("read_project_file", { cwd, relativePath });
}

export async function writeProjectFile(
  cwd: string,
  relativePath: string,
  content: string,
): Promise<void> {
  return invoke<void>("write_project_file", { cwd, relativePath, content });
}

export async function watchProject(
  projectId: string,
  cwd: string,
): Promise<void> {
  return invoke<void>("watch_project", { projectId, cwd });
}

export async function unwatchProject(projectId: string): Promise<void> {
  return invoke<void>("unwatch_project", { projectId });
}

// ── Discovery commands ──

export async function scanProject(cwd: string): Promise<ProjectScan> {
  return invoke<ProjectScan>("scan_project", { cwd });
}

export async function saveCustomCommand(
  cwd: string,
  name: string,
  command: string,
  category: string,
): Promise<void> {
  return invoke<void>("save_custom_command", { cwd, name, command, category });
}

export async function getPythonEnvState(
  cwd: string,
  rootCwd?: string,
): Promise<PythonEnvState> {
  return invoke<PythonEnvState>("get_python_env_state", { cwd, rootCwd });
}

export async function warmupPythonEnv(
  cwd: string,
  rootCwd?: string,
): Promise<PythonEnvWarmupLog> {
  return invoke<PythonEnvWarmupLog>("warmup_python_env", { cwd, rootCwd });
}

export async function listPythonInterpreters(cwd: string): Promise<PythonInterpreterCandidate[]> {
  return invoke<PythonInterpreterCandidate[]>("list_python_interpreters_cmd", { cwd });
}

export async function setPreferredPythonInterpreter(
  rootCwd: string,
  scopedCwd: string,
  interpreterPath: string,
): Promise<void> {
  return invoke<void>("set_preferred_python_interpreter_cmd", {
    rootCwd,
    scopedCwd,
    interpreterPath,
  });
}

export async function rebuildPythonEnv(
  cwd: string,
  rootCwd?: string,
): Promise<PythonEnvWarmupLog> {
  return invoke<PythonEnvWarmupLog>("rebuild_python_env", { cwd, rootCwd });
}

// ── Terminal commands ──

export async function openTerminalAt(cwd: string): Promise<void> {
  return invoke<void>("open_terminal_at", { cwd });
}

export async function openInEditor(cwd: string, editor: string): Promise<void> {
  return invoke<void>("open_in_editor", { cwd, editor });
}

export async function openInExplorer(cwd: string): Promise<void> {
  return invoke<void>("open_in_explorer", { cwd });
}

export async function attachToProcess(
  pid: number,
  cwd: string,
): Promise<void> {
  return invoke<void>("attach_to_process", { pid, cwd });
}

export async function runInTerminal(
  cwd: string,
  command: string,
): Promise<void> {
  return invoke<void>("run_in_terminal", { cwd, command });
}
