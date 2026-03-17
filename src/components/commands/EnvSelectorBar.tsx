import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useCommandStore } from "@/stores/commandStore";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function EnvSelectorBar() {
  const { activeProject } = useProjectStore();
  const { activeEnv, setActiveEnv, loadResult } = useEnvironmentStore();
  const scan = useCommandStore((s) => s.scan);
  const running = useCommandStore((s) => s.running);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!activeProject) return null;

  const envs = activeProject.environments || [];
  const currentEnv = activeEnv || envs[0] || "development";
  const envTier = scan?.envTier || "none";
  const runningCount = Object.values(running).filter(
    (r) => r.status === "running",
  ).length;

  // Env dot color
  const dotColor =
    loadResult?.valid === true
      ? "bg-success"
      : loadResult?.valid === false
        ? loadResult.errorCount > 0
          ? "bg-danger"
          : "bg-warning"
        : "bg-text-muted";

  return (
    <div className="flex items-center gap-2.5">
      {/* Label */}
      <span className="text-[11px] text-text-muted shrink-0">Active env</span>

      {/* Selector dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-border-light rounded-full bg-surface hover:border-accent transition-colors cursor-pointer"
        >
          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className="text-[11px] font-medium text-text">
            {currentEnv}
          </span>
          <ChevronDown
            size={10}
            strokeWidth={1.2}
            className="opacity-50"
          />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-1 bg-surface border border-border-light rounded-xl shadow-lg z-50 min-w-[160px] py-1 animate-fade-in">
              {envs.map((env) => (
                <button
                  key={env}
                  onClick={() => {
                    setActiveEnv(env);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-[12px] hover:bg-surface-secondary transition-colors cursor-pointer border-none bg-transparent flex items-center gap-2 ${
                    env === currentEnv
                      ? "text-accent font-medium"
                      : "text-text"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      env === currentEnv ? "bg-accent" : "bg-text-muted/30"
                    }`}
                  />
                  {env}
                </button>
              ))}
              {envs.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-text-muted">
                  No environments found
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Meta info */}
      {loadResult && (
        <span className="text-[11px] text-text-secondary ml-1">
          {loadResult.variables?.length ?? 0} vars
          {loadResult.warningCount > 0 && (
            <span className="text-warning"> · {loadResult.warningCount} warning{loadResult.warningCount !== 1 ? "s" : ""}</span>
          )}
        </span>
      )}

      {/* Env tier badge */}
      {envTier === "varlock" && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-light text-accent font-medium ml-1">
          varlock
        </span>
      )}
      {envTier === "dotenv" && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-text-muted font-medium ml-1">
          .env
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Running count */}
      {runningCount > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-success-dark">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" />
          {runningCount} running
        </span>
      )}
    </div>
  );
}
