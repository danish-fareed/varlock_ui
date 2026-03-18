import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useProjectStore } from "@/stores/projectStore";
import { useCommandStore } from "@/stores/commandStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { VariableList } from "@/components/variables/VariableList";
import { MigrationWizard } from "@/components/migration/MigrationWizard";
import { ScanResultsPanel } from "@/components/scan/ScanResultsPanel";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { VaultPage } from "@/components/vault/VaultPage";
import { CommandGrid } from "@/components/commands/CommandGrid";
import { useScanStore } from "@/stores/scanStore";
import { FolderOpen, Code, TextCursorInput, Terminal } from "lucide-react";
import * as commands from "@/lib/commands";

/**
 * Root layout — sidebar + main content.
 */
export function AppLayout() {
  const { activeProject, view } = useProjectStore();
  const showScanResults = useScanStore((s) => s.showResults);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface-secondary text-text">
      <div className="flex-1 flex overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden bg-surface">
        <TopBar />

        <div className="flex-1 overflow-auto flex flex-col relative bg-surface">
          {view === "vault" ? (
            <VaultPage />
          ) : activeProject ? (
            activeProject.status === "migrationNeeded" ? (
              <MigrationWizard />
            ) : showScanResults ? (
              <ScanResultsPanel />
            ) : (
              <DashboardView />
            )
          ) : (
            <DashboardPage />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Dashboard view (Project-scoped) ──

function DashboardView() {
  const { activeProject } = useProjectStore();
  const { scanProject, reset } = useCommandStore();
  const scanError = useCommandStore((s) => s.scanError);
  const { loadEnvironment, loadResult, isLoading } = useEnvironmentStore();
  const [showEnvView, setShowEnvView] = useState(true);
  const scan = useCommandStore((s) => s.scan);

  useFileWatcher(activeProject?.id, activeProject?.path);

  useEffect(() => {
    if (activeProject?.path) {
      scanProject(activeProject.path);
      loadEnvironment(activeProject.path);
    } else {
      reset();
    }
  }, [activeProject?.path, activeProject?.id]);

  // Counts for tab badges
  const varCount = loadResult?.variables.length ?? 0;
  const cmdCount = scan?.commands.length ?? 0;

  // Status summary
  const statusConfig = isLoading
    ? { label: "loading…", dot: "bg-text-muted animate-pulse-soft" }
    : loadResult
      ? loadResult.valid
        ? { label: "all valid", dot: "bg-success" }
        : loadResult.errorCount > 0
          ? { label: `${loadResult.errorCount} error${loadResult.errorCount !== 1 ? "s" : ""}`, dot: "bg-danger" }
          : { label: `${loadResult.warningCount} warning${loadResult.warningCount !== 1 ? "s" : ""}`, dot: "bg-warning" }
      : null;

  // Path formatting — show last 2-3 segments
  const formatPath = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length > 2
      ? `…/${parts.slice(-2).join("/")}`
      : parts.join("/");
  };

  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 bg-surface">
      {/* ── Project Header ── */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          {/* Project name + status */}
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-text tracking-tight truncate">
              {activeProject?.name}
            </h1>
            {statusConfig && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-secondary border border-border-light shrink-0">
                <div className={`w-[5px] h-[5px] rounded-full ${statusConfig.dot}`} />
                <span className="text-[10px] font-medium text-text-secondary">{statusConfig.label}</span>
              </div>
            )}
          </div>
          {/* Breadcrumb-style path */}
          <p className="text-[11px] text-text-muted mt-0.5 font-mono">
            {activeProject?.path ? formatPath(activeProject.path) : ""}
          </p>
        </div>

        {/* Open With — icon-only toolbar */}
        <div className="flex items-center gap-1 shrink-0 bg-surface-secondary rounded-lg p-1 border border-border-light">
          <button
            onClick={() => activeProject && commands.openInExplorer(activeProject.path)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer border-none bg-transparent"
            title="Open in Explorer"
          >
            <FolderOpen size={13} strokeWidth={1.3} />
          </button>
          <button
            onClick={() => activeProject && commands.openInEditor(activeProject.path, "code")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer border-none bg-transparent"
            title="Open in VS Code"
          >
            <Code size={13} strokeWidth={1.3} />
          </button>
          <button
            onClick={() => activeProject && commands.openInEditor(activeProject.path, "cursor")}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer border-none bg-transparent"
            title="Open in Cursor"
          >
            <TextCursorInput size={13} strokeWidth={1.3} />
          </button>
          <div className="w-px h-4 bg-border-light mx-0.5" />
          <button
            onClick={() => activeProject && commands.openTerminalAt(activeProject.path)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer border-none bg-transparent"
            title="Open Terminal"
          >
            <Terminal size={13} strokeWidth={1.3} />
          </button>
        </div>
      </div>

      {/* ── Tab Switcher with count badges ── */}
      <div className="flex bg-surface-tertiary/60 p-1 rounded-lg self-start relative border border-border-light gap-0.5 shrink-0">
        <button
          onClick={() => setShowEnvView(true)}
          className={`flex items-center gap-2 px-5 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 cursor-pointer border-none z-10 ${
            showEnvView
              ? "bg-surface text-text shadow-sm"
              : "bg-transparent text-text-secondary hover:text-text"
          }`}
        >
          Variables
          {varCount > 0 && (
            <span className={`text-[10px] tabular-nums font-medium ${showEnvView ? "text-text-muted" : "text-text-muted/60"}`}>
              {varCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowEnvView(false)}
          className={`flex items-center gap-2 px-5 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 cursor-pointer border-none z-10 ${
            !showEnvView
              ? "bg-surface text-text shadow-sm"
              : "bg-transparent text-text-secondary hover:text-text"
          }`}
        >
          Commands
          {cmdCount > 0 && (
            <span className={`text-[10px] tabular-nums font-medium ${!showEnvView ? "text-text-muted" : "text-text-muted/60"}`}>
              {cmdCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {showEnvView ? (
          <VariableList />
        ) : (
          <>
            {scanError && (
              <div className="mb-3 rounded-lg border border-danger/20 bg-danger-light px-3 py-2 text-[12px] text-danger-dark">
                Command discovery failed: {scanError}
              </div>
            )}
            <CommandGrid />
          </>
        )}
      </div>
    </div>
  );
}
