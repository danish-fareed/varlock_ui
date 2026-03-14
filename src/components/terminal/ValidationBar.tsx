import { useState } from "react";
import { useEnvironmentStore } from "@/stores/environmentStore";

interface ValidationBarProps {
  onStop: () => void;
}

/**
 * Bottom bar showing variable validation summary and a stop button.
 * Mirrors the mockup's val-bar design.
 */
export function ValidationBar({ onStop }: ValidationBarProps) {
  const loadResult = useEnvironmentStore((s) => s.loadResult);
  const [stopping, setStopping] = useState(false);

  if (!loadResult) return null;

  const totalVars = loadResult.variables.length;
  const validCount = loadResult.variables.filter((v) => v.valid).length;
  const secretCount = loadResult.variables.filter((v) => v.sensitive).length;
  const errorCount = loadResult.variables.filter((v) => !v.valid).length;

  const handleStop = () => {
    if (stopping) return;
    setStopping(true);
    try {
      onStop();
    } finally {
      setTimeout(() => setStopping(false), 1000);
    }
  };

  return (
    <div className="flex items-center px-3.5 py-2.5 bg-surface-secondary border-t border-border-light gap-3 flex-wrap shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <span className="text-[11px] text-text-muted mr-1">
        {totalVars} vars:
      </span>

      <div className="flex items-center gap-1.5 text-[11px]">
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-text-secondary">{validCount} valid</span>
      </div>

      {secretCount > 0 && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <div className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="text-text-secondary">
            {secretCount} secret{secretCount !== 1 ? "s" : ""} resolved
          </span>
        </div>
      )}

      {errorCount > 0 && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <div className="w-1.5 h-1.5 rounded-full bg-danger" />
          <span className="text-text-secondary">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="ml-auto flex gap-2">
        <button
          onClick={handleStop}
          disabled={stopping}
          className="text-[11px] px-3 py-1 border border-danger rounded-md bg-transparent text-danger hover:bg-danger-light transition-colors cursor-pointer disabled:opacity-50"
        >
          {stopping ? "Stopping..." : "Stop process"}
        </button>
      </div>
    </div>
  );
}
