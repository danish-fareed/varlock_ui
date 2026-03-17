import { useRef, useCallback, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useTerminalStore, isDangerousEnv } from "@/stores/terminalStore";
import { TerminalInstance, type TerminalInstanceHandle } from "./TerminalInstance";
import { TerminalTabs } from "./TerminalTabs";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";
import { ChevronDown, Square, Play, Terminal, CircleAlert } from "lucide-react";

/**
 * Redesigned terminal panel — full-width terminal with top toolbar.
 * Direct command input in the toolbar bar, environment switcher dropdown,
 * and tab bar for multiple sessions. No saved runs sidebar.
 */
export function TerminalPanel() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const { activeEnv, setActiveEnv } = useEnvironmentStore();
  const {
    sessions,
    activeSessionId,
    launchProcess,
    killProcess,
  } = useTerminalStore();

  const terminalRefs = useRef<Map<string, TerminalInstanceHandle>>(new Map());
  const pendingOutput = useRef<Map<string, string[]>>(new Map());
  const [isLaunching, setIsLaunching] = useState(false);
  const [showProdWarning, setShowProdWarning] = useState(false);
  const [pendingLaunchCmd, setPendingLaunchCmd] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("npm run dev");
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const writeToTerminal = useCallback((sessionId: string, data: string) => {
    const termHandle = terminalRefs.current.get(sessionId);
    if (termHandle) {
      termHandle.write(data);
    } else {
      const buffer = pendingOutput.current.get(sessionId) ?? [];
      buffer.push(data);
      pendingOutput.current.set(sessionId, buffer);
    }
  }, []);

  const handleTerminalRef = useCallback(
    (sessionId: string, handle: TerminalInstanceHandle | null) => {
      if (handle) {
        terminalRefs.current.set(sessionId, handle);
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
    async () => {
      if (!commandInput.trim()) return;

      if (isDangerousEnv(activeEnv)) {
        setPendingLaunchCmd(commandInput);
        setShowProdWarning(true);
        return;
      }

      await doLaunch(commandInput);
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

  if (!activeProject) return null;

  const launchDisabled = !commandInput.trim() || isLaunching;
  const envBadge = ENV_BADGE_STYLES[activeEnv] ?? DEFAULT_ENV_BADGE;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Command toolbar ── */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-surface border-b border-border-light shrink-0">
        {/* Environment switcher */}
        <div className="relative">
          <button
            onClick={() => setShowEnvDropdown(!showEnvDropdown)}
            className="h-8 px-2.5 rounded-lg border border-border bg-surface-secondary text-[12px] font-medium flex items-center gap-2 hover:border-accent/50 transition-colors cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${envBadge.split(' ')[1]}`}
            />
            <span className="text-text">{activeEnv}</span>
            <ChevronDown size={12} strokeWidth={1.5} className="text-text-muted ml-0.5" />
          </button>

          {/* Dropdown */}
          {showEnvDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowEnvDropdown(false)}
              />
              <div className="absolute top-full left-0 mt-1 w-48 bg-surface border border-border-light rounded-xl shadow-lg py-1 z-50 animate-scale-in">
                {activeProject.environments.map((env) => {
                  const badge = ENV_BADGE_STYLES[env] ?? DEFAULT_ENV_BADGE;
                  const isActive = activeEnv === env;
                  return (
                    <button
                      key={env}
                        onClick={() => {
                          setActiveEnv(env);
                          setShowEnvDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left cursor-pointer border-none transition-colors ${
                          isActive
                            ? "bg-accent text-white"
                            : "bg-transparent text-text hover:bg-surface-secondary"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isActive ? "bg-white" : badge.split(' ')[1]
                          }`}
                        />
                        <span className="font-medium">.env.{env}</span>
                      </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Command input */}
        <div className="flex-1 flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 bg-surface-secondary focus-within:border-accent transition-colors">
          <span className="font-mono text-xs text-text-muted" aria-hidden="true">$</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-xs border-none bg-transparent text-text outline-none w-full"
            placeholder="Enter command to run..."
          />
        </div>

        {/* Launch / Stop button */}
        {activeSession?.status === "running" ? (
          <button
            onClick={handleStop}
            className="h-8 px-4 bg-danger text-white border-none rounded-lg text-[12px] font-medium hover:bg-danger-dark transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Square size={10} fill="currentColor" strokeWidth={0} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={launchDisabled}
            className="h-8 px-4 bg-accent text-white border-none rounded-lg text-[12px] font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            {isLaunching ? (
              <>
                <span className="w-3 h-3 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" />
                Launching
              </>
            ) : (
              <>
                <Play size={10} fill="currentColor" strokeWidth={0} />
                Run
              </>
            )}
          </button>
        )}
      </div>

      {/* Tab bar */}
      {sessions.length > 0 && <TerminalTabs />}

      {/* Terminal instances */}
      <div className="flex-1 relative overflow-hidden">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full bg-[#1C1C1E]">
            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-[#2C2C2E] flex items-center justify-center mx-auto mb-3">
                <Terminal size={16} strokeWidth={1.5} className="text-[#34C759]" aria-hidden="true" />
              </div>
              <p className="text-sm text-[#98989D] mb-1">
                Enter a command above and click Run
              </p>
              <p className="text-xs text-[#636366]">
                Your command runs with <span className="text-[#0A84FF]">{activeEnv}</span> environment variables injected by Varlock
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prod-warning-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface rounded-2xl shadow-lg border border-border-light w-full max-w-sm mx-4 animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-danger-light flex items-center justify-center shrink-0">
            <CircleAlert size={16} strokeWidth={1.5} className="text-danger" aria-hidden="true" />
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
            className="px-4 py-2 text-xs text-white bg-danger rounded-lg hover:bg-danger-dark transition-colors cursor-pointer shadow-sm"
          >
            Launch in {env}
          </button>
        </div>
      </div>
    </div>
  );
}
