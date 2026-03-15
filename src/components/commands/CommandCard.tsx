import { useState, useEffect } from "react";
import type { DiscoveredCommand } from "@/lib/types";
import { useCommandStore } from "@/stores/commandStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import * as commands from "@/lib/commands";

// ── Category visuals ──

const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
  "dev-server":   { icon: "▶", color: "text-accent" },
  build:          { icon: "⚡", color: "text-warning" },
  test:           { icon: "✓", color: "text-success" },
  database:       { icon: "⊙", color: "text-danger" },
  "code-quality": { icon: "◆", color: "text-[#6B3FA0]" },
  deploy:         { icon: "↑", color: "text-warning-dark" },
  docker:         { icon: "⊞", color: "text-[#185FA5]" },
  custom:         { icon: "★", color: "text-text-muted" },
  other:          { icon: "●", color: "text-text-muted" },
};

function getIcon(category: string) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.other!;
}

function formatUptime(startedAt: number): string {
  const diff = Math.floor((Date.now() - startedAt) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

// ── Component ──

interface CommandCardProps {
  command: DiscoveredCommand;
}

export function CommandCard({ command }: CommandCardProps) {
  const { activeProject } = useProjectStore();
  const { activeEnv: envName } = useEnvironmentStore();
  const running = useCommandStore((s) => s.running[command.id]);
  const errors = useCommandStore((s) => s.commandErrors[command.id]);
  const { launchCommand, stopCommand, clearError } = useCommandStore();

  const [uptime, setUptime] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const isRunning = running?.status === "running";

  const icon = getIcon(command.category);
  const cwd = activeProject?.path || "";
  const currentEnv = envName || "development";

  // Uptime ticker
  useEffect(() => {
    if (!isRunning || !running?.startedAt) return;
    const interval = setInterval(() => {
      setUptime(formatUptime(running.startedAt));
    }, 1000);
    setUptime(formatUptime(running.startedAt));
    return () => clearInterval(interval);
  }, [isRunning, running?.startedAt]);

  const handlePlay = () => {
    if (!cwd) return;
    const isDangerous = command.category === "database" || command.category === "deploy";
    const isProd = currentEnv.toLowerCase().includes("prod");
    if (isDangerous && isProd) {
      setShowConfirm(true);
      return;
    }
    launchCommand(cwd, command, currentEnv);
  };

  const handleConfirmedPlay = () => {
    setShowConfirm(false);
    if (cwd) launchCommand(cwd, command, currentEnv);
  };

  const handleDismiss = () => stopCommand(command.id);

  const handleOpenTerminal = () => {
    if (cwd) commands.openTerminalAt(cwd);
  };

  const handleRunInTerminal = () => {
    if (cwd) commands.runInTerminal(cwd, command.rawCmd);
  };

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
          isRunning
            ? "border-success/40 bg-success-light/20"
            : "border-border-light bg-surface hover:bg-surface-secondary/50"
        }`}
      >
        {/* Category icon */}
        <span className={`text-[12px] shrink-0 ${icon.color}`}>{icon.icon}</span>

        {/* Name + command */}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-text truncate leading-tight">
            {command.name}
          </div>
          <div className="text-[10px] font-mono text-text-muted truncate leading-tight">
            {command.rawCmd}
          </div>
        </div>

        {/* Launched indicator + uptime */}
        {isRunning && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" />
            <span className="text-[9px] font-mono text-success-dark">{uptime}</span>
          </div>
        )}

        {/* Pre-flight error */}
        {errors && errors.length > 0 && (
          <button
            onClick={() => clearError(command.id)}
            className="text-[9px] px-1.5 py-0.5 rounded-full bg-danger-light text-danger-dark font-medium shrink-0 cursor-pointer border-none"
            title={errors.join(", ")}
          >
            ⚠ {errors[0]?.substring(0, 30)}
          </button>
        )}

        {/* Terminal button — opens OS terminal at project (always available) */}
        <button
          onClick={isRunning ? handleOpenTerminal : handleRunInTerminal}
          className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer bg-transparent border-none shrink-0"
          title={isRunning ? "Open terminal at project" : "Run in terminal"}
        >
          <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
            <rect x="0.5" y="1" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
            <path d="M2 4l2 2-2 2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 8h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
        </button>

        {/* Play / Launched state */}
        {isRunning ? (
          <button
            onClick={handleDismiss}
            className="h-6 px-2.5 rounded-md bg-success-light text-success-dark text-[10px] font-medium border border-success/30 hover:bg-surface-secondary cursor-pointer flex items-center gap-1 shrink-0"
            title="Dismiss — terminal still runs in OS"
          >
            ✓ Launched
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="h-6 px-2.5 rounded-md bg-accent text-white text-[10px] font-medium hover:bg-accent-hover cursor-pointer border-none flex items-center gap-1 shrink-0"
          >
            ▶ Play
          </button>
        )}
      </div>

      {/* Production confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full shadow-xl border border-border-light animate-scale-in">
            <div className="text-[14px] font-semibold text-text mb-2">
              ⚠ Production Safety Guard
            </div>
            <div className="text-[12px] text-text-secondary mb-3">
              Run <span className="font-mono font-medium">{command.rawCmd}</span> on <span className="text-danger font-medium">{currentEnv}</span>?
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-secondary text-text-secondary text-[11px] font-medium cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedPlay}
                className="px-3 py-1.5 rounded-lg bg-danger text-white text-[11px] font-medium cursor-pointer border-none"
              >
                Run on {currentEnv}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
