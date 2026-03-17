import { useProjectStore } from "@/stores/projectStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";
import { Terminal } from "lucide-react";

interface EnvironmentCardProps {
  envName: string;
  isActive: boolean;
  isLoading: boolean;
  variableCount: number;
  secretCount: number;
  valid: boolean | null;
  onSelect: () => void;
  style?: React.CSSProperties;
}

/**
 * Single environment card — macOS-style elevated card with subtle shadow.
 */
export function EnvironmentCard({
  envName,
  isActive,
  isLoading,
  variableCount,
  secretCount,
  valid,
  onSelect,
  style,
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
      style={style}
      className={`animate-fade-in relative border rounded-xl p-4 cursor-pointer transition-all bg-surface text-left ${
        isActive
          ? "border-accent shadow-[0_0_0_1px_rgba(10,132,255,0.2),0_4px_12px_rgba(10,132,255,0.08)]"
          : "border-border-light shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-border"
      }`}
      aria-pressed={isActive}
    >
      {/* Top row: badge + status dot */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-[11px] font-medium px-2 py-[3px] rounded-md ${badgeStyle}`}
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
          className={`w-2 h-2 rounded-full transition-colors ${
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
      <div className="text-[13px] font-medium text-text mb-0.5">
        .env.{envName}
      </div>

      {/* Stats */}
      <div className="text-[11px] text-text-muted mb-3">
        {isLoading ? (
          <span className="animate-pulse-soft">Loading...</span>
        ) : isActive ? (
          <>
            {variableCount} variable{variableCount !== 1 ? "s" : ""} &middot;{" "}
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
          className={`flex-1 h-7 text-[11px] font-medium rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer border ${
            isActive
              ? "bg-accent text-white border-accent hover:bg-accent-hover"
              : "bg-surface text-text-secondary border-border-light hover:bg-surface-secondary hover:text-text"
          }`}
        >
          <Terminal size={10} strokeWidth={1.2} aria-hidden="true" />
          Terminal
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="flex-1 h-7 text-[11px] font-medium rounded-md border border-border-light bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text transition-all cursor-pointer"
        >
          View vars
        </button>
      </div>
    </button>
  );
}
