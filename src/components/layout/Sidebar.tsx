import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCommandStore } from "@/stores/commandStore";
import { ProjectList } from "@/components/project/ProjectList";
import { AddProjectDialog } from "@/components/project/AddProjectDialog";
import { useState } from "react";
import type { AppView } from "@/lib/types";
import * as commands from "@/lib/commands";

/**
 * macOS Finder-style collapsible sidebar.
 * Nav: Dashboard + Vault. Settings moved to TopBar popup.
 */
export function Sidebar() {
  const projects = useProjectStore((s) => s.projects);
  const { view, setView } = useProjectStore();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
  const running = useCommandStore((s) => s.running);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ),
    },
    {
      id: "vault",
      label: "Vault",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M5.5 7l1.5 1.5 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  // Collapsed sidebar — icons only
  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-sidebar flex flex-col items-center shrink-0 border-r border-border-light/60">
        {/* Drag region + collapse toggle */}
        <div data-tauri-drag-region className="no-select w-full pt-4 pb-2 flex justify-center">
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-sidebar-hover transition-colors cursor-pointer bg-transparent border-none"
            title="Expand sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Nav icons */}
        <div className="flex flex-col items-center gap-1 mt-2 px-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                if (item.id === "dashboard") useProjectStore.getState().setActiveProject(null);
              }}
              title={item.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border-none ${
                view === item.id && !useProjectStore.getState().activeProject
                  ? "bg-accent text-white shadow-sm"
                  : "bg-transparent text-text-secondary hover:bg-sidebar-hover hover:text-text"
              }`}
            >
              {item.icon}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add project */}
        <div className="pb-3">
          <button
            onClick={() => setShowAddDialog(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-sidebar-hover transition-colors cursor-pointer bg-transparent border-none"
            title="Add project"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {showAddDialog && (
          <AddProjectDialog onClose={() => setShowAddDialog(false)} />
        )}
      </div>
    );
  }

  // Expanded sidebar
  return (
    <div className="w-60 bg-sidebar flex flex-col shrink-0 border-r border-border-light/60">
      {/* Drag region / brand header */}
      <div data-tauri-drag-region className="no-select px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 flex items-center justify-center">
            <img src="/icon.svg" alt="Devpad Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-[14px] font-bold text-text tracking-tight">
            Devpad
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleSidebar}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-sidebar-hover transition-colors cursor-pointer bg-transparent border-none"
              title="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                if (item.id === "dashboard") useProjectStore.getState().setActiveProject(null);
              }}
              className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg cursor-pointer transition-all border-none w-full text-left ${
                view === item.id && (item.id !== 'dashboard' || !useProjectStore.getState().activeProject)
                  ? "bg-accent text-white shadow-[0_1px_3px_rgba(10,132,255,0.25)]"
                  : "bg-transparent text-text-secondary hover:bg-sidebar-hover hover:text-text"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section label */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Projects
          </span>
          <span className="text-[11px] text-text-muted tabular-nums">
            {projects.length}
          </span>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto px-2">
        <ProjectList />
      </div>

      {/* Add project button */}
      <div className="p-2.5">
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full py-2 rounded-lg bg-transparent text-text-secondary text-[12px] font-medium flex items-center justify-center gap-1.5 hover:bg-sidebar-hover active:bg-sidebar-active transition-colors cursor-pointer border-none"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M6.5 1.5v10M1.5 6.5h10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          Add Project
        </button>
      </div>

      {/* Running now section */}
      <RunningSection running={running} />

      {/* Add project dialog */}
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}

// ── Running Processes Section ──

import type { RunningCommandInfo } from "@/lib/types";

function RunningSection({ running }: { running: Record<string, RunningCommandInfo> }) {
  const runningEntries = Object.values(running).filter((r) => r.status === "running");
  const { activeProject } = useProjectStore();

  if (runningEntries.length === 0) return null;

  return (
    <div className="px-2 pb-2">
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
            Running now
          </span>
          <span className="text-[10px] text-success-dark tabular-nums">
            {runningEntries.length}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        {runningEntries.map((entry) => (
          <div
            key={entry.commandId}
            className="flex items-center gap-2 py-1.5 px-2.5 rounded-md hover:bg-sidebar-hover transition-colors group cursor-default"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft shrink-0" />
            <span className="text-[11px] text-text truncate flex-1">
              {entry.commandId.split(":").pop() || entry.commandId}
            </span>
            <button
              onClick={() => {
                if (activeProject?.path) {
                  commands.openTerminalAt(activeProject.path);
                }
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-sidebar-active transition-all cursor-pointer bg-transparent border-none shrink-0"
              title="Open terminal"
            >
              <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
                <rect x="0.5" y="1" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
                <path d="M2 4l2 2-2 2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 8h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
