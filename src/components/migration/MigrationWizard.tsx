import { useState, useCallback, useEffect } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useVarlockCommand } from "@/hooks/useVarlockCommand";
import * as commands from "@/lib/commands";
import { Check, FolderSearch } from "lucide-react";
import type {
  MigrationPlan,
  MigrationApplyResult,
  DetectedEnvFile,
  MigrationVariable,
} from "@/lib/types";

// ── Step definitions ──

const STEPS = ["Locate", "Migrate", "Configure", "Done"] as const;

// ── Role display helpers ──

const ROLE_LABELS: Record<string, string> = {
  "schema-seed": "Schema seed",
  "shared-defaults": "Shared defaults",
  "local-overrides": "Local overrides",
  environment: "Environment",
  schema: "Existing schema",
  unknown: "Detected file",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  "schema-seed": "will become .env.schema",
  "shared-defaults": "shared values detected",
  "local-overrides": "gitignored, local overrides",
  environment: "environment-specific values",
  schema: "existing schema file",
  unknown: "dotenv file",
};

const ROLE_DOT_COLORS: Record<string, { bg: string; dot: string }> = {
  "schema-seed": { bg: "#E8FAE9", dot: "#1E7A2E" },
  "shared-defaults": { bg: "#FFF4E5", dot: "#8A4D00" },
  "local-overrides": { bg: "#FFEDED", dot: "#A51D14" },
  environment: { bg: "#E8F2FF", dot: "#0A5DC2" },
  schema: { bg: "#E8F2FF", dot: "#0A84FF" },
  unknown: { bg: "#F5F5F7", dot: "#6E6E73" },
};

// ── Badge styles for inferred types ──

function getTypeBadgeStyle(type: string): { bg: string; text: string } {
  switch (type) {
    case "url":
      return { bg: "#E8F2FF", text: "#0A5DC2" };
    case "port":
      return { bg: "#E8FAE9", text: "#1E7A2E" };
    case "boolean":
      return { bg: "#E8FAE9", text: "#1E7A2E" };
    case "number":
      return { bg: "#E8F2FF", text: "#0A5DC2" };
    case "enum":
      return { bg: "#FFF4E5", text: "#8A4D00" };
    case "email":
      return { bg: "#E8F2FF", text: "#0A5DC2" };
    case "path":
      return { bg: "#F5F5F7", text: "#6E6E73" };
    default:
      return { bg: "#F5F5F7", text: "#6E6E73" };
  }
}

// ── Main Component ──

export function MigrationWizard() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const refreshActiveProject = useProjectStore((s) => s.refreshActiveProject);
  const { loadCurrentEnvironment } = useVarlockCommand();

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [applyResult, setApplyResult] = useState<MigrationApplyResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createBackups, setCreateBackups] = useState(true);
  const [editedSchemaPreview, setEditedSchemaPreview] = useState<string>("");

  useEffect(() => {
    if (activeProject?.path) {
      loadPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path]);

  const loadPlan = useCallback(async () => {
    if (!activeProject?.path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await commands.migrationPlan(activeProject.path);
      setPlan(result);
      setEditedSchemaPreview(result.schemaPreview);
      setCurrentStep(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProject?.path]);

  const handleApply = useCallback(async () => {
    if (!activeProject?.path || !editedSchemaPreview) return;
    setLoading(true);
    setError(null);
    try {
      const result = await commands.migrationApply(
        activeProject.path,
        editedSchemaPreview,
        createBackups,
      );

      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      try {
        await commands.varlockInit(activeProject.path);
      } catch {
        // init may fail if already initialized, that's OK
      }

      setApplyResult(result);
      setCurrentStep(3);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProject?.path, editedSchemaPreview, createBackups]);

  const handleFinish = useCallback(async () => {
    await refreshActiveProject();
    await loadCurrentEnvironment();
  }, [refreshActiveProject, loadCurrentEnvironment]);

  const stepName = STEPS[currentStep] ?? "Locate";

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col bg-surface animate-fade-in">
      <div className="rounded-2xl border border-border-light overflow-hidden bg-surface flex flex-col min-h-[540px] shadow-lg">
        {/* Header with stepper */}
        <WizardHeader currentStep={currentStep} />

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 flex gap-5">
          {error && (
            <div className="absolute top-0 left-0 right-0 mx-5 mt-2">
              <div
                className="bg-danger-light text-danger-dark text-xs px-3 py-2 rounded-lg border border-danger/15"
                role="alert"
              >
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 underline cursor-pointer"
                >
                  dismiss
                </button>
              </div>
            </div>
          )}

          {stepName === "Locate" && (
            <LocateStep
              projectPath={activeProject?.path ?? ""}
              loading={loading}
              onLoadPlan={loadPlan}
            />
          )}

          {stepName === "Migrate" && plan && (
            <MigrateStep plan={plan} schemaPreview={editedSchemaPreview} />
          )}

          {stepName === "Configure" && plan && (
            <ConfigureStep
              plan={plan}
              schemaPreview={editedSchemaPreview}
              onSchemaChange={setEditedSchemaPreview}
              createBackups={createBackups}
              onBackupsChange={setCreateBackups}
            />
          )}

          {stepName === "Done" && applyResult && (
            <DoneStep result={applyResult} />
          )}

          {/* Loading overlay for body */}
          {loading && stepName !== "Locate" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-text-muted text-sm">
                {currentStep === 3
                  ? "Applying migration..."
                  : "Loading migration plan..."}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <WizardFooter
          currentStep={currentStep}
          loading={loading}
          plan={plan}
          onBack={() => setCurrentStep((s) => Math.max(0, s - 1))}
          onNext={() => setCurrentStep((s) => Math.min(3, s + 1))}
          onApply={handleApply}
          onFinish={handleFinish}
        />
      </div>
    </div>
  );
}

// ── Header ──

function WizardHeader({ currentStep }: { currentStep: number }) {
  return (
    <div className="px-5 py-4 border-b border-border-light flex items-center gap-3 bg-surface">
      <h2 className="text-[15px] font-medium text-text flex-1">
        Migrate to Varlock
      </h2>
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div className="w-6 h-px bg-border-light mx-1" />
            )}
            <div className="flex items-center gap-1.5">
              <StepIndicator index={i} currentStep={currentStep} />
              <span
                className={`text-xs ${
                  i === currentStep
                    ? "text-text font-medium"
                    : i < currentStep
                      ? "text-text-secondary"
                      : "text-text-muted"
                }`}
              >
                {step}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepIndicator({
  index,
  currentStep,
}: {
  index: number;
  currentStep: number;
}) {
  const isDone = index < currentStep;
  const isActive = index === currentStep;

  return (
    <div
      className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
      style={{
        background: isDone
          ? "#34C759"
          : isActive
            ? "#0A84FF"
            : "transparent",
        borderColor: isDone
          ? "#34C759"
          : isActive
            ? "#0A84FF"
            : "var(--color-border)",
        borderWidth: "1px",
        borderStyle: "solid",
        color: isDone
          ? "#FFFFFF"
          : isActive
            ? "#FFFFFF"
            : "var(--color-text-muted)",
      }}
    >
      {isDone ? (
        <Check size={10} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        index + 1
      )}
    </div>
  );
}

// ── Footer ──

function WizardFooter({
  currentStep,
  loading,
  plan,
  onBack,
  onNext,
  onApply,
  onFinish,
}: {
  currentStep: number;
  loading: boolean;
  plan: MigrationPlan | null;
  onBack: () => void;
  onNext: () => void;
  onApply: () => void;
  onFinish: () => void;
}) {
  const stepName = STEPS[currentStep] ?? "Locate";

  return (
    <div className="px-5 py-3.5 border-t border-border-light flex items-center gap-2.5 bg-surface-secondary">
      <div className="text-[11px] text-text-muted flex-1">
        {stepName === "Locate" &&
          "Select a project to analyze its environment files"}
        {stepName === "Migrate" &&
          "Review detected files and inferred schema before continuing"}
        {stepName === "Configure" &&
          "Generated schema will be written to .env.schema — original files kept as backup"}
        {stepName === "Done" && "Migration complete — your project is ready"}
      </div>

      {stepName !== "Done" && currentStep > 0 && (
        <button
          onClick={onBack}
          disabled={loading}
          className="px-4 py-1.5 text-xs text-text border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer disabled:opacity-50"
        >
          Back
        </button>
      )}

      {stepName === "Migrate" && (
        <button
          onClick={onNext}
          disabled={loading || !plan}
          className="px-4 py-1.5 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
        >
          Continue
        </button>
      )}

      {stepName === "Configure" && (
        <button
          onClick={onApply}
          disabled={loading || !plan}
          className="px-4 py-1.5 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
        >
          {loading ? "Applying..." : "Apply migration"}
        </button>
      )}

      {stepName === "Done" && (
        <button
          onClick={onFinish}
          className="px-4 py-1.5 text-xs text-white bg-success rounded-lg hover:bg-success-dark transition-colors cursor-pointer shadow-sm"
        >
          Go to dashboard
        </button>
      )}
    </div>
  );
}

// ── Step 1: Locate ──

function LocateStep({
  projectPath,
  loading,
  onLoadPlan,
}: {
  projectPath: string;
  loading: boolean;
  onLoadPlan: () => void;
}) {
  const dirName = projectPath.split(/[\\/]/).pop() ?? projectPath;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-accent-light border border-accent/15 flex items-center justify-center shadow-sm">
        <FolderSearch
          size={20}
          strokeWidth={1.2}
          className="text-accent"
          aria-hidden="true"
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text mb-1">{dirName}</p>
        <p className="text-xs text-text-muted max-w-xs">{projectPath}</p>
      </div>
      <p className="text-xs text-text-secondary max-w-sm text-center leading-5">
        This project has environment files but no <code className="text-accent font-medium">.env.schema</code> yet.
        We'll scan the files and generate a schema for you.
      </p>
      <button
        onClick={onLoadPlan}
        disabled={loading}
        className="px-5 py-2 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
      >
        {loading ? "Scanning..." : "Scan environment files"}
      </button>
    </div>
  );
}

// ── Step 2: Migrate ──

function MigrateStep({
  plan,
  schemaPreview,
}: {
  plan: MigrationPlan;
  schemaPreview: string;
}) {
  return (
    <>
      {/* Left panel — detected files + migration map */}
      <div className="flex-1 overflow-auto min-w-0">
        {/* Detected files */}
        <SectionTitle>Detected files</SectionTitle>
        <div className="flex flex-col gap-1.5 mb-5">
          {plan.detectedFiles.map((file) => (
            <FileItem key={file.relativePath} file={file} />
          ))}
        </div>

        {/* Migration map */}
        <SectionTitle>
          Migration map — inferred schema
        </SectionTitle>
        <MigrationMap variables={plan.variables} />

        {/* Conflicts */}
        {plan.conflicts.length > 0 && (
          <div className="mt-4">
            <SectionTitle>Conflicts</SectionTitle>
            <div className="rounded-lg border border-warning/20 bg-warning-light p-3">
              {plan.conflicts.map((c, i) => (
                <p key={i} className="text-xs text-warning-dark leading-5">
                  {c}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel — schema preview */}
      <div className="w-[280px] shrink-0">
        <SectionTitle>Generated .env.schema preview</SectionTitle>
        <SchemaPreviewBox content={schemaPreview} />

        {/* Sensitive keys callout */}
        <SensitiveCallout plan={plan} />
      </div>
    </>
  );
}

// ── Step 3: Configure ──

function ConfigureStep({
  plan,
  schemaPreview,
  onSchemaChange,
  createBackups,
  onBackupsChange,
}: {
  plan: MigrationPlan;
  schemaPreview: string;
  onSchemaChange: (v: string) => void;
  createBackups: boolean;
  onBackupsChange: (v: boolean) => void;
}) {
  return (
    <>
      {/* Left panel — editable schema */}
      <div className="flex-1 overflow-auto min-w-0 flex flex-col">
        <SectionTitle>Review generated .env.schema</SectionTitle>
        <p className="text-xs text-text-secondary mb-3 leading-5">
          You can edit the schema below before applying. The original environment
          files will not be modified.
        </p>
        <textarea
          value={schemaPreview}
          onChange={(e) => onSchemaChange(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-[300px] w-full bg-[#1C1C1E] text-[#E5E5EA] border border-border-light rounded-xl p-4 font-mono text-[11px] leading-[1.8] resize-none focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {/* Right panel — options */}
      <div className="w-[280px] shrink-0">
        <SectionTitle>Options</SectionTitle>

        {/* Backup toggle */}
        <label className="flex items-start gap-3 p-3 rounded-xl border border-border-light bg-surface-secondary cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={createBackups}
            onChange={(e) => onBackupsChange(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <div>
            <p className="text-xs font-medium text-text">Create backups</p>
            <p className="text-[11px] text-text-muted mt-0.5 leading-4">
              Save a copy of existing .env.schema before overwriting
            </p>
          </div>
        </label>

        {/* Existing schema warning */}
        {plan.hasExistingSchema && (
          <div className="rounded-xl border border-warning/20 bg-warning-light p-3 mb-3">
            <p className="text-xs font-medium text-warning-dark mb-1">
              Existing schema detected
            </p>
            <p className="text-[11px] text-warning-dark/80 leading-4">
              A .env.schema file already exists. It will be{" "}
              {createBackups ? "backed up and " : ""}overwritten with the
              generated content.
            </p>
          </div>
        )}

        {/* Summary */}
        <SectionTitle>Summary</SectionTitle>
        <div className="space-y-2">
          <SummaryRow label="Variables" value={String(plan.variables.length)} />
          <SummaryRow label="Files detected" value={String(plan.detectedFiles.length)} />
          <SummaryRow
            label="Sensitive keys"
            value={String(
              plan.variables.filter((v) => v.inferredSensitive).length,
            )}
          />
          {plan.conflicts.length > 0 && (
            <SummaryRow
              label="Conflicts"
              value={String(plan.conflicts.length)}
              highlight
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── Step 4: Done ──

function DoneStep({ result }: { result: MigrationApplyResult }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
      {/* Success icon */}
      <div className="w-14 h-14 rounded-2xl bg-success-light border border-success/20 flex items-center justify-center shadow-sm">
        <Check
          size={24}
          strokeWidth={2}
          className="text-success"
          aria-hidden="true"
        />
      </div>

      <div className="text-center max-w-sm">
        <h3 className="text-lg font-medium text-text mb-2">
          Migration complete
        </h3>
        <p className="text-sm text-text-secondary leading-6">
          Your project has been initialized with Varlock. The environment schema
          has been created and your variables are ready to manage.
        </p>
      </div>

      {/* Files written */}
      <div className="w-full max-w-sm">
        {result.filesWritten.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">
              Files created
            </p>
            <div className="flex flex-col gap-1">
              {result.filesWritten.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-light bg-surface-secondary"
                >
                  <div className="w-2 h-2 rounded-sm bg-success shrink-0" />
                  <span className="font-mono text-xs text-text">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.backupsCreated.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">
              Backups created
            </p>
            <div className="flex flex-col gap-1">
              {result.backupsCreated.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-light bg-surface-secondary"
                >
                  <div className="w-2 h-2 rounded-sm bg-warning shrink-0" />
                  <span className="font-mono text-xs text-text-secondary">
                    {f}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Next steps */}
      <div className="w-full max-w-sm mt-2 rounded-xl border border-border-light bg-surface-secondary p-4">
        <p className="text-xs font-medium text-text mb-2">Next steps</p>
        <ul className="space-y-1.5 text-[11px] text-text-secondary leading-4">
          <li className="flex gap-2">
            <span className="text-accent shrink-0">1.</span>
            Review variables in the dashboard and fill any empty values
          </li>
          <li className="flex gap-2">
            <span className="text-accent shrink-0">2.</span>
            Run a security scan to check for leaked secrets
          </li>
          <li className="flex gap-2">
            <span className="text-accent shrink-0">3.</span>
            Use the terminal to run your app with injected environment variables
          </li>
        </ul>
      </div>
    </div>
  );
}

// ── Shared sub-components ──

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium text-text-muted tracking-wider uppercase mb-3">
      {children}
    </h3>
  );
}

function FileItem({ file }: { file: DetectedEnvFile }) {
  const colors = ROLE_DOT_COLORS[file.role] ?? { bg: "#F5F5F7", dot: "#6E6E73" };
  const roleLabel = ROLE_LABELS[file.role] ?? "File";
  const roleDesc = ROLE_DESCRIPTIONS[file.role] ?? "";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border-light bg-surface-secondary">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: colors.bg }}
      >
        <div
          className="w-2 h-2 rounded-sm"
          style={{ background: colors.dot }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs font-medium text-text truncate">
          {file.relativePath}
        </p>
        <p className="text-[11px] text-text-muted truncate">
          {file.variableCount} variable{file.variableCount !== 1 ? "s" : ""}
          {file.sensitiveKeyCount > 0 && (
            <span className="text-accent-muted">
              {" "}
              ({file.sensitiveKeyCount} sensitive)
            </span>
          )}
          {roleDesc && <span> — {roleDesc}</span>}
        </p>
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded-full border border-border-light text-text-muted shrink-0">
        {roleLabel}
      </span>
    </div>
  );
}

function MigrationMap({ variables }: { variables: MigrationVariable[] }) {
  return (
    <div className="rounded-xl border border-border-light overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_24px_1fr] gap-1.5 items-center px-3 py-2 bg-surface-secondary border-b border-border-light">
        <span className="text-[11px] text-text-muted">Original variable</span>
        <span />
        <span className="text-[11px] text-text-muted">Inferred schema</span>
      </div>

      {/* Rows */}
      <div className="max-h-[320px] overflow-auto">
        {variables.map((v) => (
          <MigrationMapRow key={v.key} variable={v} />
        ))}
        {variables.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted text-center">
            No variables detected
          </div>
        )}
      </div>
    </div>
  );
}

function MigrationMapRow({ variable }: { variable: MigrationVariable }) {
  const typeBadge = getTypeBadgeStyle(variable.inferredType);

  return (
    <div className="grid grid-cols-[1fr_24px_1fr] gap-1.5 items-center px-3 py-1.5 border-b border-border-light last:border-b-0 bg-surface">
      {/* Original */}
      <div className="font-mono text-[11px] text-text truncate">
        {variable.key}
        {variable.value && (
          <span className="text-text-muted">
            ={variable.value.length > 20
              ? variable.value.slice(0, 20) + "..."
              : variable.value}
          </span>
        )}
      </div>

      {/* Arrow */}
      <div className="text-center text-text-muted text-xs">
        &rarr;
      </div>

      {/* Inferred schema badges */}
      <div className="flex items-center gap-1 flex-wrap">
        {variable.inferredType !== "string" && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: typeBadge.bg, color: typeBadge.text }}
          >
            @type={variable.inferredType}
          </span>
        )}
        {variable.inferredSensitive && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: "#E8F2FF", color: "#0A84FF" }}
          >
            @sensitive
          </span>
        )}
        {variable.inferredType === "string" && !variable.inferredSensitive && (
          <span className="text-[10px] text-text-muted">@required</span>
        )}
      </div>
    </div>
  );
}

function SchemaPreviewBox({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="bg-[#1C1C1E] rounded-xl p-3.5 font-mono text-[11px] leading-[1.8] max-h-[400px] overflow-auto">
      {lines.map((line, i) => (
        <SchemaPreviewLine key={i} line={line} />
      ))}
    </div>
  );
}

function SchemaPreviewLine({ line }: { line: string }) {
  // Comment lines
  if (line.startsWith("#")) {
    // Decorator comments
    if (line.includes("@sensitive")) {
      return <div style={{ color: "#0A84FF" }}>{line}</div>;
    }
    if (line.includes("@type=") || line.includes("@required")) {
      return <div style={{ color: "#8E8E93" }}>{line}</div>;
    }
    // Description comments
    return <div style={{ color: "#8E8E93" }}>{line}</div>;
  }

  // Empty lines
  if (!line.trim()) {
    return <div>&nbsp;</div>;
  }

  // KEY=VALUE lines
  const eqPos = line.indexOf("=");
  if (eqPos > 0) {
    const key = line.slice(0, eqPos);
    const value = line.slice(eqPos);
    return (
      <div>
        <span style={{ color: "#34C759" }}>{key}</span>
        <span style={{ color: "#E5E5EA" }}>{value}</span>
      </div>
    );
  }

  return <div style={{ color: "#E5E5EA" }}>{line}</div>;
}

function SensitiveCallout({ plan }: { plan: MigrationPlan }) {
  const sensitiveVars = plan.variables.filter((v) => v.inferredSensitive);
  if (sensitiveVars.length === 0) return null;

  return (
    <div className="mt-3.5 rounded-xl border border-border-light bg-surface-secondary p-3">
      <p className="text-[11px] font-medium text-text mb-1.5">
        {sensitiveVars.length} sensitive key
        {sensitiveVars.length !== 1 ? "s" : ""} detected
      </p>
      <p className="text-[11px] text-text-secondary leading-4 mb-2">
        {sensitiveVars
          .slice(0, 3)
          .map((v) => v.key)
          .join(", ")}
        {sensitiveVars.length > 3 &&
          ` and ${sensitiveVars.length - 3} more`}{" "}
        {sensitiveVars.length === 1 ? "was" : "were"} detected as sensitive.
        These will be marked with <code className="text-accent font-medium">@sensitive</code> in
        the schema.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg border border-border-light bg-surface-secondary">
      <span className="text-[11px] text-text-secondary">{label}</span>
      <span
        className={`text-xs font-medium ${highlight ? "text-warning" : "text-text"}`}
      >
        {value}
      </span>
    </div>
  );
}
