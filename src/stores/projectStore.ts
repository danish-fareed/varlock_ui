import { create } from "zustand";
import type { Project, AppView } from "@/lib/types";
import * as commands from "@/lib/commands";

const PINNED_STORAGE_KEY = "varlock_pinned_projects";

interface ProjectState {
  /** All managed projects */
  projects: Project[];
  /** Currently selected project */
  activeProject: Project | null;
  /** Pinned project IDs for sidebar */
  pinnedProjectIds: string[];
  /** Current view mode */
  view: AppView;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  setActiveProject: (project: Project | null) => void;
  addProject: (path: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  refreshActiveProject: () => Promise<void>;
  setView: (view: AppView | string) => void;
  clearError: () => void;
  pinProject: (projectId: string) => void;
  unpinProject: (projectId: string) => void;
  reorderPinnedProjects: (projectIds: string[]) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  pinnedProjectIds: (() => {
    try {
      return JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  })(),
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
    set({ activeProject: project, view: "dashboard" });
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

  setView: (view: string) => {
    // Sanitize stale view values from old sessions
    const sanitized: AppView =
      view === "terminal" ? "dashboard" :
      view === "settings" ? "dashboard" :
      view === "security" ? "vault" :
      (view as AppView);
    set({ view: sanitized });
  },

  pinProject: (projectId) => {
    const current = get().pinnedProjectIds;
    if (current.includes(projectId)) return;
    const next = [...current, projectId];
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
    set({ pinnedProjectIds: next });
  },

  unpinProject: (projectId) => {
    const next = get().pinnedProjectIds.filter((id) => id !== projectId);
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
    set({ pinnedProjectIds: next });
  },

  reorderPinnedProjects: (projectIds) => {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(projectIds));
    set({ pinnedProjectIds: projectIds });
  },

  clearError: () => set({ error: null }),
}));
