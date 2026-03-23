import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCommandStore } from "@/stores/commandStore";
import { ProjectList } from "@/components/project/ProjectList";
import { AddProjectDialog } from "@/components/project/AddProjectDialog";
import { useState } from "react";
import type { AppView } from "@/lib/types";
import * as commands from "@/lib/commands";
import { LayoutDashboard, ShieldCheck, ChevronRight, Plus, ChevronLeft, Terminal, Activity } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Sidebar with clear section hierarchy: Logo → Nav → Projects → Running.
 */
export function Sidebar() {
  const projects = useProjectStore((s) => s.projects);
  const { view, setView } = useProjectStore();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
  const running = useCommandStore((s) => s.running);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);

  const runningCount = Object.values(running).filter((r) => r.status === "running").length;

  let appWindow: ReturnType<typeof getCurrentWindow> | null = null;
  try {
    appWindow = getCurrentWindow();
  } catch (e) {
    // Not in Tauri environment
  }

  const handleDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, [data-no-drag]')) return;
    e.preventDefault();
    appWindow?.startDragging();
  };

  const navItems: { id: AppView; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={17} strokeWidth={1.3} />,
    },
    {
      id: "vault",
      label: "Vault",
      icon: <ShieldCheck size={17} strokeWidth={1.3} />,
    },
  ];

  // Collapsed sidebar — icons only
  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-surface-secondary flex flex-col items-center shrink-0 border-r border-border-light">
        {/* Drag region + collapse toggle */}
        <div onMouseDown={handleDrag} className="no-select w-full pt-4 pb-2 flex justify-center">
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer bg-transparent border-none"
            title="Expand sidebar"
          >
            <ChevronRight size={14} strokeWidth={1.3} />
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
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border-none ${
                view === item.id && !useProjectStore.getState().activeProject
                  ? "bg-accent text-white shadow-md shadow-accent/20"
                  : "bg-transparent text-text-secondary hover:bg-surface-tertiary hover:text-text"
              }`}
            >
              {item.icon}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Running indicator when collapsed */}
        {runningCount > 0 && (
          <div className="pb-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-success-light/30 relative" title={`${runningCount} running`}>
              <Activity size={13} className="text-success-dark" />
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success text-[8px] font-bold text-white flex items-center justify-center">
                {runningCount}
              </span>
            </div>
          </div>
        )}

        {/* Add project */}
        <div className="pb-3">
          <button
            onClick={() => setShowAddDialog(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer bg-transparent border-none"
            title="Add project"
          >
            <Plus size={13} strokeWidth={1.4} />
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
    <div className="w-60 bg-surface-secondary flex flex-col shrink-0 border-r border-border-light">
      {/* Drag region / brand header */}
      <div onMouseDown={handleDrag} className="no-select px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="h-5 flex items-center justify-center">
            <img src="/logo.svg" alt="Devpad Logo" className="h-full w-auto object-contain text-text" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleSidebar}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer bg-transparent border-none"
              title="Collapse sidebar"
            >
              <ChevronLeft size={14} strokeWidth={1.3} />
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
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all border w-full text-left ${
                view === item.id && (item.id !== 'dashboard' || !useProjectStore.getState().activeProject)
                  ? "bg-accent/8 border-accent/15 text-text font-semibold"
                  : "bg-transparent border-transparent text-text-secondary hover:bg-surface-tertiary/60 hover:text-text font-medium"
              }`}
            >
              <span className="shrink-0 flex items-center justify-center w-5 h-5">{item.icon}</span>
              <span className="text-[13px]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="px-4 py-1">
        <div className="h-px bg-border-light/50" />
      </div>

      {/* Projects section header */}
      <div className="px-4 pt-1 pb-1">
        <button
          onClick={() => setIsProjectsCollapsed(!isProjectsCollapsed)}
          className="flex items-center justify-between w-full border-none bg-transparent cursor-pointer group p-0 m-0"
        >
          <div className="flex items-center gap-1.5">
            <ChevronRight
              size={10}
              strokeWidth={1.5}
              className={`text-text-muted transition-transform group-hover:text-text ${isProjectsCollapsed ? 'rotate-0' : 'rotate-90'}`}
            />
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider group-hover:text-text transition-colors">
              Projects
            </span>
          </div>
          <span className="text-[11px] text-text-muted tabular-nums">
            {projects.length}
          </span>
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {!isProjectsCollapsed && <ProjectList />}
      </div>

      {/* Divider */}
      <div className="px-4">
        <div className="h-px bg-border-light/50" />
      </div>

      {/* Add project button */}
      <div className="p-2">
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full py-2 rounded-lg bg-transparent text-text-muted text-[12px] font-medium flex items-center justify-center gap-1.5 hover:bg-surface-tertiary hover:text-text transition-colors cursor-pointer border-none"
        >
          <Plus size={12} strokeWidth={1.5} />
          Add Project
        </button>
      </div>

      {/* Running now section — always shows footer when processes running */}
      <RunningSection running={running} />

      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}

// ── Running Processes Section ──

import type { RunningCommandInfo } from "@/lib/types";

const EMPTY_LOGS: string[] = [];

function RunningSection({ running }: { running: Record<string, RunningCommandInfo> }) {
  const runningEntries = Object.values(running).filter((r) => r.status === "running");
  const { activeProject } = useProjectStore();
  const logBuffers = useCommandStore((s) => s.logBuffers);

  if (runningEntries.length === 0) return null;

  return (
    <div className="px-2 pb-2">
      <div className="rounded-lg bg-success-light/20 border border-success/10 p-2">
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" />
          <span className="text-[10px] font-bold text-success-dark uppercase tracking-wider">
            Running
          </span>
          <span className="text-[10px] text-success-dark/70 tabular-nums ml-auto">
            {runningEntries.length}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          {runningEntries.map((entry) => {
            const logs = logBuffers[entry.commandId] ?? EMPTY_LOGS;
            const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
            return (
            <div
              key={entry.commandId}
              className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-success-light/30 transition-colors group cursor-default"
            >
              <span className="text-[11px] text-text truncate flex-1">
                {entry.commandId.split(":").pop() || entry.commandId}
              </span>
              {lastLog ? (
                <span
                  className="text-[9px] text-success-dark/80 truncate max-w-[90px]"
                  title={lastLog}
                >
                  {lastLog}
                </span>
              ) : null}
              <button
                onClick={() => {
                  if (activeProject?.path) {
                    commands.openTerminalAt(activeProject.path);
                  }
                }}
                className="w-5 h-5 rounded flex items-center justify-center text-text-muted opacity-0 group-hover:opacity-100 hover:text-text transition-all cursor-pointer bg-transparent border-none shrink-0"
                title="Open terminal"
              >
                <Terminal size={9} strokeWidth={1} />
              </button>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
