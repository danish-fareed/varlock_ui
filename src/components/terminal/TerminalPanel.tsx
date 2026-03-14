import { useRef, useCallback, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { TerminalInstance, type TerminalInstanceHandle } from "./TerminalInstance";
import { TerminalTabs } from "./TerminalTabs";
import { ValidationBar } from "./ValidationBar";
import { EnvironmentSwitcher } from "@/components/environment/EnvironmentSwitcher";

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
    savedCommands,
    setCommandInput,
    launchProcess,
    killProcess,
  } = useTerminalStore();

  const terminalRefs = useRef<Map<string, TerminalInstanceHandle>>(new Map());
  // Buffer output received before the terminal instance is mounted
  const pendingOutput = useRef<Map<string, string[]>>(new Map());
  const [isLaunching, setIsLaunching] = useState(false);

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

  const handleLaunch = useCallback(async () => {
    if (!activeProject || !commandInput.trim() || isLaunching) return;

    setIsLaunching(true);
    try {
      const sessionId = await launchProcess(
        activeProject.path,
        activeEnv,
        commandInput,
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
        `\x1b[90m$\x1b[0m varlock run -- ${commandInput}\r\n`,
      );
    } finally {
      setIsLaunching(false);
    }
  }, [activeProject, activeEnv, commandInput, launchProcess, isLaunching, writeToTerminal]);

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

        {/* Saved runs */}
        {savedCommands.length > 0 && (
          <>
            <div className="text-[10px] text-text-muted mb-2">Saved runs</div>
            <div className="flex flex-col gap-1">
              {savedCommands.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setCommandInput(cmd)}
                  className="px-2.5 py-1.5 rounded-md text-left text-xs text-text-secondary border border-border-light bg-transparent hover:bg-surface hover:text-text transition-colors cursor-pointer truncate"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Launch button */}
        <button
          onClick={handleLaunch}
          disabled={launchDisabled}
          className="w-full py-2 bg-brand text-white border-none rounded-lg text-[13px] font-medium mt-3 hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isLaunching ? "Launching..." : "Launch terminal"}
        </button>

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
    </div>
  );
}
