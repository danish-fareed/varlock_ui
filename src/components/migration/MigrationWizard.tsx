import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useVarlockCommand } from "@/hooks/useVarlockCommand";
import * as commands from "@/lib/commands";
import type { MigrationPreview, MigrationResult } from "@/lib/types";

const PROGRESS_STEPS = [
  "reading",
  "classifying",
  "vaulting",
  "writing schema",
  "deleting originals",
  "done",
] as const;

export function MigrationWizard() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const refreshActiveProject = useProjectStore((s) => s.refreshActiveProject);
  const { loadCurrentEnvironment } = useVarlockCommand();

  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progressStep, setProgressStep] = useState<(typeof PROGRESS_STEPS)[number]>("reading");
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!activeProject?.path) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const next = await commands.getMigrationPreview(activeProject.path);
      setPreview(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingPreview(false);
    }
  }, [activeProject?.path]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const applyMigration = useCallback(async () => {
    if (!activeProject?.path || !preview) return;
    setApplying(true);
    setError(null);
    setProgressStep("reading");
    try {
      setProgressStep("classifying");
      await new Promise((r) => setTimeout(r, 120));
      setProgressStep("vaulting");
      await new Promise((r) => setTimeout(r, 120));
      setProgressStep("writing schema");
      const migrated = await commands.migrateProjectToVarlock(activeProject.path);
      setProgressStep("deleting originals");
      await new Promise((r) => setTimeout(r, 120));
      setProgressStep("done");
      setResult(migrated);

      await refreshActiveProject();
      await loadCurrentEnvironment();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }, [activeProject?.path, loadCurrentEnvironment, preview, refreshActiveProject]);

  const sensitiveCount = useMemo(() => preview?.secretsToVault.length ?? 0, [preview]);
  const varCount = useMemo(() => preview?.variables.length ?? 0, [preview]);

  if (!activeProject) return null;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="rounded-xl border border-border-light bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-text">Migrate to varlock</h2>
            <p className="text-[12px] text-text-secondary mt-1">
              Preview existing dotenv files, vault sensitive values, and generate `.env.schema`.
            </p>
          </div>
          <button
            onClick={loadPreview}
            disabled={loadingPreview || applying}
            className="px-3 py-1.5 rounded-lg border border-border-light text-[12px] text-text hover:bg-surface-secondary disabled:opacity-50 cursor-pointer"
          >
            {loadingPreview ? "Refreshing..." : "Refresh preview"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/20 bg-danger-light px-3 py-2 text-[12px] text-danger-dark">
            {error}
          </div>
        )}

        {!preview && loadingPreview && (
          <p className="text-[12px] text-text-muted">Loading migration preview...</p>
        )}

        {preview?.alreadyMigrated && (
          <div className="rounded-lg border border-success/20 bg-success-light px-3 py-2 text-[12px] text-success-dark">
            {preview.blockedReason ?? "Project already migrated."}
          </div>
        )}

        {preview && !preview.alreadyMigrated && (
          <>
            <div className="text-[12px] text-text-secondary">
              {varCount} vars · {sensitiveCount} vault secrets · {activeProject.name}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border-light p-3 bg-surface-secondary/40">
                <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Original .env content</div>
                <div className="max-h-[360px] overflow-auto space-y-2">
                  {preview.sourceFiles.map((f) => (
                    <div key={f.relativePath} className="rounded border border-border-light bg-surface p-2">
                      <div className="text-[11px] font-mono text-text mb-1">{f.relativePath}</div>
                      <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-words">
                        {f.fileContent || "<empty>"}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border-light p-3 bg-surface-secondary/40">
                <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Generated .env.schema</div>
                <pre className="max-h-[360px] overflow-auto text-[11px] font-mono text-text whitespace-pre-wrap break-words">
                  {preview.generatedSchema}
                </pre>
              </div>
            </div>

            {preview.secretsToVault.length > 0 && (
              <div className="rounded-lg border border-border-light p-3 bg-surface-secondary/30">
                <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Secrets to vault</div>
                <div className="max-h-[160px] overflow-auto">
                  {preview.secretsToVault.map((s, idx) => (
                    <div key={`${s.key}-${s.envName}-${idx}`} className="text-[12px] text-text-secondary font-mono">
                      {s.key} ({s.envName})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/20 bg-warning-light px-3 py-2">
                {preview.warnings.map((w, idx) => (
                  <div key={idx} className="text-[12px] text-warning-dark">
                    {w}
                  </div>
                ))}
              </div>
            )}

            {applying && (
              <div className="rounded-lg border border-accent/20 bg-accent-light px-3 py-2 text-[12px] text-accent">
                Migration progress: {progressStep}
              </div>
            )}

            {!result ? (
              <button
                onClick={applyMigration}
                disabled={applying}
                className="px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
              >
                {applying ? "Migrating..." : "Confirm and migrate"}
              </button>
            ) : (
              <div className="rounded-lg border border-success/20 bg-success-light px-3 py-2">
                <div className="text-[12px] text-success-dark font-medium">Migration complete</div>
                <div className="text-[11px] text-success-dark/90">Schema: {result.schemaPath}</div>
                <div className="text-[11px] text-success-dark/90">Backup: {result.backupPath}</div>
                <div className="text-[11px] text-success-dark/90">
                  Deleted: {result.deletedFiles.length} file(s), vaulted: {result.vaultedSecrets.length} secret value(s)
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
