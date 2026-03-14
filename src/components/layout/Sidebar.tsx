import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ProjectList } from "@/components/project/ProjectList";
import { AddProjectDialog } from "@/components/project/AddProjectDialog";
import { useState } from "react";
import type { AppView } from "@/lib/types";

/**
 * macOS Finder-style collapsible sidebar.
 * Nav: Dashboard + Vault. Settings moved to TopBar popup.
 */
export function Sidebar() {
  const projects = useProjectStore((s) => s.projects);
  const { view, setView } = useProjectStore();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
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
          <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 3l4 2.5L10 3M6 5.5V11M2 3v5.5L6 11l4-2.5V3L6 0.5 2 3z"
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-text tracking-tight">
            Varlock
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

      {/* Add project dialog */}
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}
