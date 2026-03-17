import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DEFAULT_TYPE_BADGE, TYPE_BADGE_STYLES } from "@/lib/constants";
import type {
  EditableProjectFile,
  EditableVariable,
  FileValue,
  SchemaEntry,
  SchemaVarType,
} from "@/lib/types";
import { getEnvValue, getSourceFileName, upsertEnvValue } from "@/lib/envFile";
import { updateSchemaEntry, serializeSchemaEntry } from "@/lib/schemaParser";
import { isSensitiveKey } from "@/lib/utils";
import { X } from "lucide-react";

// ── Types ──

interface VariableDetailDrawerProps {
  variable: EditableVariable;
  editableFiles: EditableProjectFile[];
  fileContents: Record<string, string>;
  activeEnv: string;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSaveEnvFile: (args: { relativePath: string; content: string }) => Promise<void>;
  onSaveSchemaFile: (args: { content: string }) => Promise<void>;
}

const SCHEMA_TYPES: SchemaVarType[] = [
  "string", "url", "port", "number", "boolean", "enum", "email", "path",
];

// ── Helpers ──

function formatFileLabel(relativePath: string): string {
  if (relativePath === ".env") return ".env (shared)";
  if (relativePath === ".env.local") return ".env.local (local)";
  if (relativePath === ".env.schema") return ".env.schema";
  return relativePath;
}

function getFileValueStatus(
  fileValue: FileValue,
  resolvedSource: string | null,
): "source" | "override" | "inherited" | "missing" | "empty" {
  if (!fileValue.exists) return "missing";
  if (fileValue.value === null) return "missing";
  if (fileValue.value === "") return "empty";
  const sourceFile = getSourceFileName(resolvedSource);
  if (sourceFile === fileValue.relativePath) return "source";
  return "override";
}

const FILE_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  source: { label: "active source", className: "bg-success-light text-success-dark" },
  override: { label: "override", className: "bg-warning-light text-warning-dark" },
  inherited: { label: "inherited", className: "bg-accent-light text-accent" },
  missing: { label: "not set", className: "bg-surface-tertiary text-text-muted" },
  empty: { label: "empty", className: "bg-warning-light text-warning-dark" },
};

// ── Main Component ──

export function VariableDetailDrawer({
  variable,
  editableFiles,
  fileContents,
  activeEnv,
  isSaving,
  saveError,
  onClose,
  onSaveEnvFile,
  onSaveSchemaFile,
}: VariableDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const [showSecret, setShowSecret] = useState(false);

  // ── Schema tab state ──
  const [draftType, setDraftType] = useState<SchemaVarType>(variable.type);
  const [draftRequired, setDraftRequired] = useState(variable.required);
  const [draftSensitive, setDraftSensitive] = useState(variable.sensitive);
  const [draftDescription, setDraftDescription] = useState(variable.description);
  const [draftEnumValues, setDraftEnumValues] = useState(
    variable.schema?.enumValues.join(", ") ?? "",
  );

  // ── Environment tab state ──
  const envFiles = useMemo(
    () => editableFiles.filter((f) => f.relativePath !== ".env.schema"),
    [editableFiles],
  );

  const activeEnvPath = `.env.${activeEnv}`;
  const initialFile = useMemo(() => {
    const sourceFile = getSourceFileName(variable.resolvedSource);
    if (sourceFile && envFiles.some((f) => f.relativePath === sourceFile)) return sourceFile;
    if (envFiles.some((f) => f.relativePath === activeEnvPath)) return activeEnvPath;
    if (envFiles.some((f) => f.relativePath === ".env")) return ".env";
    return envFiles[0]?.relativePath ?? activeEnvPath;
  }, [activeEnvPath, envFiles, variable.resolvedSource]);

  const [selectedFile, setSelectedFile] = useState(initialFile);
  const [draftValue, setDraftValue] = useState("");

  // Reset env draft when file or variable changes
  useEffect(() => {
    setSelectedFile(initialFile);
  }, [initialFile, variable.key]);

  useEffect(() => {
    const content = fileContents[selectedFile] ?? "";
    const currentValue = getEnvValue(content, variable.key);
    setDraftValue(currentValue ?? "");
  }, [fileContents, selectedFile, variable.key]);

  // Reset schema draft when variable changes
  useEffect(() => {
    setDraftType(variable.type);
    setDraftRequired(variable.required);
    setDraftSensitive(variable.sensitive);
    setDraftDescription(variable.description);
    setDraftEnumValues(variable.schema?.enumValues.join(", ") ?? "");
  }, [variable.key]);

  // ── Focus management ──
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    const handleFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, []);

  // ── Dirty tracking ──
  const currentContent = fileContents[selectedFile] ?? "";
  const currentStoredValue = getEnvValue(currentContent, variable.key) ?? "";
  const isEnvDirty = draftValue !== currentStoredValue;

  const isSchemaDirty =
    draftType !== variable.type ||
    draftRequired !== variable.required ||
    draftSensitive !== variable.sensitive ||
    draftDescription !== variable.description ||
    draftEnumValues !== (variable.schema?.enumValues.join(", ") ?? "");

  const isDirty = isEnvDirty || isSchemaDirty;

  // ── Close handling ──
  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty) {
      const shouldDiscard = window.confirm("Discard your unsaved changes for this variable?");
      if (!shouldDiscard) return;
    }
    onClose();
  }, [isSaving, isDirty, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  // ── Save handlers ──
  const handleSaveEnv = async () => {
    if (!selectedFile || !isEnvDirty) return;
    const nextContent = upsertEnvValue(currentContent, variable.key, draftValue);
    await onSaveEnvFile({ relativePath: selectedFile, content: nextContent });
  };

  const handleSaveSchema = async () => {
    if (!isSchemaDirty) return;
    const schemaContent = fileContents[".env.schema"] ?? "";

    const updatedEntry: SchemaEntry = {
      key: variable.key,
      baseValue: variable.schema?.baseValue ?? variable.resolvedValue ?? "",
      type: draftType,
      required: draftRequired,
      sensitive: draftSensitive,
      description: draftDescription,
      enumValues:
        draftType === "enum"
          ? draftEnumValues
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean)
          : [],
      decorators: [],
      lineStart: variable.schema?.lineStart ?? 0,
      lineEnd: variable.schema?.lineEnd ?? 0,
    };

    let nextSchemaContent: string;
    if (schemaContent && variable.schema) {
      nextSchemaContent = updateSchemaEntry(schemaContent, updatedEntry);
    } else if (schemaContent) {
      const block = serializeSchemaEntry(updatedEntry);
      const lineEnding = schemaContent.includes("\r\n") ? "\r\n" : "\n";
      const hasTrailing = schemaContent.endsWith("\n");
      nextSchemaContent = schemaContent + (hasTrailing ? lineEnding : lineEnding + lineEnding) + block + lineEnding;
    } else {
      nextSchemaContent = serializeSchemaEntry(updatedEntry) + "\n";
    }

    await onSaveSchemaFile({ content: nextSchemaContent });
  };

  const handleSaveAll = async () => {
    if (isSchemaDirty) await handleSaveSchema();
    if (isEnvDirty) await handleSaveEnv();
  };

  // ── Display values ──
  const typeBadge = TYPE_BADGE_STYLES[variable.type] ?? DEFAULT_TYPE_BADGE;
  const displayResolvedValue =
    variable.resolvedValue === null
      ? "Missing"
      : variable.sensitive && !showSecret
        ? "Hidden"
        : variable.resolvedValue;

  // ── File values for per-file display ──
  const fileValueRows = useMemo(() => {
    return envFiles.map((file) => {
      const content = fileContents[file.relativePath] ?? "";
      const value = file.exists ? getEnvValue(content, variable.key) : null;
      const fv: FileValue = {
        relativePath: file.relativePath,
        value,
        exists: file.exists,
      };
      const status = getFileValueStatus(fv, variable.resolvedSource);
      return { ...fv, status };
    });
  }, [envFiles, fileContents, variable.key, variable.resolvedSource]);


  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close variable detail"
        className="flex-1 cursor-default"
        onClick={requestClose}
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="h-full w-full max-w-[560px] border-l border-border-light bg-surface shadow-lg flex flex-col animate-slide-in-right"
      >
        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-border-light flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted mb-2">
              Variable Detail
            </p>
            <h2 id={titleId} className="text-lg font-medium text-text font-mono truncate">
              {variable.key}
            </h2>
            <p id={descriptionId} className="text-sm text-text-secondary mt-1 leading-6">
              {variable.description || "No description available."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            className="text-text-muted hover:text-text transition-colors cursor-pointer shrink-0 mt-1 w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-tertiary"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </div>

        {/* ── Summary badges ── */}
        <div className="px-5 py-3 border-b border-border-light">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${typeBadge}`}
            >
              {variable.type}
            </span>
            {variable.typeSource === "inferred" && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-tertiary text-text-muted italic">
                inferred
              </span>
            )}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-tertiary text-text-secondary">
              {variable.required ? "required" : "optional"}
            </span>
            {variable.sensitive && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-light text-accent">
                sensitive
              </span>
            )}
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                variable.valid ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"
              }`}
            >
              {variable.valid ? "valid" : "needs attention"}
            </span>
            {!variable.sensitive && isSensitiveKey(variable.key) && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-light text-accent animate-pulse-soft">
                Highly recommended for Vault
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mt-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Resolved value</div>
              <div className="font-mono text-text break-all text-xs">{displayResolvedValue}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Source</div>
              <div className="font-mono text-text-secondary break-all text-xs">
                {getSourceFileName(variable.resolvedSource) ?? "Unknown"}
              </div>
            </div>
          </div>

          {variable.sensitive && variable.resolvedValue !== null && (
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer mt-2"
            >
              {showSecret ? "Hide resolved value" : "Reveal resolved value"}
            </button>
          )}
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-auto px-6 py-6 space-y-8">
          
          {/* Validation Errors */}
          {variable.errors.length > 0 && (
            <div className="space-y-2">
              {variable.errors.map((error, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-danger/20 bg-danger-light px-3 py-2.5 text-sm text-danger-dark leading-5"
                >
                  <span className="font-semibold mr-1">Error:</span>{error}
                </div>
              ))}
            </div>
          )}

          {/* Section 1: Quick Edit */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Value ({formatFileLabel(selectedFile)})
            </h3>
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[14px] text-text font-mono outline-none focus:border-accent transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              placeholder="Enter value..."
            />
            {envFiles.length > 1 && (
              <div className="mt-2 text-right">
                <span className="text-[11px] text-text-muted mr-2">Target file:</span>
                <select
                  value={selectedFile}
                  onChange={(e) => setSelectedFile(e.target.value)}
                  className="text-xs text-text bg-surface border border-border-light rounded-md px-2 py-1 outline-none focus:border-accent cursor-pointer hover:bg-surface-secondary transition-colors"
                >
                  {envFiles.map((file) => (
                    <option key={file.relativePath} value={file.relativePath}>
                      {formatFileLabel(file.relativePath)}
                      {file.exists ? "" : " (new)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* Section 2: Rules (Schema) */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              Rules & Metadata
              {variable.schema === null ? (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-warning-light text-warning-dark normal-case tracking-normal">Inferred</span>
              ) : (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-success-light text-success-dark normal-case tracking-normal">Confirmed</span>
              )}
            </h3>
            
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] text-text-secondary mb-1.5 block">Description</span>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent resize-none transition-colors"
                  placeholder="Brief description of this variable's purpose"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-text-secondary mb-1.5 block">Type</span>
                  <select
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value as SchemaVarType)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent transition-colors"
                  >
                    {SCHEMA_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                {draftType === "enum" ? (
                  <label className="block">
                    <span className="text-[11px] text-text-secondary mb-1.5 block">Allowed values</span>
                    <input
                      value={draftEnumValues}
                      onChange={(e) => setDraftEnumValues(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text font-mono outline-none focus:border-accent transition-colors"
                      placeholder="comma, separated"
                    />
                  </label>
                ) : (
                  <div /> // Spacer
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <ToggleField
                  label="Required"
                  description="Must have a non-empty value"
                  checked={draftRequired}
                  onChange={setDraftRequired}
                />
                <ToggleField
                  label="Sensitive"
                  description="Masked in UI & logs"
                  checked={draftSensitive}
                  onChange={setDraftSensitive}
                />
              </div>
            </div>
          </section>

          {/* Section 3: File Context (Advanced) */}
          <section>
            <details className="group">
              <summary className="text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer list-none flex items-center gap-2 hover:text-text transition-colors select-none">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                Values Across Files (Advanced)
              </summary>
              <div className="mt-4 rounded-xl border border-border-light overflow-hidden bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                {fileValueRows.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-text-muted text-center">
                    No environment files found.
                  </div>
                ) : (
                  fileValueRows.map((row, idx) => {
                    const style = FILE_STATUS_STYLES[row.status] ?? FILE_STATUS_STYLES.missing!;
                    return (
                      <div
                        key={row.relativePath}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 ${
                          idx > 0 ? "border-t border-border-light" : ""
                        } ${
                          selectedFile === row.relativePath
                            ? "bg-accent-light/10"
                            : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono text-text truncate font-medium">
                            {formatFileLabel(row.relativePath)}
                          </div>
                          <div className="text-[11px] font-mono text-text-muted truncate mt-1">
                            {row.value !== null ? row.value || <span className="italic">empty string</span> : "—"}
                          </div>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${style.className}`}>
                          {style.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          </section>

          {saveError && (
            <div className="mt-4 rounded-xl border border-danger/20 bg-danger-light px-3 py-3 text-sm text-danger-dark">
              {saveError}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-border-light flex items-center justify-between gap-3 bg-surface-secondary">
          <div className="text-xs text-text-muted">
            {isDirty ? (
              <span className="text-warning">
                Unsaved changes
                {isSchemaDirty && isEnvDirty
                  ? " (schema + env)"
                  : isSchemaDirty
                    ? " (schema)"
                    : " (env value)"}
              </span>
            ) : (
              "No unsaved changes"
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-lg border border-border text-xs text-text hover:bg-surface-secondary transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!isDirty || isSaving}
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {isSaving ? "Saving..." : "Save and reload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toggle Field ──

interface ToggleFieldProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-xl border px-3 py-3 text-left transition-colors cursor-pointer ${
        checked
          ? "border-accent/30 bg-accent-light/50"
          : "border-border-light bg-surface hover:border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-text">{label}</span>
        <span
          className={`w-8 h-4.5 rounded-full transition-colors relative ${
            checked ? "bg-accent" : "bg-border-light"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm ${
              checked ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
      </div>
      <p className="text-[10.5px] text-text-muted leading-snug">{description}</p>
    </button>
  );
}
