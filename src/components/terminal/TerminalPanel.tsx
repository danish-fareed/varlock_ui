import { useRef, useCallback, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useTerminalStore, isDangerousEnv } from "@/stores/terminalStore";
import { TerminalInstance, type TerminalInstanceHandle } from "./TerminalInstance";
import { TerminalTabs } from "./TerminalTabs";
import { ValidationBar } from "./ValidationBar";
import { EnvironmentSwitcher } from "@/components/environment/EnvironmentSwitcher";
import type { SavedRunConfig } from "@/lib/types";

/**
 * Full terminal panel: sidebar (env picker, command input, saved runs) + terminal area.
 * This is the primary view for `varlock run` interaction.
 */
export function TerminalPanel() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const { activeEnv } = useEnvironmentStore();
  const {
    sessions,
    activeSessionId,
    commandInput,
    savedRuns,
    setCommandInput,
    launchProcess,
    killProcess,
    addSavedRun,
    removeSavedRun,
    touchSavedRun,
  } = useTerminalStore();

  const terminalRefs = useRef<Map<string, TerminalInstanceHandle>>(new Map());
  // Buffer output received before the terminal instance is mounted
  const pendingOutput = useRef<Map<string, string[]>>(new Map());
  const [isLaunching, setIsLaunching] = useState(false);
  const [showProdWarning, setShowProdWarning] = useState(false);
  const [pendingLaunchCmd, setPendingLaunchCmd] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  /**
   * Write data to a terminal, buffering if the terminal isn't mounted yet.
   */
  const writeToTerminal = useCallback((sessionId: string, data: string) => {
    const termHandle = terminalRefs.current.get(sessionId);
    if (termHandle) {
      termHandle.write(data);
    } else {
      // Terminal not mounted yet -- buffer the output
      const buffer = pendingOutput.current.get(sessionId) ?? [];
      buffer.push(data);
      pendingOutput.current.set(sessionId, buffer);
    }
  }, []);

  /**
   * Called when a TerminalInstance ref is set. Flushes any buffered output.
   */
  const handleTerminalRef = useCallback(
    (sessionId: string, handle: TerminalInstanceHandle | null) => {
      if (handle) {
        terminalRefs.current.set(sessionId, handle);
        // Flush any pending output that arrived before mount
        const buffer = pendingOutput.current.get(sessionId);
        if (buffer && buffer.length > 0) {
          for (const data of buffer) {
            handle.write(data);
          }
          pendingOutput.current.delete(sessionId);
        }
      } else {
        terminalRefs.current.delete(sessionId);
        pendingOutput.current.delete(sessionId);
      }
    },
    [],
  );

  const doLaunch = useCallback(
    async (cmd: string) => {
      if (!activeProject || !cmd.trim() || isLaunching) return;

      setIsLaunching(true);
      try {
        const sessionId = await launchProcess(
          activeProject.path,
          activeEnv,
          cmd,
          (nextSessionId, data) => {
            writeToTerminal(nextSessionId, data);
          },
          (nextSessionId, code) => {
            writeToTerminal(
              nextSessionId,
              `\r\n\x1b[90m--- Process exited with code ${code ?? "unknown"} ---\x1b[0m\r\n`,
            );
          },
        );

        // Write initial command display
        writeToTerminal(
          sessionId,
          `\x1b[90m$\x1b[0m varlock run -- ${cmd}\r\n`,
        );
      } finally {
        setIsLaunching(false);
      }
    },
    [activeProject, activeEnv, launchProcess, isLaunching, writeToTerminal],
  );

  const handleLaunch = useCallback(
    async (cmd?: string) => {
      const command = cmd ?? commandInput;
      if (!command.trim()) return;

      // Check for dangerous environment
      if (isDangerousEnv(activeEnv)) {
        setPendingLaunchCmd(command);
        setShowProdWarning(true);
        return;
      }

      await doLaunch(command);
    },
    [commandInput, activeEnv, doLaunch],
  );

  const handleConfirmProdLaunch = useCallback(async () => {
    setShowProdWarning(false);
    if (pendingLaunchCmd) {
      await doLaunch(pendingLaunchCmd);
      setPendingLaunchCmd(null);
    }
  }, [pendingLaunchCmd, doLaunch]);

  const handleCancelProdLaunch = useCallback(() => {
    setShowProdWarning(false);
    setPendingLaunchCmd(null);
  }, []);

  const handleStop = useCallback(() => {
    if (activeSessionId) {
      killProcess(activeSessionId);
    }
  }, [activeSessionId, killProcess]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLaunch();
    }
  };

  const handleSaveCurrentCommand = () => {
    if (commandInput.trim()) {
      addSavedRun(commandInput.trim(), commandInput.trim(), null);
    }
  };

  const handleUseSavedRun = (run: SavedRunConfig) => {
    setCommandInput(run.command);
    touchSavedRun(run.id);
  };

  if (!activeProject) return null;

  const launchDisabled = !commandInput.trim() || isLaunching;

  // Sort saved runs: most recently used first (0 = never used, sort to end)
  const sortedSavedRuns = [...savedRuns].sort((a, b) => {
    if (a.lastUsed === 0 && b.lastUsed === 0) return 0;
    if (a.lastUsed === 0) return 1;
    if (b.lastUsed === 0) return -1;
    return b.lastUsed - a.lastUsed;
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Terminal sidebar */}
      <div className="w-56 bg-surface-secondary border-r border-border-light flex flex-col shrink-0 p-3.5 overflow-auto">
        {/* Environment picker */}
        <h4 className="text-[11px] font-medium text-text-muted tracking-wider uppercase mb-2.5">
          Environment
        </h4>
        <EnvironmentSwitcher environments={activeProject.environments} />

        {/* Command input */}
        <h4
          className="text-[11px] font-medium text-text-muted tracking-wider uppercase mt-5 mb-2.5"
          id="command-label"
        >
          Command
        </h4>
        <div className="flex items-center gap-1.5 border border-border rounded-lg px-3 py-2 bg-surface mb-2">
          <span className="font-mono text-xs text-text-muted" aria-hidden="true">$</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-xs border-none bg-transparent text-text outline-none w-full"
            placeholder="npm run dev"
            aria-labelledby="command-label"
          />
        </div>

        {/* Save + Launch buttons */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={handleSaveCurrentCommand}
            disabled={!commandInput.trim()}
            title="Save this command"
            className="px-2.5 py-2 border border-border rounded-lg text-xs text-text-secondary hover:bg-surface hover:text-text disabled:opacity-40 transition-colors cursor-pointer"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 2v8M2 6h8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            onClick={() => handleLaunch()}
            disabled={launchDisabled}
            className="flex-1 py-2 bg-brand text-white border-none rounded-lg text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isLaunching ? "Launching..." : "Launch"}
          </button>
        </div>

        {/* Saved runs */}
        {sortedSavedRuns.length > 0 && (
          <>
            <div className="text-[11px] font-medium text-text-muted tracking-wider uppercase mb-2">
              Saved runs
            </div>
            <div className="flex flex-col gap-1">
              {sortedSavedRuns.map((run) => (
                <div
                  key={run.id}
                  className="group flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border-light bg-transparent hover:bg-surface hover:border-border transition-colors"
                >
                  <button
                    onClick={() => handleUseSavedRun(run)}
                    className="flex-1 text-left text-xs text-text-secondary hover:text-text truncate cursor-pointer bg-transparent border-none p-0"
                    title={`${run.label}\n${run.command}`}
                  >
                    <span className="block truncate font-medium text-text">
                      {run.label}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-muted">
                      {run.command}
                    </span>
                  </button>

                  {/* Quick actions */}
                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Run directly */}
                    <button
                      onClick={() => handleLaunch(run.command)}
                      title="Run this command"
                      className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-success hover:bg-success/10 cursor-pointer bg-transparent border-none"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M1 0.5v7l6.5-3.5L1 0.5z" fill="currentColor" />
                      </svg>
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => removeSavedRun(run.id)}
                      title="Remove saved run"
                      className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer bg-transparent border-none"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M1 1l6 6M7 1l-6 6"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Current run info */}
        {activeSession && (
          <div className="mt-auto pt-3 border-t border-border-light">
            <div className="text-[11px] text-text-muted mb-1">Running as</div>
            <div className="text-xs font-medium text-text">
              varlock run -- {activeSession.command}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              with {activeSession.env} env
            </div>
          </div>
        )}
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <TerminalTabs />

        {/* Terminal instances */}
        <div className="flex-1 relative overflow-hidden">
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-[#1a1a18]">
              <div className="text-center">
                <div className="w-10 h-10 rounded-lg bg-[#2a2a28] flex items-center justify-center mx-auto mb-3">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="text-[#97C459]"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 3l4 4-4 4M9 13h4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-sm text-[#666]">
                  Select an environment and command, then click Launch
                </p>
              </div>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`absolute inset-0 ${
                  session.id === activeSessionId ? "block" : "hidden"
                }`}
              >
                <TerminalInstance
                  ref={(handle) => handleTerminalRef(session.id, handle)}
                />
              </div>
            ))
          )}
        </div>

        {/* Validation bar */}
        {activeSession && activeSession.status === "running" && (
          <ValidationBar onStop={handleStop} />
        )}
      </div>

      {/* Production warning modal */}
      {showProdWarning && (
        <ProductionWarningModal
          env={activeEnv}
          command={pendingLaunchCmd ?? commandInput}
          onConfirm={handleConfirmProdLaunch}
          onCancel={handleCancelProdLaunch}
        />
      )}
    </div>
  );
}

// ── Production Warning Modal ──

function ProductionWarningModal({
  env,
  command,
  onConfirm,
  onCancel,
}: {
  env: string;
  command: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prod-warning-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface rounded-xl shadow-[0_28px_80px_rgba(0,0,0,0.45)] border border-border w-full max-w-sm mx-4">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-danger"
              aria-hidden="true"
            >
              <path
                d="M8 5v3m0 2.5h.005M14 8A6 6 0 112 8a6 6 0 0112 0z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2
            id="prod-warning-title"
            className="text-[15px] font-medium text-text"
          >
            Production environment
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-text-secondary leading-6 mb-3">
            You are about to launch a command in the{" "}
            <strong className="text-danger font-medium">{env}</strong>{" "}
            environment. This may affect live systems.
          </p>

          <div className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2 mb-3">
            <p className="text-[11px] text-text-muted mb-1">Command</p>
            <p className="font-mono text-xs text-text">{command}</p>
          </div>

          <p className="text-xs text-text-muted leading-5">
            Make sure you understand the impact before proceeding. Production
            commands run with real credentials and data.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-light flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs text-text border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs text-white bg-danger border border-danger rounded-lg hover:bg-danger-dark transition-colors cursor-pointer"
          >
            Launch in {env}
          </button>
        </div>
      </div>
    </div>
  );
}
