import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { ProjectItem } from "./ProjectItem";

/**
 * Renders the project list in the sidebar — macOS source list style.
 * Supports Pinned Projects with drag-and-drop reordering.
 */
export function ProjectList() {
  const { 
    projects, 
    activeProject, 
    setActiveProject, 
    isLoading,
    pinnedProjectIds,
    pinProject,
    unpinProject,
    reorderPinnedProjects,
    setView
  } = useProjectStore();

  const [draggedId, setDraggedId] = useState<string | null>(null);

  if (isLoading && projects.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <div className="w-5 h-5 rounded-full bg-sidebar-hover animate-pulse-soft mx-auto mb-2" />
        <p className="text-[11px] text-text-muted">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-[12px] text-text-muted">No projects yet.</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          Click "Add Project" below.
        </p>
      </div>
    );
  }

  // Get pinned and other projects
  const pinnedProjects = pinnedProjectIds
    .map(id => projects.find(p => p.id === id))
    .filter(Boolean) as any[];
  
  const otherProjects = projects.filter(p => !pinnedProjectIds.includes(p.id));

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId === null || draggedId === id) return;

    const currentOrder = [...pinnedProjectIds];
    const draggedIdx = currentOrder.indexOf(draggedId);
    const targetIdx = currentOrder.indexOf(id);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      currentOrder.splice(draggedIdx, 1);
      currentOrder.splice(targetIdx, 0, draggedId);
      reorderPinnedProjects(currentOrder);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  return (
    <div className="flex flex-col gap-4 py-1">
      {/* Pinned Projects Section */}
      {pinnedProjects.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="px-3 mb-1">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Pinned</h3>
          </div>
          {pinnedProjects.map((project) => (
            <ProjectItem
              key={`pinned-${project.id}`}
              project={project}
              isActive={activeProject?.id === project.id}
              isPinned={true}
              onUnpin={() => unpinProject(project.id)}
              onClick={() => {
                setActiveProject(project);
                setView("dashboard");
              }}
              draggable={true}
              onDragStart={() => handleDragStart(project.id)}
              onDragOver={(e) => handleDragOver(e, project.id)}
              onDrop={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* All Projects Section */}
      <div className="flex flex-col gap-0.5">
        {pinnedProjects.length > 0 && (
          <div className="px-3 mb-1">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">All Projects</h3>
          </div>
        )}
        {otherProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={activeProject?.id === project.id}
            isPinned={false}
            onPin={() => pinProject(project.id)}
            onClick={() => {
              setActiveProject(project);
              setView("dashboard");
            }}
          />
        ))}
      </div>
    </div>
  );
}
