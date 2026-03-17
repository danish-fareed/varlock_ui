import { useEnvironmentStore } from "@/stores/environmentStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";

interface EnvironmentSwitcherProps {
  environments: string[];
  onSelect?: (env: string) => void;
}

/**
 * Compact environment selector — macOS-style radio list for terminal sidebar.
 */
export function EnvironmentSwitcher({
  environments,
  onSelect,
}: EnvironmentSwitcherProps) {
  const { activeEnv, setActiveEnv } = useEnvironmentStore();

  const handleSelect = (env: string) => {
    setActiveEnv(env);
    onSelect?.(env);
  };

  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Environment selector">
      {environments.length === 0 && (
        <div className="text-[12px] text-text-muted py-2">No environments available.</div>
      )}
      {environments.map((env) => {
        const badge = ENV_BADGE_STYLES[env] ?? DEFAULT_ENV_BADGE;
        const isActive = activeEnv === env;

        return (
          <button
            key={env}
            onClick={() => handleSelect(env)}
            role="radio"
            aria-checked={isActive}
            className={`px-3 py-2 border rounded-lg text-left transition-all cursor-pointer ${
              isActive
                ? "border-accent bg-accent-light/50 shadow-[0_0_0_1px_rgba(10,132,255,0.15)]"
                : "border-border-light bg-surface hover:border-border hover:bg-surface-secondary"
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Radio indicator */}
              <div
                className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? "border-accent" : "border-border"
                }`}
              >
                {isActive && <div className="w-[7px] h-[7px] rounded-full bg-accent" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-text truncate">
                  .env.{env}
                </div>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md shrink-0 ${badge}`}
              >
                {env}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
