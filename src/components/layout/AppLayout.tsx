import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useProjectStore } from "@/stores/projectStore";
import { EnvironmentCards } from "@/components/environment/EnvironmentCards";
import { VariableList } from "@/components/variables/VariableList";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { useVarlockCommand } from "@/hooks/useVarlockCommand";
import { useState } from "react";

/**
 * Root layout component: sidebar + main content area.
 * Switches between dashboard and terminal views.
 */
export function AppLayout() {
  const { activeProject, view } = useProjectStore();

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface text-text">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        {activeProject ? (
          view === "dashboard" ? (
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
  const activeProject = useProjectStore((s) => s.activeProject);
  const { initProject } = useVarlockCommand();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setMigrationError(null);
    try {
      await initProject();
    } catch (error) {
      setMigrationError(String(error));
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-5 bg-surface">
      {activeProject?.status === "migrationNeeded" && (
        <div className="rounded-2xl border border-[#2E4E6F] bg-[#162230] p-5 flex items-start justify-between gap-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
          <div>
            <div className="text-xs font-medium tracking-wider text-[#185FA5] uppercase mb-2">
              Migration Available
            </div>
            <h2 className="text-lg font-medium text-text mb-1">
              Convert this project to Varlock
            </h2>
            <p className="text-sm text-text-secondary max-w-2xl leading-6">
              This project already has dotenv files, but it has not been initialized for Varlock yet.
              Run `varlock init` to generate a `.env.schema` and unlock validation, dashboard data, and terminal env injection.
            </p>
            {migrationError && (
              <div className="mt-3 bg-danger-light text-danger-dark text-xs px-3 py-2 rounded-lg">
                {migrationError}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleMigrate}
            disabled={isMigrating}
            className="shrink-0 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50 shadow-[0_10px_24px_rgba(83,74,183,0.28)]"
          >
            {isMigrating ? "Migrating..." : "Run varlock init"}
          </button>
        </div>
      )}
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
