import { create } from "zustand";
import type { VaultStatusResult, VaultVariable } from "../lib/types";
import * as vault from "../lib/vault";

interface VaultStore {
  // State
  status: VaultStatusResult | null;
  loading: boolean;
  error: string | null;
  variables: VaultVariable[];
  globalVariables: Record<string, VaultVariable[]>; // projectId -> variables

  // Actions
  checkStatus: () => Promise<void>;
  setup: (password: string) => Promise<void>;
  unlock: (password: string, remember?: boolean) => Promise<void>;
  tryAutoUnlock: () => Promise<boolean>;
  lock: () => Promise<void>;
  loadVariables: (projectId: string, envName: string) => Promise<void>;
  loadAllGlobalVariables: (projects: any[]) => Promise<void>;
  setVariable: (
    projectId: string,
    envName: string,
    key: string,
    value: string,
    varType?: string,
    sensitive?: boolean
  ) => Promise<void>;
  deleteVariable: (
    projectId: string,
    envName: string,
    key: string
  ) => Promise<void>;
  importEnv: (
    projectId: string,
    envName: string,
    envContent: string,
    sensitiveKeys: string[]
  ) => Promise<string>;
  generateSecret: (
    secretType: string,
    length?: number
  ) => Promise<string>;
  clearError: () => void;
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  variables: [],
  globalVariables: {},

  checkStatus: async () => {
    try {
      const status = await vault.vaultStatus();
      set({ status });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setup: async (password) => {
    set({ loading: true, error: null });
    try {
      await vault.vaultSetup(password);
      const status = await vault.vaultStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  unlock: async (password, remember = false) => {
    set({ loading: true, error: null });
    try {
      await vault.vaultUnlock(password, remember);
      const status = await vault.vaultStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  tryAutoUnlock: async () => {
    try {
      const success = await vault.vaultAutoUnlock();
      if (success) {
        const status = await vault.vaultStatus();
        set({ status });
      }
      return success;
    } catch {
      return false;
    }
  },

  lock: async () => {
    try {
      await vault.vaultLock();
      const status = await vault.vaultStatus();
      set({ status, variables: [], globalVariables: {} });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadVariables: async (projectId, envName) => {
    try {
      const variables = await vault.vaultGetVariables(projectId, envName);
      set({ variables });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadAllGlobalVariables: async (projects) => {
    set({ loading: true });
    const results: Record<string, VaultVariable[]> = {};
    try {
      for (const project of projects) {
        const envs = project.environments || ["default"];
        const projectVars: VaultVariable[] = [];
        for (const env of envs) {
          try {
             const vars = await vault.vaultGetVariables(project.id, env);
             projectVars.push(...vars);
          } catch {
            // Skip failed environments
          }
        }
        results[project.id] = projectVars;
      }
      set({ globalVariables: results, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setVariable: async (projectId, envName, key, value, varType = "string", sensitive = false) => {
    try {
      await vault.vaultSetVariable(projectId, envName, key, value, varType, sensitive);
      // Reload variables
      await get().loadVariables(projectId, envName);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteVariable: async (projectId, envName, key) => {
    try {
      await vault.vaultDeleteVariable(projectId, envName, key);
      await get().loadVariables(projectId, envName);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  importEnv: async (projectId, envName, envContent, sensitiveKeys) => {
    try {
      return await vault.vaultImportEnv(projectId, envName, envContent, sensitiveKeys);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  generateSecret: async (secretType, length) => {
    return vault.vaultGenerateSecret(secretType, length);
  },

  clearError: () => set({ error: null }),
}));
