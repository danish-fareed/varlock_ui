import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useScanStore } from "@/stores/scanStore";
import { SettingsModal } from "@/components/settings/SettingsPage";
import * as commands from "@/lib/commands";

/**
 * macOS-style toolbar: project title, status badge, scan button, settings, open terminal.
 */
export function TopBar() {
  const { activeProject, view } = useProjectStore();
  const { loadResult, isLoading } = useEnvironmentStore();
  const { runScan, state: scanState, showResults } = useScanStore();
  const [showSettings, setShowSettings] = useState(false);

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

  const statusDot = isLoading
    ? "bg-text-muted animate-pulse-soft"
    : loadResult
    ? loadResult.valid
      ? "bg-success"
      : loadResult.errorCount > 0
        ? "bg-danger"
        : "bg-warning"
    : "bg-text-muted";

  const handleScan = () => {
    if (activeProject?.path && scanState !== "scanning") {
      runScan(activeProject.path);
    }
  };

  const handleOpenTerminal = () => {
    if (activeProject?.path) {
      commands.openTerminalAt(activeProject.path);
    }
  };

  const showActions = activeProject.status !== "migrationNeeded" && view === "dashboard";

  return (
    <>
      <div className="flex items-center px-5 h-12 border-b border-border-light gap-3 bg-surface shrink-0">
        {/* Project title + status */}
        <h1 className="text-[14px] font-semibold text-text tracking-tight">
          {activeProject.name}
        </h1>

        {/* Status indicator */}
        {statusLabel && view === "dashboard" && (
          <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <div className={`w-[6px] h-[6px] rounded-full ${statusDot}`} />
            {statusLabel}
          </div>
        )}

        <div className="flex-1" />

        {showActions && (
          <>
            {/* Scan button */}
            <button
              onClick={handleScan}
              disabled={scanState === "scanning"}
              className={`h-7 px-3 text-[12px] font-medium rounded-md transition-colors cursor-pointer border ${
                showResults
                  ? "bg-accent text-white border-accent"
                  : "bg-surface text-text-secondary border-border hover:bg-surface-secondary hover:text-text"
              } disabled:opacity-50`}
            >
              {scanState === "scanning" ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                  Scanning
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0" aria-hidden="true">
                    <path d="M6.5 1v2m0 7v2m-4-5.5h2m7 0h2M3.26 3.26l1.06 1.06m5.36 5.36l1.06 1.06m0-7.48l-1.06 1.06M4.32 9.68l-1.06 1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Scan
                </span>
              )}
            </button>
          </>
        )}

        {/* Global Toolbar Actions */}
        {activeProject.status !== "migrationNeeded" && (
          <div className="flex items-center gap-1.5 ml-1">
            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="w-7 h-7 rounded-md transition-colors cursor-pointer border bg-surface text-text-secondary border-border hover:bg-surface-secondary hover:text-text flex items-center justify-center"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 3.8l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>

            {/* Open OS terminal button */}
            <button
              onClick={handleOpenTerminal}
              className="h-7 px-3 text-[12px] font-medium rounded-md transition-colors cursor-pointer border flex items-center gap-1.5 bg-surface text-text-secondary border-border hover:bg-surface-secondary hover:text-text"
              title="Open OS terminal at project directory"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                <path d="M2.5 3l3.5 3.5L2.5 10M7.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Terminal
            </button>
          </div>
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
