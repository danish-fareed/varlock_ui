import { useProjectStore } from "@/stores/projectStore";
import { ProjectList } from "@/components/project/ProjectList";
import { AddProjectDialog } from "@/components/project/AddProjectDialog";
import { useState } from "react";

/**
 * Sidebar: brand header, project list, add project button.
 */
export function Sidebar() {
  const projects = useProjectStore((s) => s.projects);
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="w-56 bg-surface-secondary border-r border-border-light flex flex-col shrink-0 shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.02)]">
      {/* Brand header */}
      <div className="px-4 pt-4 pb-3 border-b border-border-light">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand" />
          <span className="text-sm font-medium text-text">Varlock</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Section label */}
      <div className="px-4 pt-3.5 pb-1.5">
        <span className="text-[10px] font-medium text-text-muted tracking-wider uppercase">
          Projects
        </span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto">
        <ProjectList />
      </div>

      {/* Add project button */}
      <div className="p-3 border-t border-border-light">
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full py-2 border border-dashed border-border rounded-lg bg-transparent text-text-secondary text-xs flex items-center justify-center gap-1.5 hover:bg-surface hover:text-text transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Add project
        </button>
      </div>

      {/* Add project dialog */}
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}
