import { useTerminalStore } from "@/stores/terminalStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";
import { X } from "lucide-react";

/**
 * Tab bar for multiple terminal sessions.
 * Compact macOS-style tab strip with env badge dot, active highlight, and status indicator.
 */
export function TerminalTabs() {
  const { sessions, activeSessionId, setActiveSession, removeSession } =
    useTerminalStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex items-center px-3.5 py-1.5 border-b border-border-light gap-2 bg-surface shrink-0">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Terminal sessions">
        {sessions.map((session) => {
          const badge = ENV_BADGE_STYLES[session.env] ?? DEFAULT_ENV_BADGE;
          const isActive = session.id === activeSessionId;
          const shortCmd =
            session.command.length > 20
              ? session.command.slice(0, 20) + "..."
              : session.command;

          return (
            <div
              key={session.id}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                isActive
                  ? "bg-surface-tertiary text-text"
                  : "bg-transparent text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              <button
                onClick={() => setActiveSession(session.id)}
                role="tab"
                aria-selected={isActive}
                className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none p-0 text-inherit"
              >
                {/* Env badge dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full ${badge.split(' ')[1]}`} // Extract text-* class for dot color
                />
                <span className="truncate max-w-[120px] font-medium">
                  {shortCmd}
                </span>
              </button>
              {/* Close tab button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
                aria-label={`Close ${session.env}: ${session.command}`}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded cursor-pointer border-none bg-transparent text-text-muted hover:text-text hover:bg-surface-tertiary"
              >
                <X size={10} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Running status */}
      {activeSession && (
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
          <div
            aria-label={`Session status: ${activeSession.status}`}
            className={`w-1.5 h-1.5 rounded-full ${
              activeSession.status === "running"
                ? "bg-success"
                : activeSession.status === "error"
                  ? "bg-danger"
                  : "bg-text-muted"
            }`}
          />
          {activeSession.status}
          {activeSession.exitCode !== null && (
            <span className="text-text-muted ml-0.5">
              (code {activeSession.exitCode})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
