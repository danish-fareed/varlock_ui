import { useEnvironmentStore } from "@/stores/environmentStore";

const FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "secrets" as const, label: "Secrets" },
  { key: "errors" as const, label: "Errors" },
  { key: "required" as const, label: "Required" },
];

/**
 * Filter pill buttons for the variable list.
 */
export function VariableFilters() {
  const { filter, setFilter } = useEnvironmentStore();

  return (
    <div className="flex gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => setFilter(f.key)}
          className={`text-[11px] px-3 py-1 rounded-full border transition-colors cursor-pointer ${
            filter === f.key
              ? "bg-brand-light text-brand border-brand-muted"
              : "bg-transparent text-text-secondary border-border hover:bg-surface-secondary"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
