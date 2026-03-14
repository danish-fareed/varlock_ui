import { useProjectStore } from "@/stores/projectStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";

interface EnvironmentCardProps {
  envName: string;
  isActive: boolean;
  isLoading: boolean;
  variableCount: number;
  secretCount: number;
  valid: boolean | null;
  onSelect: () => void;
}

/**
 * Single environment card showing name, stats, and action buttons.
 */
export function EnvironmentCard({
  envName,
  isActive,
  isLoading,
  variableCount,
  secretCount,
  valid,
  onSelect,
}: EnvironmentCardProps) {
  const setView = useProjectStore((s) => s.setView);
  const badgeStyle = ENV_BADGE_STYLES[envName] ?? DEFAULT_ENV_BADGE;

  const handleLaunchTerminal = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    setView("terminal");
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative border rounded-xl p-3.5 cursor-pointer transition-all bg-surface-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${
        isActive
          ? "border-brand border-[1.5px] shadow-[0_0_0_1px_rgba(83,74,183,0.18)]"
          : "border-border hover:border-brand/50 hover:bg-brand-light/5"
      }`}
      aria-pressed={isActive}
    >
      {/* Active label */}
      {isActive && (
        <span className="absolute -top-px right-3 text-[10px] font-medium text-brand bg-surface-secondary px-1">
          active
        </span>
      )}

      {/* Top row: badge + indicator */}
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
        >
          {envName}
        </span>
        <div
          aria-label={
            isActive
              ? valid === null
                ? "Environment status unknown"
                : valid
                  ? "Environment valid"
                  : "Environment has errors"
              : "Environment inactive"
          }
          className={`w-[7px] h-[7px] rounded-full ${
            isActive
              ? valid === null
                ? "bg-text-muted"
                : valid
                  ? "bg-success"
                  : "bg-danger"
              : "bg-border"
          }`}
        />
      </div>

      {/* File name */}
      <div className="text-sm font-medium text-text mb-0.5">
        .env.{envName}
      </div>

      {/* Variable count */}
      <div className="text-[11px] text-text-muted mb-3">
        {isLoading ? (
          "Loading..."
        ) : isActive ? (
          <>
            {variableCount} variable{variableCount !== 1 ? "s" : ""} ·{" "}
            {secretCount} secret{secretCount !== 1 ? "s" : ""}
          </>
        ) : (
          "Click to load"
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={handleLaunchTerminal}
          className={`flex-1 py-1.5 text-[11px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer ${
            isActive
              ? "bg-brand text-white hover:bg-brand-dark shadow-[0_8px_20px_rgba(83,74,183,0.24)]"
              : "bg-transparent text-text-secondary border border-border hover:bg-surface"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 2l3 3-3 3M6 8h2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Terminal
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="flex-1 py-1.5 text-[11px] rounded-md border border-border bg-transparent text-text-secondary hover:bg-surface transition-colors cursor-pointer"
        >
          View vars
        </button>
      </div>
    </button>
  );
}
