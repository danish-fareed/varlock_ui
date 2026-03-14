import type { MergedVariable } from "@/lib/types";
import { TYPE_BADGE_STYLES, DEFAULT_TYPE_BADGE } from "@/lib/constants";

interface VariableRowProps {
  variable: MergedVariable;
  onSelect?: (variable: MergedVariable) => void;
}

/**
 * Single row in the variable list table.
 * Shows key, value (masked if sensitive), type badge, and status badge.
 * Uses MergedVariable which already includes hasSchema and metadata source info.
 */
export function VariableRow({ variable, onSelect }: VariableRowProps) {
  const typeBadge = TYPE_BADGE_STYLES[variable.type] ?? DEFAULT_TYPE_BADGE;

  const statusClass = !variable.valid
    ? "bg-danger-light text-danger-dark"
    : variable.sensitive
      ? "bg-brand-light text-brand"
      : "bg-success-light text-success-dark";

  const statusLabel = !variable.valid
    ? variable.errors[0] ?? "error"
    : variable.sensitive
      ? "secret"
      : "valid";

  // Display value: show "missing" for null, mask for sensitive
  const displayValue =
    variable.value === null ? (
      <span className="text-danger">— missing</span>
    ) : variable.sensitive ? (
      <span className="text-brand bg-brand/5 px-1 rounded">
        {"▒".repeat(Math.min(12, variable.value.length || 12))}
      </span>
    ) : (
      variable.value
    );

  return (
    <button
      type="button"
      onClick={() => onSelect?.(variable)}
      className="w-full text-left grid grid-cols-[180px_1fr_80px_80px] px-3 py-2 gap-3 items-center hover:bg-surface-secondary transition-colors cursor-pointer"
    >
      {/* Key */}
      <div className="font-mono text-xs font-medium text-text truncate">
        {variable.key}
      </div>

      {/* Value */}
      <div className="font-mono text-xs text-text-secondary truncate">
        {displayValue}
      </div>

      {/* Type badge with inferred indicator */}
      <div className="flex items-center gap-1">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: typeBadge.bg, color: typeBadge.text }}
        >
          {variable.type}
        </span>
        {!variable.hasSchema && (
          <span
            className="text-[9px] text-text-muted opacity-60"
            title="Type inferred — not confirmed in .env.schema"
          >
            *
          </span>
        )}
      </div>

      {/* Status badge */}
      <div className="flex justify-end">
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full truncate ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
    </button>
  );
}
