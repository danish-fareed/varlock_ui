import { useProjectStore } from "@/stores/projectStore";

export function DashboardPage() {
  const { projects } = useProjectStore();

  return (
    <div className="flex-1 overflow-auto p-8 bg-surface">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="2" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="2" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="2" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text tracking-tight">Overview</h1>
            <p className="text-[13px] text-text-secondary mt-0.5">Manage your workspace environments.</p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-surface-secondary/50 rounded-2xl border border-border-light border-dashed">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-text-muted mb-4">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="text-[15px] font-medium text-text mb-1">No projects found</h2>
            <p className="text-[13px] text-text-secondary">Click "Add Project" in the sidebar to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: any }) {
  const { setActiveProject, setView } = useProjectStore();
  const envCount = project.environments?.length || 0;

  return (
    <button
      onClick={() => {
        setActiveProject(project);
        setView("dashboard");
      }}
      className="text-left bg-surface rounded-2xl p-6 border border-border-light hover:border-accent hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4">
         <div className={`w-2 h-2 rounded-full ${project.status === 'ready' ? 'bg-success' : project.status === 'migrationNeeded' ? 'bg-warning' : 'bg-danger'}`} />
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center shrink-0 group-hover:bg-accent group-hover:text-white transition-all duration-300">
          <svg width="24" height="24" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1.5 4V10.5C1.5 11.0523 1.94772 11.5 2.5 11.5H11.5C12.0523 11.5 12.5 11.0523 12.5 10.5V5.5C12.5 4.94772 12.0523 4.5 11.5 4.5H7.5L6 3H2.5C1.94772 3 1.5 3.44772 1.5 4Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-text truncate group-hover:text-accent transition-colors">
            {project.name}
          </h3>
          <p className="text-[12px] text-text-muted truncate mt-1 font-mono opacity-60" title={project.path}>
            {project.path.split(/[\\/]/).slice(-2).join("/")}
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Environments</span>
            <span className="text-[14px] font-semibold text-text mt-1">{envCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Status</span>
            <span className={`text-[12px] font-semibold mt-1 ${project.status === 'ready' ? 'text-success' : 'text-warning'}`}>
               {project.status === 'ready' ? 'Consistent' : 'Action Required'}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-border-light flex items-center justify-between">
          <span className="text-[11px] font-bold text-accent group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
            Open Project
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </span>
        </div>
      </div>
    </button>
  );
}
