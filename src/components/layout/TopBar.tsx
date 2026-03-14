import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useScanStore } from "@/stores/scanStore";

/**
 * Top bar: project title, status badge, action buttons.
 */
export function TopBar() {
  const { activeProject, view, setView } = useProjectStore();
  const { loadResult, isLoading } = useEnvironmentStore();
  const { runScan, state: scanState, showResults, dismissResults } = useScanStore();

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

  const handleScan = () => {
    if (activeProject?.path && scanState !== "scanning") {
      runScan(activeProject.path);
    }
  };

  // Hide scan/dashboard buttons when project needs migration
  const showActions = activeProject.status !== "migrationNeeded";

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

      {showActions && (
        <>
          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanState === "scanning"}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
              showResults
                ? "bg-brand text-white border-brand"
                : "bg-transparent text-text border-border hover:bg-surface-secondary"
            } disabled:opacity-50`}
          >
            {scanState === "scanning" ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Scanning...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path
                    d="M6 1.5v2m0 5v2m-3.18-7.68l1.41 1.41m3.54 3.54l1.41 1.41M1.5 6h2m5 0h2M2.82 9.18l1.41-1.41m3.54-3.54l1.41-1.41"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
                Scan
              </span>
            )}
          </button>

          {/* View toggle */}
          <div className="flex gap-2" role="tablist" aria-label="Project view selector">
            <button
              onClick={() => { dismissResults(); setView("dashboard"); }}
              role="tab"
              aria-selected={view === "dashboard" && !showResults}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                view === "dashboard" && !showResults
                  ? "bg-brand text-white border-brand"
                  : "bg-transparent text-text border-border hover:bg-surface-secondary"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => { dismissResults(); setView("terminal"); }}
              role="tab"
              aria-selected={view === "terminal"}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                view === "terminal" && !showResults
                  ? "bg-brand text-white border-brand"
                  : "bg-transparent text-text border-border hover:bg-surface-secondary"
              }`}
            >
              Terminal
            </button>
          </div>
        </>
      )}
    </div>
  );
}
