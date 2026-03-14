import { useTerminalStore } from "@/stores/terminalStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";

/**
 * Tab bar for multiple terminal sessions.
 * Shows named tabs (env: command), active env badge, and running status.
 */
export function TerminalTabs() {
  const { sessions, activeSessionId, setActiveSession, removeSession } =
    useTerminalStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex items-center px-3.5 py-2.5 border-b border-border-light gap-3">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Terminal sessions">
        {sessions.map((session) => {
          const badge = ENV_BADGE_STYLES[session.env] ?? DEFAULT_ENV_BADGE;
          const isActive = session.id === activeSessionId;
          // Truncate command for tab display
          const shortCmd =
            session.command.length > 24
              ? session.command.slice(0, 24) + "..."
              : session.command;

          return (
            <div
              key={session.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md transition-colors ${
                isActive
                  ? "bg-brand text-white border-brand"
                  : "bg-transparent text-text-secondary border-border-light hover:bg-surface-secondary"
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
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: isActive ? "currentColor" : badge.text,
                  }}
                />
                <span className="truncate max-w-[140px]">
                  {session.env}: {shortCmd}
                </span>
              </button>
              {/* Close tab button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
                aria-label={`Close ${session.env}: ${session.command}`}
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-sm cursor-pointer border-none bg-transparent ${
                  isActive
                    ? "text-white/60 hover:text-white hover:bg-white/15"
                    : "text-text-muted hover:text-text hover:bg-surface-tertiary"
                }`}
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
          );
        })}
      </div>

      {/* Running status */}
      {activeSession && (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary shrink-0">
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
        </div>
      )}
    </div>
  );
}
