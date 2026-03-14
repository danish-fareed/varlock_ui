import { create } from "zustand";
import type { MergedLoadResult, MergedVariable } from "@/lib/types";
import * as commands from "@/lib/commands";

type VariableFilter = "all" | "secrets" | "errors" | "required";

let loadRequestCounter = 0;

interface EnvironmentState {
  /** Current environment name */
  activeEnv: string;
  /** Latest merged load result (CLI output + schema metadata) */
  loadResult: MergedLoadResult | null;
  /** Loading state for varlock load */
  isLoading: boolean;
  /** Error from varlock load */
  error: string | null;
  /** Active variable filter */
  filter: VariableFilter;

  // Actions
  setActiveEnv: (env: string) => void;
  loadEnvironment: (cwd: string, env?: string) => Promise<void>;
  setFilter: (filter: VariableFilter) => void;
  clearError: () => void;

  // Computed-like getters
  getFilteredVariables: () => MergedVariable[];
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  activeEnv: "development",
  loadResult: null,
  isLoading: false,
  error: null,
  filter: "all",

  setActiveEnv: (env) => {
    set({ activeEnv: env });
  },

  loadEnvironment: async (cwd, env) => {
    const envName = env ?? get().activeEnv;
    const requestId = ++loadRequestCounter;
    set({ isLoading: true, error: null });
    try {
      const result = await commands.varlockLoadMerged(cwd, envName);
      if (requestId !== loadRequestCounter) {
        return;
      }
      set({
        loadResult: result,
        activeEnv: result.env,
        isLoading: false,
      });
    } catch (e) {
      if (requestId !== loadRequestCounter) {
        return;
      }
      set({ isLoading: false, error: String(e) });
    }
  },

  setFilter: (filter) => set({ filter }),
  clearError: () => set({ error: null }),

  getFilteredVariables: () => {
    const { loadResult, filter } = get();
    if (!loadResult) return [];

    switch (filter) {
      case "secrets":
        return loadResult.variables.filter((v) => v.sensitive);
      case "errors":
        return loadResult.variables.filter((v) => !v.valid);
      case "required":
        return loadResult.variables.filter((v) => v.required);
      default:
        return loadResult.variables;
    }
  },
}));
