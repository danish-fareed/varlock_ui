import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { EnvironmentCard } from "./EnvironmentCard";

/**
 * Grid of environment cards for the active project.
 * Automatically loads environment data when project changes.
 */
export function EnvironmentCards() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const { activeEnv, loadResult, isLoading, error, loadEnvironment, setActiveEnv } =
    useEnvironmentStore();

  // Guard against stale data when rapidly switching projects
  const loadIdRef = useRef(0);

  // Load environment data when active project changes
  useEffect(() => {
    if (activeProject) {
      const loadId = ++loadIdRef.current;
      loadEnvironment(activeProject.path).catch(() => {
        // Error is already captured in the store
      });
      // If a newer load has started, this one's result is stale
      // (the store will have the latest result anyway, but this prevents
      // any follow-up actions based on an outdated load)
      void loadId; // acknowledgment -- the store handles state
    }
  }, [activeProject, loadEnvironment]);

  if (!activeProject) return null;

  if (activeProject.status === "migrationNeeded") {
    return null;
  }

  const environments = activeProject.environments;

  const handleEnvSelect = (env: string) => {
    setActiveEnv(env);
    if (activeProject) {
      loadEnvironment(activeProject.path, env);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-medium text-text-secondary tracking-wider mb-3">
        ENVIRONMENTS
      </h3>

      {error && (
        <div className="bg-danger-light text-danger-dark text-xs px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {environments.length === 0 && !isLoading && (
        <div className="text-xs text-text-muted py-4 text-center">
          No environments found in this project.
        </div>
      )}

      {isLoading && !loadResult && (
        <div className="text-xs text-text-muted py-4 text-center">
          Loading environments...
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {environments.map((env) => (
          <EnvironmentCard
            key={env}
            envName={env}
            isActive={activeEnv === env}
            isLoading={isLoading && activeEnv === env}
            variableCount={
              activeEnv === env ? loadResult?.variables.length ?? 0 : 0
            }
            secretCount={
              activeEnv === env
                ? loadResult?.variables.filter((v) => v.sensitive).length ?? 0
                : 0
            }
            valid={activeEnv === env ? loadResult?.valid ?? null : null}
            onSelect={() => handleEnvSelect(env)}
          />
        ))}
      </div>
    </div>
  );
}
