import { useState, useRef, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { EnvironmentCards } from "@/components/environment/EnvironmentCards";
import { VariableList } from "@/components/variables/VariableList";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { MigrationWizard } from "@/components/migration/MigrationWizard";
import { ScanResultsPanel } from "@/components/scan/ScanResultsPanel";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { VaultPage } from "@/components/vault/VaultPage";
import { useScanStore } from "@/stores/scanStore";

/**
 * Root layout — two-tier sidebar + main content + resizable terminal bottom pane.
 *
 * Views:
 *   dashboard — project env cards + variable list (or global project list if none selected)
 *   vault     — vault overview + tools (import, generator, AI context, team sync)
 */
export function AppLayout() {
  const { activeProject, view } = useProjectStore();
  const showScanResults = useScanStore((s) => s.showResults);
  const { terminalOpen } = useSettingsStore();

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface-secondary text-text">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface rounded-tl-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        {/* TopBar — hidden on vault page */}
        {view !== "vault" && <TopBar />}

        {/* Content + terminal split */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main content */}
          <div className="flex-1 overflow-auto" style={{ minHeight: 200 }}>
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

          {/* Terminal bottom pane — available when a project is active */}
          {terminalOpen && activeProject && activeProject.status !== "migrationNeeded" && (
            <TerminalPane />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Terminal bottom pane with drag-to-resize ──

function TerminalPane() {
  const [height, setHeight] = useState(260);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const MIN_HEIGHT = 120;
  const MAX_HEIGHT = 500;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - ev.clientY;
      const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH.current + delta));
      setHeight(next);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [height]);

  return (
    <div className="flex flex-col shrink-0 border-t border-border-light" style={{ height }}>
      <div
        className="h-1 bg-transparent hover:bg-accent/30 cursor-row-resize shrink-0 transition-colors"
        onMouseDown={handleMouseDown}
      />
      <div className="flex-1 overflow-hidden">
        <TerminalPanel />
      </div>
    </div>
  );
}

// ── Dashboard view (Project-scoped) ──

function DashboardView() {
  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-6 bg-surface">
      <EnvironmentCards />
      <div className="h-px bg-border-light" />
      <VariableList />
    </div>
  );
}
