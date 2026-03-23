import { create } from "zustand";
import type {
  DiscoveredCommand,
  ProjectScan,
  RunningCommandInfo,
  CommandType,
  ProcessEvent,
} from "@/lib/types";
import { formatLaunchError } from "@/lib/types";
import * as commands from "@/lib/commands";

const MAX_LOG_LINES_PER_COMMAND = 300;

function appendCappedLogs(prev: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return prev;
  const merged = [...prev, ...incoming];
  if (merged.length <= MAX_LOG_LINES_PER_COMMAND) return merged;
  return merged.slice(merged.length - MAX_LOG_LINES_PER_COMMAND);
}

interface CommandState {
  scan: ProjectScan | null;
  scanError: string | null;
  isScanning: boolean;
  selectedNodeId: string | null;
  selectedScopePath: string;
  running: Record<string, RunningCommandInfo>;
  commandErrors: Record<string, string[]>;
  logBuffers: Record<string, string[]>;

  scanProject: (cwd: string) => Promise<void>;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSelectedScopePath: (scopePath: string) => void;
  getVisibleCommands: () => DiscoveredCommand[];
  launchCommand: (
    command: DiscoveredCommand,
    envName: string,
  ) => Promise<void>;
  stopCommand: (commandId: string) => void;
  clearError: (commandId: string) => void;
  reset: () => void;
}

function statusFromType(type: CommandType): RunningCommandInfo["status"] {
  if (type === "cloud-job") {
    return "running";
  }
  return "running";
}

export const useCommandStore = create<CommandState>((set, get) => ({
  scan: null,
  scanError: null,
  isScanning: false,
  selectedNodeId: null,
  selectedScopePath: "all",
  running: {},
  commandErrors: {},
  logBuffers: {},

  scanProject: async (cwd: string) => {
    set({ isScanning: true, scanError: null });
    try {
      const scan = await commands.scanProject(cwd);
      const selectedNodeId = get().selectedNodeId ?? scan.rootNodeId;
      const nodeExists = scan.nodes.some((n) => n.id === selectedNodeId);
      set({
        scan,
        isScanning: false,
        scanError: null,
        selectedNodeId: nodeExists ? selectedNodeId : scan.rootNodeId,
      });
    } catch (e) {
      console.error("Failed to scan project:", e);
      set({ isScanning: false, scanError: String(e) });
    }
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

  setSelectedScopePath: (scopePath) => set({ selectedScopePath: scopePath }),

  getVisibleCommands: () => [],

  launchCommand: async (command, envName) => {
    const commandId = command.id;
    let pendingLines: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPending = () => {
      if (pendingLines.length === 0) return;
      const lines = pendingLines;
      pendingLines = [];
      set((state) => {
        const prev = state.logBuffers[commandId] ?? [];
        const next = appendCappedLogs(prev, lines);
        const runningEntry = state.running[commandId];
        return {
          logBuffers: {
            ...state.logBuffers,
            [commandId]: next,
          },
          running: runningEntry
            ? {
                ...state.running,
                [commandId]: {
                  ...runningEntry,
                  logPeek: next.slice(-5),
                },
              }
            : state.running,
        };
      });
    };

    const queueLines = (lines: string[]) => {
      if (lines.length === 0) return;
      pendingLines.push(...lines);
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPending();
      }, 80);
    };

    const finalizeFlush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushPending();
    };

    set((state) => {
      const errors = { ...state.commandErrors };
      delete errors[commandId];
      return { commandErrors: errors };
    });

    try {
      const rootNodeId = get().scan?.rootNodeId;
      const cwd = get().scan?.nodes.find((n) => n.id === rootNodeId)?.path;
      if (!cwd) {
        throw new Error("Unable to resolve command working directory (project root missing)");
      }

      const commandLine = [command.command, ...command.args].join(" ");
      const launchOptions: commands.LaunchOptions = {
        cwdOverride: command.cwdOverride,
        interpreterOverride: command.interpreterOverride ?? undefined,
        commandType: command.commandType,
        envScopePath: command.envScope?.scopePath,
        requiresVenv: command.requiresVenv,
        source: command.source,
      };

      const processId = await commands.varlockRun(
        cwd,
        commandLine,
        (event: ProcessEvent) => {
          switch (event.event) {
            case "launchTimeline": {
              if (event.data.status === "ok") {
                break;
              }
              const runtime = event.data.runtime ? ` (${event.data.runtime})` : "";
              queueLines([
                `[launch:${event.data.status}] ${event.data.detail}${runtime}`,
              ]);
              break;
            }
            case "runDetails": {
              // Keep run details for UI details panel only; avoid spamming command logs.
              break;
            }
            case "launchLog": {
              const statusText = event.data.envStatus
                ? `[python-env:${event.data.envStatus}]`
                : "[launch]";
              const lines = [
                `${statusText}${event.data.interpreterPath ? ` ${event.data.interpreterPath}` : ""}`,
                ...event.data.lines,
              ].filter(Boolean);
              queueLines(lines);
              break;
            }
            case "stdout":
            case "stderr": {
              const chunk = event.data.data.replace(/\r?\n$/, "");
              if (!chunk.trim()) break;
              queueLines([chunk]);
              break;
            }
            case "exit": {
              finalizeFlush();
              set((state) => {
                const runningEntry = state.running[commandId];
                if (!runningEntry) return state;
                return {
                  running: {
                    ...state.running,
                    [commandId]: {
                      ...runningEntry,
                      status: event.data.code === 0 ? "stopped" : "error",
                      exitCode: event.data.code,
                    },
                  },
                };
              });
              break;
            }
            case "error": {
              finalizeFlush();
              set((state) => {
                const prevLogs = state.logBuffers[commandId] ?? [];
                const nextLogs = appendCappedLogs(prevLogs, [`ERROR: ${event.data.message}`]);
                const runningEntry = state.running[commandId];
                return {
                  commandErrors: {
                    ...state.commandErrors,
                    [commandId]: [event.data.message],
                  },
                  logBuffers: {
                    ...state.logBuffers,
                    [commandId]: nextLogs,
                  },
                  running: runningEntry
                    ? {
                        ...state.running,
                        [commandId]: {
                          ...runningEntry,
                          status: "error",
                          logPeek: nextLogs.slice(-5),
                        },
                      }
                    : state.running,
                };
              });
              break;
            }
          }
        },
        envName,
        launchOptions,
      );

      finalizeFlush();

      set((state) => ({
        running: {
          ...state.running,
          [commandId]: {
            commandId,
            sessionId: processId,
            status: statusFromType(command.commandType),
            startedAt: Date.now(),
            envName,
            logPeek: (state.logBuffers[commandId] ?? []).slice(-5),
          },
        },
      }));
    } catch (e) {
      finalizeFlush();
      const launchMessage = formatLaunchError(e);
      set((state) => ({
        commandErrors: {
          ...state.commandErrors,
          [commandId]: [launchMessage],
        },
        logBuffers: {
          ...state.logBuffers,
          [commandId]: appendCappedLogs(
            state.logBuffers[commandId] ?? [],
            [`Failed to launch: ${launchMessage}`],
          ),
        },
      }));
    }
  },

  stopCommand: (commandId: string) => {
    const running = get().running[commandId];
    if (running?.sessionId) {
      commands.processKill(running.sessionId).catch((e) => {
        console.error("Failed to stop command process:", e);
      });
    }
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
      scanError: null,
      isScanning: false,
      selectedNodeId: null,
      selectedScopePath: "all",
      running: {},
      commandErrors: {},
      logBuffers: {},
    });
  },
}));
