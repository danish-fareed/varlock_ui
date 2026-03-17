import { useEffect, useMemo, useState } from "react";
import * as commands from "@/lib/commands";
import type { EditableProjectFile, MergedVariable } from "@/lib/types";
import { VariableDetailDrawer } from "./VariableDetailDrawer";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useProjectStore } from "@/stores/projectStore";
import { VariableRow } from "./VariableRow";
import { VariableFilters } from "./VariableFilters";
import { buildEditableVariable } from "@/lib/buildEditableVariable";
import { useScanStore } from "@/stores/scanStore";
import { Scan, Plus, Search, Package, AlertTriangle } from "lucide-react";
import { AddVariableModal } from "./AddVariableModal";
import { updateSchemaEntry } from "@/lib/schemaParser";
import { upsertEnvValue, deleteEnvValue } from "@/lib/envFile";
import { deleteSchemaEntry } from "@/lib/schemaParser";

/**
 * Variable table — redesigned with search, hierarchy, and clear information architecture.
 */
export function VariableList() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const refreshActiveProject = useProjectStore((s) => s.refreshActiveProject);
  const { loadResult, activeEnv, isLoading, getFilteredVariables } =
    useEnvironmentStore();
  const loadEnvironment = useEnvironmentStore((s) => s.loadEnvironment);
  const allFilteredVariables = getFilteredVariables();
  const [selectedVariableKey, setSelectedVariableKey] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [variableToDelete, setVariableToDelete] = useState<string | null>(null);
  const [editableFiles, setEditableFiles] = useState<EditableProjectFile[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { runScan, state: scanState } = useScanStore();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter by search query
  const variables = useMemo(() => {
    if (!searchQuery.trim()) return allFilteredVariables;
    const q = searchQuery.toLowerCase();
    return allFilteredVariables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        (v.value && v.value.toLowerCase().includes(q)) ||
        v.type.toLowerCase().includes(q)
    );
  }, [allFilteredVariables, searchQuery]);

  const selectedVariable = useMemo(
    () => loadResult?.variables.find((v) => v.key === selectedVariableKey) ?? null,
    [loadResult?.variables, selectedVariableKey],
  );

  const selectedEditableVariable = useMemo(() => {
    if (!selectedVariable) return null;
    return buildEditableVariable(selectedVariable, editableFiles, fileContents);
  }, [selectedVariable, editableFiles, fileContents]);

  useEffect(() => {
    setSelectedVariableKey(null);
    setEditableFiles([]);
    setFileContents({});
    setEditorLoading(false);
    setEditorError(null);
    setSaveError(null);
    setIsSaving(false);
    setSearchQuery("");
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject || !selectedVariableKey) return;

    let cancelled = false;

    const loadEditorFiles = async () => {
      setEditorLoading(true);
      setEditorError(null);
      setSaveError(null);

      try {
        const files = await commands.listEditableProjectFiles(activeProject.path);
        if (files.length === 0) {
          throw new Error("No editable project env files are available.");
        }
        const contents = await Promise.all(
          files.map(async (file) => [
            file.relativePath,
            await commands.readProjectFile(activeProject.path, file.relativePath),
          ] as const),
        );

        if (cancelled) return;

        setEditableFiles(files);
        setFileContents(Object.fromEntries(contents));
      } catch (error) {
        if (cancelled) return;
        setEditorError(String(error));
      } finally {
        if (!cancelled) setEditorLoading(false);
      }
    };

    loadEditorFiles().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeProject, selectedVariableKey]);

  const handleSelectVariable = (variable: MergedVariable) => {
    setSelectedVariableKey(variable.key);
  };

  const handleCloseEditor = () => {
    if (isSaving) return;
    setSelectedVariableKey(null);
    setSaveError(null);
    setEditorError(null);
  };

  const handleSaveEnvFile = async ({
    relativePath,
    content,
  }: {
    relativePath: string;
    content: string;
  }) => {
    if (!activeProject || !selectedVariableKey) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await commands.writeProjectFile(activeProject.path, relativePath, content);
      setFileContents((current) => ({ ...current, [relativePath]: content }));
      await refreshActiveProject();
      await loadEnvironment(activeProject.path, activeEnv);
      setSaveError(null);
    } catch (error) {
      setSaveError(String(error));
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSchemaFile = async ({ content }: { content: string }) => {
    if (!activeProject || !selectedVariableKey) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await commands.writeProjectFile(activeProject.path, ".env.schema", content);
      setFileContents((current) => ({ ...current, [".env.schema"]: content }));
      await refreshActiveProject();
      await loadEnvironment(activeProject.path, activeEnv);
      setSaveError(null);
    } catch (error) {
      setSaveError(String(error));
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  if (activeProject?.status === "migrationNeeded") return null;
  if (!loadResult && !isLoading) return null;

  const handleScan = () => {
    if (activeProject?.path && scanState !== "scanning") {
      runScan(activeProject.path);
    }
  };

  const executeDelete = async (key: string) => {
    if (!activeProject) return;

    try {
      const files = await commands.listEditableProjectFiles(activeProject.path);

      for (const file of files) {
        if (file.relativePath !== ".env.schema") {
          const content = await commands.readProjectFile(activeProject.path, file.relativePath);
          const newContent = deleteEnvValue(content, key);
          if (content !== newContent) {
            await commands.writeProjectFile(activeProject.path, file.relativePath, newContent);
          }
        }
      }

      const schemaFile = files.find(f => f.relativePath === ".env.schema");
      if (schemaFile) {
        const schemaContent = await commands.readProjectFile(activeProject.path, ".env.schema");
        const newSchemaContent = deleteSchemaEntry(schemaContent, key);
        if (schemaContent !== newSchemaContent) {
          await commands.writeProjectFile(activeProject.path, ".env.schema", newSchemaContent);
        }
      }

      await refreshActiveProject();
      await loadEnvironment(activeProject.path, activeEnv);

      if (selectedVariableKey === key) setSelectedVariableKey(null);
      setVariableToDelete(null);
    } catch (e) {
      console.error("Failed to delete variable", e);
      alert(`Failed to delete variable: ${e}`);
    }
  };

  const handleDeleteVariable = (key: string) => {
    setVariableToDelete(key);
  };

  const totalCount = loadResult?.variables.length ?? 0;

  return (
    <>
      <div className="animate-fade-in">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={13} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search variables..."
              className="w-full h-8 pl-8 pr-3 text-[12px] rounded-lg border border-border-light bg-surface text-text placeholder:text-text-muted outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Filters */}
          <VariableFilters />

          <div className="flex-1" />

          {/* Actions — secondary then primary */}
          <button
            onClick={handleScan}
            disabled={scanState === "scanning"}
            className="h-8 px-3 text-[11px] font-medium rounded-lg transition-colors cursor-pointer border bg-surface text-text-secondary border-border-light hover:bg-surface-secondary hover:text-text disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {scanState === "scanning" ? (
              <>
                <span className="w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Scan size={12} strokeWidth={1.2} className="shrink-0" />
                Scan
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-8 px-3 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer border-none bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Plus size={12} strokeWidth={2.5} className="shrink-0" />
            Add Variable
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="border border-border-light rounded-xl p-12 text-center bg-surface">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[12px] text-text-muted">Loading variables…</p>
          </div>
        )}

        {/* Variable table */}
        {!isLoading && loadResult && (
          <div className="border border-border-light rounded-xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {/* Column headers */}
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary/60 border-b border-border-light rounded-t-xl">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  Variables
                </span>
                <span className="text-[10px] font-medium text-text-muted bg-surface-tertiary rounded-full px-2 py-0.5 tabular-nums">
                  {variables.length}{variables.length !== totalCount ? ` / ${totalCount}` : ""}
                </span>
              </div>
              <span className="text-[10px] text-text-muted">
                {activeEnv}
              </span>
            </div>

            {/* Variable rows */}
            {variables.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Package size={24} strokeWidth={1} className="mx-auto mb-3 text-text-muted/40" />
                <p className="text-[13px] text-text-secondary font-medium">No variables match</p>
                <p className="text-[11px] text-text-muted mt-1">
                  {searchQuery ? "Try a different search term" : "No variables match the current filter"}
                </p>
              </div>
            ) : (
              variables.map((variable, index) => (
                <div key={variable.key}>
                  {index > 0 && <div className="h-px bg-border-light/60 mx-4" />}
                  <VariableRow
                    variable={variable}
                    isSelected={selectedVariableKey === variable.key}
                    onSelect={handleSelectVariable}
                    onDelete={() => handleDeleteVariable(variable.key)}
                    isLast={index === variables.length - 1}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {editorError && selectedVariable && (
          <div className="mt-3 rounded-lg border border-danger/20 bg-danger-light px-3 py-2.5 text-[12px] text-danger-dark">
            {editorError}
          </div>
        )}
      </div>

      {selectedEditableVariable && !editorLoading && editableFiles.length > 0 && (
        <VariableDetailDrawer
          variable={selectedEditableVariable}
          activeEnv={activeEnv}
          editableFiles={editableFiles}
          fileContents={fileContents}
          isSaving={isSaving}
          saveError={saveError}
          onClose={handleCloseEditor}
          onSaveEnvFile={handleSaveEnvFile}
          onSaveSchemaFile={handleSaveSchemaFile}
        />
      )}

      {selectedVariable && editorLoading && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/15 backdrop-blur-sm">
          <div className="h-full w-full max-w-[520px] border-l border-border-light bg-surface shadow-[-8px_0_40px_rgba(0,0,0,0.08)] p-6 animate-slide-in-right">
            <div className="text-[13px] text-text-secondary animate-pulse-soft">Loading variable detail…</div>
            {editorError && (
              <div className="mt-3 rounded-lg border border-danger/20 bg-danger-light px-3 py-2.5 text-[12px] text-danger-dark">
                {editorError}
              </div>
            )}
          </div>
        </div>
      )}

      {variableToDelete && (
        <DeleteConfirmationModal
          variableKey={variableToDelete}
          onConfirm={() => executeDelete(variableToDelete)}
          onCancel={() => setVariableToDelete(null)}
        />
      )}

      {showAddModal && (
        <AddVariableModal
          activeEnv={activeEnv}
          existingVariables={variables}
          onClose={() => setShowAddModal(false)}
          onSave={async (newKey, newValue, newType, newDesc) => {
            if (!activeProject) return;
            const files = await commands.listEditableProjectFiles(activeProject.path);

            const envFileName = `.env.${activeEnv}`;
            const targetEnvFile = files.find(f => f.relativePath === envFileName)?.relativePath
                                ?? files.find(f => f.relativePath === ".env")?.relativePath
                                ?? files.find(f => f.relativePath !== ".env.schema")?.relativePath;

            if (targetEnvFile) {
              const currentEnvContent = await commands.readProjectFile(activeProject.path, targetEnvFile);
              const nextEnvContent = upsertEnvValue(currentEnvContent, newKey, newValue);
              await commands.writeProjectFile(activeProject.path, targetEnvFile, nextEnvContent);
            }

            const schemaFile = files.find(f => f.relativePath === ".env.schema");
            const schemaContent = schemaFile ? await commands.readProjectFile(activeProject.path, ".env.schema") : "";

            const newEntry = {
              key: newKey,
              baseValue: "",
              type: newType,
              required: true,
              sensitive: false,
              description: newDesc,
              enumValues: [],
              decorators: [],
              lineStart: 0,
              lineEnd: 0,
            };
            const nextSchemaContent = updateSchemaEntry(schemaContent, newEntry);
            await commands.writeProjectFile(activeProject.path, ".env.schema", nextSchemaContent);

            await refreshActiveProject();
            await loadEnvironment(activeProject.path, activeEnv);
          }}
        />
      )}
    </>
  );
}

// ── Delete Confirmation Modal ──

function DeleteConfirmationModal({
  variableKey,
  onConfirm,
  onCancel,
}: {
  variableKey: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.2)] border border-border-light overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-3 bg-surface-secondary/50">
          <div className="w-8 h-8 rounded-lg bg-danger-light flex items-center justify-center shrink-0 border border-danger/10">
            <AlertTriangle size={16} strokeWidth={2} className="text-danger" />
          </div>
          <h2 className="text-[15px] font-semibold text-text tracking-tight">Delete Variable</h2>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-[13px] text-text-secondary leading-normal mb-4">
            Are you sure you want to delete <span className="font-mono text-[12px] font-semibold text-text bg-surface-secondary px-1.5 py-0.5 rounded border border-border-light">{variableKey}</span>?
          </p>
          <div className="bg-danger/5 border border-danger/10 rounded-lg p-3">
            <p className="text-[12px] text-danger-dark leading-relaxed">
              This will permanently remove the variable from <strong>all your .env files</strong> and the schema. This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-surface-secondary/50 border-t border-border-light flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[12px] font-medium text-text border border-border-light rounded-lg hover:bg-surface-secondary hover:text-text-primary transition-colors cursor-pointer bg-surface shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[12px] font-medium text-white bg-danger border border-transparent rounded-lg hover:bg-danger-dark transition-colors cursor-pointer shadow-sm shadow-danger/20"
          >
            Delete Variable
          </button>
        </div>
      </div>
    </div>
  );
}
