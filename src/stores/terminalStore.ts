import { create } from "zustand";
import type { TerminalSession, ProcessEvent, LaunchError } from "@/lib/types";
import { formatLaunchError } from "@/lib/types";
import * as commands from "@/lib/commands";
import { useVaultStore } from "@/stores/vaultStore";

// ── Dangerous environments that trigger a warning ──

const DANGEROUS_ENVS = new Set(["production", "prod", "staging"]);

export function isDangerousEnv(env: string): boolean {
  return DANGEROUS_ENVS.has(env.toLowerCase());
}

// ── Store ──

interface TerminalState {
  /** All terminal sessions */
  sessions: TerminalSession[];
  /** Currently active terminal tab */
  activeSessionId: string | null;

  // Actions
  createSession: (env: string, command: string) => TerminalSession;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;

  launchProcess: (
    cwd: string,
    env: string,
    command: string,
    onOutput: (sessionId: string, data: string) => void,
    onExit: (sessionId: string, code: number | null) => void,
  ) => Promise<string>;

  killProcess: (sessionId: string) => Promise<void>;
  updateSessionStatus: (
    id: string,
    status: TerminalSession["status"],
    exitCode?: number | null,
  ) => void;
}

let sessionCounter = 0;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  createSession: (env, command) => {
    sessionCounter++;
    const session: TerminalSession = {
      id: `terminal-${sessionCounter}`,
      processId: null,
      command,
      env,
      status: "idle",
      exitCode: null,
    };
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    }));
    return session;
  },

  removeSession: (id) => {
    // Kill the associated process if it's still running
    const session = get().sessions.find((s) => s.id === id);
    if (session?.processId && session.status === "running") {
      commands.processKill(session.processId).catch((e) => {
        console.error("Failed to kill process on session remove:", e);
      });
    }

    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === id
            ? sessions[sessions.length - 1]?.id ?? null
            : state.activeSessionId,
      };
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  // ── Process lifecycle ──

  launchProcess: async (cwd, env, command, onOutput, onExit) => {
    const session = get().createSession(env, command);

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === session.id ? { ...s, status: "running" as const } : s,
      ),
    }));

    try {
      const processId = await commands.varlockRun(
        cwd,
        command,
        (event: ProcessEvent) => {
          switch (event.event) {
            case "launchTimeline": {
              if (event.data.status === "ok") {
                break;
              }
              const runtimeLabel = event.data.runtime ? ` (${event.data.runtime})` : "";
              onOutput(
                session.id,
                `[launch:${event.data.status}] ${event.data.detail}${runtimeLabel}\r\n`,
              );
              break;
            }
            case "runDetails": {
              // Keep run details out of terminal stream; this is for a dedicated details panel.
              break;
            }
            case "launchLog": {
              const header = event.data.envStatus
                ? `[python-env:${event.data.envStatus}]`
                : "[launch]";
              onOutput(
                session.id,
                `${header}${event.data.interpreterPath ? ` ${event.data.interpreterPath}` : ""}\r\n`,
              );
              for (const line of event.data.lines) {
                onOutput(session.id, `${line}\r\n`);
              }
              break;
            }
            case "stdout":
              onOutput(session.id, event.data.data);
              break;
            case "stderr":
              onOutput(session.id, event.data.data);
              break;
            case "exit":
              onExit(session.id, event.data.code);
              get().updateSessionStatus(
                session.id,
                event.data.code === 0 ? "stopped" : "error",
                event.data.code,
              );
              break;
            case "error":
              onOutput(
                session.id,
                `\r\n\x1b[31mError: ${event.data.message}\x1b[0m\r\n`,
              );
              get().updateSessionStatus(session.id, "error");
              break;
          }
        },
        env,
      );

      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === session.id ? { ...s, processId } : s,
        ),
      }));

      return session.id;
    } catch (e) {
      const typed = e as LaunchError;
      if (typed?.type === "vaultLocked") {
        try {
          await useVaultStore.getState().checkStatus();
        } catch {
          // ignore status refresh errors
        }
      }

      const launchMessage = formatLaunchError(e);

      onOutput(
        session.id,
        `\r\n\x1b[31mFailed to launch: ${launchMessage}\x1b[0m\r\n`,
      );
      get().updateSessionStatus(session.id, "error");
      return session.id;
    }
  },

  killProcess: async (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session?.processId) {
      try {
        await commands.processKill(session.processId);
        get().updateSessionStatus(sessionId, "stopped");
      } catch (e) {
        console.error("Failed to kill process:", e);
      }
    }
  },

  updateSessionStatus: (id, status, exitCode = null) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, status, exitCode } : s,
      ),
    }));
  },
}));
