import { create } from "zustand";
import type { Project, AppView } from "@/lib/types";
import * as commands from "@/lib/commands";

interface ProjectState {
  /** All managed projects */
  projects: Project[];
  /** Currently selected project */
  activeProject: Project | null;
  /** Current view mode */
  view: AppView;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  setActiveProject: (project: Project) => void;
  addProject: (path: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  refreshActiveProject: () => Promise<void>;
  setView: (view: AppView) => void;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  view: "dashboard",
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await commands.projectList();
      const active = get().activeProject;
      set({
        projects,
        isLoading: false,
        // Keep active project if it still exists
        activeProject: active
          ? projects.find((p) => p.id === active.id) ?? projects[0] ?? null
          : projects[0] ?? null,
      });
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  setActiveProject: (project) => {
    set({ activeProject: project });
  },

  addProject: async (path) => {
    set({ isLoading: true, error: null });
    try {
      const project = await commands.projectAdd(path);
      set((state) => ({
        projects: [...state.projects, project],
        activeProject: project,
        isLoading: false,
      }));
      return project;
    } catch (e) {
      set({ isLoading: false, error: String(e) });
      throw e;
    }
  },

  removeProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await commands.projectRemove(id);
      set((state) => {
        const projects = state.projects.filter((p) => p.id !== id);
        return {
          projects,
          isLoading: false,
          activeProject:
            state.activeProject?.id === id
              ? projects[0] ?? null
              : state.activeProject,
        };
      });
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  refreshActiveProject: async () => {
    await get().loadProjects();
  },

  setView: (view) => set({ view }),
  clearError: () => set({ error: null }),
}));
