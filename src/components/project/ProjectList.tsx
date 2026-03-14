import { useProjectStore } from "@/stores/projectStore";
import { ProjectItem } from "./ProjectItem";

/**
 * Renders the list of projects in the sidebar.
 */
export function ProjectList() {
  const { projects, activeProject, setActiveProject, isLoading } = useProjectStore();

  if (isLoading && projects.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <div className="w-6 h-6 rounded-full bg-surface-tertiary animate-pulse mx-auto mb-2" />
        <p className="text-xs text-text-muted">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-text-muted">No projects yet.</p>
        <p className="text-xs text-text-muted mt-1">
          Click "Add project" below.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={activeProject?.id === project.id}
          onClick={() => setActiveProject(project)}
        />
      ))}
    </div>
  );
}
