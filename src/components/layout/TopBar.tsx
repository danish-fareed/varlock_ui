import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";

/**
 * Top bar: project title, status badge, action buttons.
 */
export function TopBar() {
  const { activeProject, view, setView } = useProjectStore();
  const { loadResult, isLoading } = useEnvironmentStore();

  if (!activeProject) return null;

  const statusLabel = isLoading
    ? "loading..."
    : loadResult
    ? loadResult.valid
      ? "valid"
      : loadResult.errorCount > 0
        ? `${loadResult.errorCount} error${loadResult.errorCount !== 1 ? "s" : ""}`
        : `${loadResult.warningCount} warning${loadResult.warningCount !== 1 ? "s" : ""}`
    : null;

  const statusClass = isLoading
    ? "bg-surface-tertiary text-text-muted"
    : loadResult
    ? loadResult.valid
      ? "bg-success-light text-success-dark"
      : loadResult.errorCount > 0
        ? "bg-danger-light text-danger-dark"
        : "bg-warning-light text-warning-dark"
    : "bg-surface-tertiary text-text-muted";

  return (
    <div className="flex items-center px-5 py-3 border-b border-border-light gap-3 bg-surface">
      {/* Project title */}
      <h1 className="text-[15px] font-medium text-text flex-1">
        {activeProject.name}
      </h1>

      {/* Status badge */}
      {statusLabel && (
        <span
          className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${statusClass}`}
        >
          {statusLabel}
        </span>
      )}

      {/* View toggle and actions */}
      <div className="flex gap-2" role="tablist" aria-label="Project view selector">
        <button
          onClick={() => setView("dashboard")}
          role="tab"
          aria-selected={view === "dashboard"}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
            view === "dashboard"
              ? "bg-brand text-white border-brand"
              : "bg-transparent text-text border-border hover:bg-surface-secondary"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setView("terminal")}
          role="tab"
          aria-selected={view === "terminal"}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
            view === "terminal"
              ? "bg-brand text-white border-brand"
              : "bg-transparent text-text border-border hover:bg-surface-secondary"
          }`}
        >
          Terminal
        </button>
      </div>
    </div>
  );
}
