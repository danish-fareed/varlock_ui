import { useEnvironmentStore } from "@/stores/environmentStore";

const FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "secrets" as const, label: "Secrets" },
  { key: "errors" as const, label: "Errors" },
  { key: "required" as const, label: "Required" },
];

/**
 * Segmented filter pills for the variable list with count badges.
 */
export function VariableFilters() {
  const { filter, setFilter, loadResult } = useEnvironmentStore();

  // Compute counts
  const counts: Record<string, number> = {
    all: loadResult?.variables.length ?? 0,
    secrets: loadResult?.variables.filter((v) => v.sensitive).length ?? 0,
    errors: loadResult?.variables.filter((v) => !v.valid).length ?? 0,
    required: loadResult?.variables.filter((v) => v.required).length ?? 0,
  };

  return (
    <div className="flex bg-surface-tertiary rounded-lg p-[2px] gap-0.5">
      {FILTERS.map((f) => {
        const count = counts[f.key] ?? 0;
        const isActive = filter === f.key;
        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] font-medium px-2.5 py-[3px] rounded-md transition-all cursor-pointer border-none flex items-center gap-1 ${
              isActive
                ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "bg-transparent text-text-secondary hover:text-text"
            }`}
          >
            {f.label}
            {f.key !== "all" && count > 0 && (
              <span
                className={`text-[9px] font-semibold min-w-[14px] h-[14px] rounded-full inline-flex items-center justify-center px-1 ${
                  isActive
                    ? f.key === "errors"
                      ? "bg-danger/15 text-danger"
                      : f.key === "secrets"
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-tertiary text-text-muted"
                    : "bg-transparent text-text-muted"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
