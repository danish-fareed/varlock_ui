import { useEffect, useMemo, useState } from "react";
import * as commands from "@/lib/commands";
import type { EditableProjectFile, MergedVariable } from "@/lib/types";
import { VariableDetailDrawer } from "./VariableDetailDrawer";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useProjectStore } from "@/stores/projectStore";
import { VariableRow } from "./VariableRow";
import { VariableFilters } from "./VariableFilters";
import { buildEditableVariable } from "@/lib/buildEditableVariable";

/**
 * Table displaying all environment variables from the latest varlock load.
 * Includes filter pills, column headers, and the variable detail drawer.
 */
export function VariableList() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const refreshActiveProject = useProjectStore((s) => s.refreshActiveProject);
  const { loadResult, activeEnv, isLoading, getFilteredVariables } =
    useEnvironmentStore();
  const loadEnvironment = useEnvironmentStore((s) => s.loadEnvironment);
  const variables = getFilteredVariables();
  const [selectedVariableKey, setSelectedVariableKey] = useState<string | null>(null);
  const [editableFiles, setEditableFiles] = useState<EditableProjectFile[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Find the MergedVariable for the selected key
  const selectedVariable = useMemo(
    () => loadResult?.variables.find((v) => v.key === selectedVariableKey) ?? null,
    [loadResult?.variables, selectedVariableKey],
  );

  // Build the rich EditableVariable for the drawer (adds per-file values + schema entry)
  const selectedEditableVariable = useMemo(() => {
    if (!selectedVariable) return null;
    return buildEditableVariable(selectedVariable, editableFiles, fileContents);
  }, [selectedVariable, editableFiles, fileContents]);

  // Reset state on project switch
  useEffect(() => {
    setSelectedVariableKey(null);
    setEditableFiles([]);
    setFileContents({});
    setEditorLoading(false);
    setEditorError(null);
    setSaveError(null);
    setIsSaving(false);
  }, [activeProject?.id]);

  // Load editable files when a variable is selected
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

    loadEditorFiles().catch(() => {
      // errors already reflected in state
    });

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

  return (
    <>
      <div>
        {/* Header with filters */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-text-secondary tracking-wider">
            VARIABLES — {activeEnv}
          </h3>
          <VariableFilters />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="border border-border-light rounded-xl p-8 text-center">
            <p className="text-sm text-text-muted">Loading variables...</p>
          </div>
        )}

        {/* Variable table */}
        {!isLoading && loadResult && (
          <div className="border border-border-light rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[180px_1fr_80px_80px] px-3 py-2 bg-surface-secondary border-b border-border-light gap-3">
              <span className="text-[10px] font-medium text-text-muted tracking-wider uppercase">
                Key
              </span>
              <span className="text-[10px] font-medium text-text-muted tracking-wider uppercase">
                Value
              </span>
              <span className="text-[10px] font-medium text-text-muted tracking-wider uppercase">
                Type
              </span>
              <span className="text-[10px] font-medium text-text-muted tracking-wider uppercase text-right">
                Status
              </span>
            </div>

            {/* Variable rows */}
            {variables.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">
                No variables match the current filter.
              </div>
            ) : (
              variables.map((variable, index) => (
                <div key={variable.key}>
                  {index > 0 && <div className="h-px bg-border-light mx-3" />}
                  <VariableRow
                    variable={variable}
                    onSelect={handleSelectVariable}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {editorError && selectedVariable && (
          <div className="mt-3 rounded-xl border border-danger/25 bg-danger-light/10 px-3 py-3 text-sm text-danger-dark">
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
          <div className="h-full w-full max-w-[560px] border-l border-border bg-surface shadow-[-24px_0_80px_rgba(0,0,0,0.35)] p-6">
            <div className="text-sm text-text-secondary">Loading variable detail...</div>
            {editorError && (
              <div className="mt-3 rounded-xl border border-danger/25 bg-danger-light/10 px-3 py-3 text-sm text-danger-dark">
                {editorError}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
