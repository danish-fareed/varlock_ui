import { create } from "zustand";
import type { TerminalSession, ProcessEvent, SavedRunConfig } from "@/lib/types";
import * as commands from "@/lib/commands";

// ── Persistence helpers ──

const SAVED_RUNS_KEY = "varlock_saved_runs";

function loadSavedRuns(): SavedRunConfig[] {
  try {
    const raw = localStorage.getItem(SAVED_RUNS_KEY);
    return raw ? JSON.parse(raw) : getDefaultSavedRuns();
  } catch {
    return getDefaultSavedRuns();
  }
}

function persistSavedRuns(runs: SavedRunConfig[]) {
  try {
    localStorage.setItem(SAVED_RUNS_KEY, JSON.stringify(runs));
  } catch {
    // storage may be unavailable
  }
}

function getDefaultSavedRuns(): SavedRunConfig[] {
  return [
    {
      id: "default-dev",
      label: "Dev server",
      command: "npm run dev",
      env: null,
      lastUsed: 0,
    },
    {
      id: "default-test",
      label: "Tests",
      command: "npm test",
      env: null,
      lastUsed: 0,
    },
    {
      id: "default-build",
      label: "Build",
      command: "npm run build",
      env: null,
      lastUsed: 0,
    },
  ];
}

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
  /** Command input value */
  commandInput: string;
  /** Saved run configurations (persisted) */
  savedRuns: SavedRunConfig[];

  // Actions
  createSession: (env: string, command: string) => TerminalSession;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  setCommandInput: (input: string) => void;

  // Saved runs management
  addSavedRun: (label: string, command: string, env: string | null) => void;
  updateSavedRun: (id: string, updates: Partial<Pick<SavedRunConfig, "label" | "command" | "env">>) => void;
  removeSavedRun: (id: string) => void;
  touchSavedRun: (id: string) => void;

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
let savedRunCounter = 0;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  commandInput: "npm run dev",
  savedRuns: loadSavedRuns(),

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

  // ── Saved runs CRUD ──

  addSavedRun: (label, command, env) => {
    savedRunCounter++;
    const newRun: SavedRunConfig = {
      id: `saved-${Date.now()}-${savedRunCounter}`,
      label,
      command,
      env,
      lastUsed: 0,
    };
    set((state) => {
      const savedRuns = [...state.savedRuns, newRun];
      persistSavedRuns(savedRuns);
      return { savedRuns };
    });
  },

  updateSavedRun: (id, updates) => {
    set((state) => {
      const savedRuns = state.savedRuns.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      );
      persistSavedRuns(savedRuns);
      return { savedRuns };
    });
  },

  removeSavedRun: (id) => {
    set((state) => {
      const savedRuns = state.savedRuns.filter((r) => r.id !== id);
      persistSavedRuns(savedRuns);
      return { savedRuns };
    });
  },

  touchSavedRun: (id) => {
    set((state) => {
      const savedRuns = state.savedRuns.map((r) =>
        r.id === id ? { ...r, lastUsed: Date.now() } : r,
      );
      persistSavedRuns(savedRuns);
      return { savedRuns };
    });
  },

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
