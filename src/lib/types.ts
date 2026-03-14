// ── Varlock CLI output types ──

export interface VarlockLoadResult {
  env: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  variables: VarlockVariable[];
}

export interface VarlockVariable {
  key: string;
  value: string | null;
  type: string;
  sensitive: boolean;
  required: boolean;
  valid: boolean;
  source: string | null;
  errors: string[];
}

export interface VarlockScanResult {
  clean: boolean;
  leakCount: number;
  leaks: VarlockLeak[];
}

export interface VarlockLeak {
  file: string;
  line: number;
  key: string;
  severity: string;
}

export interface VarlockStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

// ── Process streaming events ──

export type ProcessEvent =
  | { event: "stdout"; data: { data: string } }
  | { event: "stderr"; data: { data: string } }
  | { event: "exit"; data: { code: number | null } }
  | { event: "error"; data: { message: string } };

// ── Project types ──

export interface Project {
  id: string;
  name: string;
  path: string;
  environments: string[];
  status: ProjectStatus;
}

export type ProjectStatus =
  | "valid"
  | "warning"
  | "error"
  | "migrationNeeded"
  | "unknown";

// ── Terminal session types ──

export interface TerminalSession {
  id: string;
  processId: string | null;
  command: string;
  env: string;
  status: "idle" | "running" | "stopped" | "error";
  exitCode: number | null;
}

// ── UI view state ──

export type AppView = "dashboard" | "terminal";
