import { useTerminalStore } from "@/stores/terminalStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { ENV_BADGE_STYLES, DEFAULT_ENV_BADGE } from "@/lib/constants";

/**
 * Tab bar for multiple terminal sessions.
 * Shows terminal tabs, active env badge, and running status.
 */
export function TerminalTabs() {
  const { sessions, activeSessionId, setActiveSession } = useTerminalStore();
  const activeEnv = useEnvironmentStore((s) => s.activeEnv);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const badge = ENV_BADGE_STYLES[activeEnv] ?? DEFAULT_ENV_BADGE;

  return (
    <div className="flex items-center px-3.5 py-2.5 border-b border-border-light gap-3">
      {/* Tabs */}
      <div className="flex" role="tablist" aria-label="Terminal sessions">
        {sessions.map((session, index) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            role="tab"
            aria-selected={session.id === activeSessionId}
            className={`px-3.5 py-1.5 text-xs border transition-colors cursor-pointer ${
              session.id === activeSessionId
                ? "bg-brand text-white border-brand"
                : "bg-transparent text-text-secondary border-border-light"
            } ${
              index === 0
                ? "rounded-l-md"
                : index === sessions.length - 1
                  ? "rounded-r-md"
                  : ""
            }`}
          >
            Terminal {index + 1}
          </button>
        ))}
      </div>

      {/* Active env badge */}
      {sessions.length > 0 && (
        <span
          className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: badge.bg, color: badge.text }}
        >
          {activeEnv}
        </span>
      )}

      {/* Running status */}
      {activeSession && (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
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
