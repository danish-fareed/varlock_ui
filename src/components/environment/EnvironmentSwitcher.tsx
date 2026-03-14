import { useEnvironmentStore } from "@/stores/environmentStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";

interface EnvironmentSwitcherProps {
  environments: string[];
  onSelect?: (env: string) => void;
}

/**
 * Compact environment selector used in the terminal sidebar.
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
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Environment selector">
      {environments.length === 0 && (
        <div className="text-xs text-text-muted py-2">No environments available.</div>
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
            className={`px-3 py-2.5 border rounded-lg text-left transition-all cursor-pointer ${
              isActive
                ? "border-brand border-[1.5px] bg-brand-light"
                : "border-border hover:border-brand/50"
            }`}
          >
            <div className="text-[13px] font-medium text-text">
              .env.{env}
            </div>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              {env}
            </span>
          </button>
        );
      })}
    </div>
  );
}
