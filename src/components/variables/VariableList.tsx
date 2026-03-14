import { useEnvironmentStore } from "@/stores/environmentStore";
import { useProjectStore } from "@/stores/projectStore";
import { VariableRow } from "./VariableRow";
import { VariableFilters } from "./VariableFilters";

/**
 * Table displaying all environment variables from the latest varlock load.
 * Includes filter pills and a column header.
 */
export function VariableList() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const { loadResult, activeEnv, isLoading, getFilteredVariables } =
    useEnvironmentStore();
  const variables = getFilteredVariables();

  if (activeProject?.status === "migrationNeeded") return null;

  if (!loadResult && !isLoading) return null;

  return (
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
                <VariableRow variable={variable} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
