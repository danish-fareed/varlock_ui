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

export interface EditableProjectFile {
  relativePath: string;
  exists: boolean;
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

export type AppView = "dashboard" | "vault" | "commands";

// ── Command discovery types ──

export type CommandCategory =
  | "dev-server"
  | "build"
  | "test"
  | "database"
  | "code-quality"
  | "deploy"
  | "docker"
  | "custom"
  | "other";

export interface DiscoveredCommand {
  id: string;
  name: string;
  rawCmd: string;
  sourceFile: string;
  category: CommandCategory;
  isCustom: boolean;
  sortOrder: number;
}

export interface ProjectScan {
  commands: DiscoveredCommand[];
  techStack: string[];
  hasVarlock: boolean;
  envTier: string;
  envFiles: string[];
}

export interface RunningCommandInfo {
  commandId: string;
  sessionId: string;
  status: "running" | "error" | "stopped";
  startedAt: number;
  envName: string;
  logPeek: string[];
  exitCode?: number | null;
}

// ── Vault types ──

export interface VaultStatusResult {
  initialized: boolean;
  unlocked: boolean;
  hasKeychainKey: boolean;
}

export interface VaultVariable {
  key: string;
  value: string;
  env: string;
  varType: string;
  sensitive: boolean;
  required: boolean;
  description: string;
}

export type SecretType = "hex" | "base64" | "uuid" | "alphanumeric" | "password";


// ── Schema editing types ──

/** Supported variable types for .env.schema decorators */
export type SchemaVarType =
  | "string"
  | "url"
  | "port"
  | "number"
  | "boolean"
  | "enum"
  | "email"
  | "path";

/** A single decorator parsed from .env.schema comments */
export interface SchemaDecorator {
  name: string;
  value: string | null;
}

/** Parsed entry from .env.schema file */
export interface SchemaEntry {
  key: string;
  /** The base/default value in .env.schema */
  baseValue: string;
  /** Parsed decorator metadata */
  type: SchemaVarType;
  required: boolean;
  sensitive: boolean;
  description: string;
  enumValues: string[];
  /** All raw decorators from the comment block */
  decorators: SchemaDecorator[];
  /** Line range in the schema file (1-indexed) */
  lineStart: number;
  lineEnd: number;
}

/** Whether metadata was confirmed from schema or inferred by heuristic */
export type MetadataSource = "schema" | "inferred";

/** Value state for a variable in a specific env file */
export interface FileValue {
  relativePath: string;
  value: string | null;
  exists: boolean;
}

/** Rich variable model combining CLI output, schema metadata, and per-file values */
export interface EditableVariable {
  key: string;
  /** Resolved runtime value from varlock load */
  resolvedValue: string | null;
  /** Source file that provided the resolved value */
  resolvedSource: string | null;
  /** Schema entry if parsed from .env.schema */
  schema: SchemaEntry | null;
  /** Per-file values loaded from .env.* files */
  fileValues: FileValue[];
  /** Metadata with source tracking */
  type: SchemaVarType;
  typeSource: MetadataSource;
  required: boolean;
  requiredSource: MetadataSource;
  sensitive: boolean;
  sensitiveSource: MetadataSource;
  description: string;
  /** Validation state */
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Merged load result (from Rust schema parser + CLI output) ──

/** A variable with merged metadata from both CLI output and Rust schema parsing. */
export interface MergedVariable {
  key: string;
  /** Resolved runtime value from varlock load */
  value: string | null;
  /** Source file that provided the resolved value */
  source: string | null;
  /** Variable type (from schema if available, otherwise inferred) */
  type: string;
  /** Where the type came from: "schema" or "inferred" */
  typeSource: MetadataSource;
  required: boolean;
  requiredSource: MetadataSource;
  sensitive: boolean;
  sensitiveSource: MetadataSource;
  description: string;
  /** Enum values if type is enum */
  enumValues: string[];
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Whether a schema entry exists for this variable */
  hasSchema: boolean;
  /** The base value from the schema (if present) */
  schemaBaseValue: string | null;
  /** Line range in schema file (if present) */
  schemaLineStart: number | null;
  schemaLineEnd: number | null;
}

/** The full merged result returned from the Rust backend. */
export interface MergedLoadResult {
  env: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  variables: MergedVariable[];
  /** Warnings from schema parsing (if any) */
  schemaWarnings: string[];
  /** Whether a .env.schema file was found and parsed */
  schemaParsed: boolean;
}

// ── Saved run configuration ──

export interface SavedRunConfig {
  id: string;
  label: string;
  command: string;
  env: string | null;
  lastUsed: number;
}

// ── Migration types ──

export type MigrationFileRole =
  | "schema-seed"
  | "shared-defaults"
  | "local-overrides"
  | "environment"
  | "schema"
  | "unknown";

export interface DetectedEnvFile {
  relativePath: string;
  role: MigrationFileRole;
  variableCount: number;
  sensitiveKeyCount: number;
  exists: boolean;
}

export interface MigrationVariable {
  key: string;
  value: string;
  inferredType: SchemaVarType;
  inferredSensitive: boolean;
  sourceFile: string;
  /** Decorators that will be generated */
  decorators: string[];
}

export interface MigrationPlan {
  detectedFiles: DetectedEnvFile[];
  variables: MigrationVariable[];
  schemaPreview: string;
  conflicts: string[];
  backupPaths: string[];
  hasExistingSchema: boolean;
}

export interface MigrationApplyResult {
  schemaPath: string;
  backupsCreated: string[];
  filesWritten: string[];
  success: boolean;
  message: string;
}
