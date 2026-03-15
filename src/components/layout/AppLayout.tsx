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
import { EnvSelectorBar } from "@/components/commands/EnvSelectorBar";
import { useScanStore } from "@/stores/scanStore";

/**
 * Root layout — sidebar + main content.
 *
 * Views:
 *   dashboard — command grid + env selector (or global project list if none selected)
 *   vault     — vault overview + tools
 */
export function AppLayout() {
  const { activeProject, view } = useProjectStore();
  const showScanResults = useScanStore((s) => s.showResults);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface-secondary text-text">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface rounded-tl-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        {/* TopBar — hidden on vault page */}
        {view !== "vault" && <TopBar />}

        {/* Main content */}
        <div className="flex-1 overflow-auto">
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
  );
}

// ── Dashboard view (Project-scoped) ──

function DashboardView() {
  const { activeProject } = useProjectStore();
  const { scanProject, scan, reset } = useCommandStore();
  const { loadEnvironment } = useEnvironmentStore();
  const [showEnvView, setShowEnvView] = useState(false);

  // Watch for file changes
  useFileWatcher(activeProject?.id, activeProject?.path);

  // Scan project for commands when active project changes
  useEffect(() => {
    if (activeProject?.path) {
      scanProject(activeProject.path);
      loadEnvironment(activeProject.path);
    } else {
      reset();
    }
  }, [activeProject?.path, activeProject?.id]);

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-4 bg-surface">
      {/* Tech stack pills */}
      {scan?.techStack && scan.techStack.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {scan.techStack.map((tech) => (
            <span
              key={tech}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                tech === "varlock"
                  ? "bg-accent-light text-accent"
                  : tech.includes("Next") || tech.includes("React") || tech.includes("Vue")
                    ? "bg-[#E6F1FB] text-[#0C447C]"
                    : tech.includes("Python") || tech.includes("Django") || tech.includes("Flask") || tech.includes("FastAPI")
                      ? "bg-[#E1F5EE] text-[#085041]"
                      : tech === "Docker"
                        ? "bg-[#E6F1FB] text-[#185FA5]"
                        : tech === "Rust"
                          ? "bg-[#FAECE7] text-[#993C1D]"
                          : "bg-surface-tertiary text-text-secondary"
              }`}
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {/* Env selector bar */}
      <EnvSelectorBar />

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowEnvView(false)}
          className={`text-[11px] font-medium px-3 py-1 rounded-md cursor-pointer border-none transition-colors ${
            !showEnvView
              ? "bg-accent text-white"
              : "bg-transparent text-text-secondary hover:bg-surface-secondary"
          }`}
        >
          Commands
        </button>
        <button
          onClick={() => setShowEnvView(true)}
          className={`text-[11px] font-medium px-3 py-1 rounded-md cursor-pointer border-none transition-colors ${
            showEnvView
              ? "bg-accent text-white"
              : "bg-transparent text-text-secondary hover:bg-surface-secondary"
          }`}
        >
          Variables
        </button>
      </div>

      {/* Content */}
      {showEnvView ? (
        <VariableList />
      ) : (
        <CommandGrid />
      )}
    </div>
  );
}
