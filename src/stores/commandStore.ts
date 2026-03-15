import { create } from "zustand";
import type {
  DiscoveredCommand,
  ProjectScan,
  RunningCommandInfo,
} from "@/lib/types";
import * as commands from "@/lib/commands";

// ── Store ──

interface CommandState {
  /** Scan result for the active project */
  scan: ProjectScan | null;
  /** Loading state */
  isScanning: boolean;
  /** Commands launched in OS terminal (keyed by command.id) */
  running: Record<string, RunningCommandInfo>;
  /** Pre-flight validation errors keyed by command.id */
  commandErrors: Record<string, string[]>;
  /** Log buffer — kept empty since OS terminal handles output */
  logBuffers: Record<string, string[]>;

  // Actions
  scanProject: (cwd: string) => Promise<void>;
  launchCommand: (
    cwd: string,
    command: DiscoveredCommand,
    envName: string,
  ) => Promise<void>;
  stopCommand: (commandId: string) => void;
  clearError: (commandId: string) => void;
  reset: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  scan: null,
  isScanning: false,
  running: {},
  commandErrors: {},
  logBuffers: {},

  scanProject: async (cwd: string) => {
    set({ isScanning: true });
    try {
      const scan = await commands.scanProject(cwd);
      set({ scan, isScanning: false });
    } catch (e) {
      console.error("Failed to scan project:", e);
      set({ isScanning: false });
    }
  },

  launchCommand: async (
    cwd: string,
    command: DiscoveredCommand,
    envName: string,
  ) => {
    const commandId = command.id;

    // Clear previous errors
    set((state) => {
      const errors = { ...state.commandErrors };
      delete errors[commandId];
      return { commandErrors: errors };
    });

    try {
      // Run in OS terminal — always interactive, user sees real terminal
      await commands.runInTerminal(cwd, command.rawCmd);

      // Track as launched
      set((state) => ({
        running: {
          ...state.running,
          [commandId]: {
            commandId,
            sessionId: "",
            status: "running",
            startedAt: Date.now(),
            envName,
            logPeek: [],
          },
        },
      }));
    } catch (e) {
      set((state) => ({
        commandErrors: {
          ...state.commandErrors,
          [commandId]: [String(e)],
        },
      }));
    }
  },

  stopCommand: (commandId: string) => {
    // Remove from running — the OS terminal is user-managed
    set((state) => {
      const r = { ...state.running };
      delete r[commandId];
      return { running: r };
    });
  },

  clearError: (commandId: string) => {
    set((state) => {
      const errors = { ...state.commandErrors };
      delete errors[commandId];
      const running = { ...state.running };
      delete running[commandId];
      return { commandErrors: errors, running };
    });
  },

  reset: () => {
    set({
      scan: null,
      isScanning: false,
      running: {},
      commandErrors: {},
      logBuffers: {},
    });
  },
}));
