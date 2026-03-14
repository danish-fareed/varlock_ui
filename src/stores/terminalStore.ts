import { create } from "zustand";
import type { TerminalSession, ProcessEvent } from "@/lib/types";
import * as commands from "@/lib/commands";

interface TerminalState {
  /** All terminal sessions */
  sessions: TerminalSession[];
  /** Currently active terminal tab */
  activeSessionId: string | null;
  /** Command input value */
  commandInput: string;
  /** Saved run configurations */
  savedCommands: string[];

  // Actions
  createSession: (env: string, command: string) => TerminalSession;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  setCommandInput: (input: string) => void;
  addSavedCommand: (command: string) => void;
  removeSavedCommand: (command: string) => void;

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
  commandInput: "npm run dev",
  savedCommands: ["npm run dev", "npm test", "npm run build"],

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
  setCommandInput: (input) => set({ commandInput: input }),

  addSavedCommand: (command) => {
    set((state) => {
      if (state.savedCommands.includes(command)) return state;
      return { savedCommands: [...state.savedCommands, command] };
    });
  },

  removeSavedCommand: (command) => {
    set((state) => ({
      savedCommands: state.savedCommands.filter((c) => c !== command),
    }));
  },

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
      onOutput(
        session.id,
        `\r\n\x1b[31mFailed to launch: ${String(e)}\x1b[0m\r\n`,
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
