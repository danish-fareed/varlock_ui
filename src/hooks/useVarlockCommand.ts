import { useCallback, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import * as commands from "@/lib/commands";
import type { VarlockStatus } from "@/lib/types";

/**
 * Hook for common Varlock CLI operations tied to the current project.
 */
export function useVarlockCommand() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const refreshActiveProject = useProjectStore((s) => s.refreshActiveProject);
  const { loadEnvironment, activeEnv } = useEnvironmentStore();
  const [varlockStatus, setVarlockStatus] = useState<VarlockStatus | null>(null);

  /** Check if varlock is installed */
  const checkVarlock = useCallback(async () => {
    const status = await commands.checkVarlock();
    setVarlockStatus(status);
    return status;
  }, []);

  /** Install varlock globally */
  const installVarlock = useCallback(async () => {
    const result = await commands.installVarlock();
    // Re-check after install
    const status = await commands.checkVarlock();
    setVarlockStatus(status);
    return result;
  }, []);

  /** Load environment data for the active project */
  const loadCurrentEnvironment = useCallback(
    async (env?: string) => {
      if (!activeProject) return;
      await loadEnvironment(activeProject.path, env ?? activeEnv);
    },
    [activeProject, activeEnv, loadEnvironment],
  );

  /** Initialize varlock in the active project */
  const initProject = useCallback(async () => {
    if (!activeProject) return;
    await commands.varlockInit(activeProject.path);
    await refreshActiveProject();
    await loadCurrentEnvironment();
  }, [activeProject, loadCurrentEnvironment, refreshActiveProject]);

  /** Run a security scan on the active project */
  const scanProject = useCallback(async () => {
    if (!activeProject) return null;
    return commands.varlockScan(activeProject.path);
  }, [activeProject]);

  return {
    varlockStatus,
    checkVarlock,
    installVarlock,
    loadCurrentEnvironment,
    initProject,
    scanProject,
  };
}
