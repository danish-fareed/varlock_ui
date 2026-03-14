import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useProjectStore } from "@/stores/projectStore";
import { EnvironmentCards } from "@/components/environment/EnvironmentCards";
import { VariableList } from "@/components/variables/VariableList";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { MigrationWizard } from "@/components/migration/MigrationWizard";
import { ScanResultsPanel } from "@/components/scan/ScanResultsPanel";
import { useScanStore } from "@/stores/scanStore";

/**
 * Root layout component: sidebar + main content area.
 * Switches between dashboard, terminal, scan results, and migration views.
 */
export function AppLayout() {
  const { activeProject, view } = useProjectStore();
  const showScanResults = useScanStore((s) => s.showResults);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface text-text">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        {activeProject ? (
          activeProject.status === "migrationNeeded" ? (
            <MigrationWizard />
          ) : showScanResults ? (
            <ScanResultsPanel />
          ) : view === "dashboard" ? (
            <DashboardView />
          ) : (
            <TerminalPanel />
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function DashboardView() {
  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-5 bg-surface">
      <EnvironmentCards />
      <div className="h-px bg-border-light" />
      <VariableList />
    </div>
  );
}

function EmptyState() {
  return (
      <div className="flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_top,#232320_0%,#161615_55%)]">
        <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center mx-auto mb-4 shadow-[0_12px_30px_rgba(83,74,183,0.2)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-brand"
          >
            <path
              d="M10 3v14M3 10h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-text mb-2">No project selected</h2>
        <p className="text-text-secondary text-sm leading-6">
          Add a project from the sidebar to get started with Varlock.
        </p>
      </div>
    </div>
  );
}
