import { useState, useEffect } from "react";
import { Play, Terminal, Square } from "lucide-react";
import type { DiscoveredCommand } from "@/lib/types";
import { useCommandStore } from "@/stores/commandStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import * as commands from "@/lib/commands";

// ── Utilities ──

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
        className={`flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all group ${
          isRunning
            ? "bg-success-light/30 border-l-2 border-l-success"
            : "hover:bg-surface-secondary/60"
        }`}
      >
        {/* Name + command — flipped hierarchy */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text truncate">
            {command.name}
          </div>
          <div className="text-[11px] font-mono text-text-muted truncate mt-0.5">
            {command.rawCmd}
          </div>
        </div>

        {/* Running state badge */}
        {isRunning && (
          <div className="flex items-center gap-1.5 shrink-0 bg-success-light rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-soft" />
            <span className="text-[10px] font-mono font-medium text-success-dark">{uptime}</span>
          </div>
        )}

        {/* Pre-flight error */}
        {errors && errors.length > 0 && (
          <button
            onClick={() => clearError(command.id)}
            className="text-[10px] px-2 py-0.5 rounded-full bg-danger-light text-danger-dark font-medium shrink-0 cursor-pointer border-none"
            title={errors.join(", ")}
          >
            ⚠ {errors[0]?.substring(0, 30)}
          </button>
        )}

        {/* Terminal button */}
        <button
          onClick={isRunning ? handleOpenTerminal : handleRunInTerminal}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer bg-transparent border-none shrink-0 opacity-0 group-hover:opacity-100"
          title={isRunning ? "Open terminal at project" : "Run in terminal"}
        >
          <Terminal size={12} strokeWidth={1.2} />
        </button>

        {/* Play / Stop */}
        {isRunning ? (
          <button
            onClick={handleDismiss}
            className="h-8 w-8 rounded-lg bg-success-light text-success-dark border border-success/20 hover:bg-danger-light hover:text-danger-dark hover:border-danger/20 cursor-pointer flex items-center justify-center shrink-0 transition-colors"
            title="Dismiss — terminal still runs in OS"
          >
            <Square size={10} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="h-8 w-8 rounded-lg bg-accent text-white hover:bg-accent-hover cursor-pointer border-none flex items-center justify-center shrink-0 shadow-sm transition-colors"
          >
            <Play size={11} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Production confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full shadow-xl border border-border-light animate-scale-in">
            <div className="text-[14px] font-semibold text-text mb-2">
              ⚠ Production Safety Guard
            </div>
            <div className="text-[12px] text-text-secondary mb-4 leading-5">
              Run <span className="font-mono font-medium bg-surface-tertiary px-1.5 py-0.5 rounded">{command.rawCmd}</span> on <span className="text-danger font-medium">{currentEnv}</span>?
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg bg-surface-secondary text-text-secondary text-[12px] font-medium cursor-pointer border-none hover:bg-surface-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedPlay}
                className="px-4 py-2 rounded-lg bg-danger text-white text-[12px] font-medium cursor-pointer border-none hover:opacity-90 transition-colors"
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
