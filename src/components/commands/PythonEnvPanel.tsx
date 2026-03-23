import { useEffect, useMemo, useState } from "react";
import type { PythonEnvState, PythonEnvWarmupLog } from "@/lib/types";
import * as commands from "@/lib/commands";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Wrench,
  Terminal,
} from "lucide-react";

interface PythonEnvPanelProps {
  cwd: string;
  rootCwd: string;
  visiblePythonCommandCount: number;
}

function StatusBadge({ status }: { status: PythonEnvWarmupLog["status"] }) {
  if (status === "created") {
    return <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent-light text-accent font-medium uppercase tracking-wider">Created</span>;
  }
  if (status === "reused") {
    return <span className="text-[10px] px-2 py-0.5 rounded-md bg-success-light text-success-dark font-medium uppercase tracking-wider">Reused</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-md bg-danger-light text-danger-dark font-medium uppercase tracking-wider">Failed</span>;
}

function summarizeError(input: unknown): string {
  const message = String(input ?? "Unknown error");
  const missingPython = message.match(/No Python at ['"]([^'"]+)['"]/i);
  if (missingPython) {
    return `The selected environment references a missing base interpreter (${missingPython[1]}). Use Rebuild .venv to recreate it.`;
  }
  return message.length > 220 ? `${message.slice(0, 220)}...` : message;
}

function shortPath(path: string | null | undefined): string {
  if (!path) return "Not available";
  if (path.length <= 70) return path;
  return `...${path.slice(path.length - 67)}`;
}

export function PythonEnvPanel({ cwd, rootCwd, visiblePythonCommandCount }: PythonEnvPanelProps) {
  const [state, setState] = useState<PythonEnvState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [busyAction, setBusyAction] = useState<"warmup" | "rebuild" | null>(null);
  const [savingInterpreter, setSavingInterpreter] = useState(false);
  const [selectedInterpreterPath, setSelectedInterpreterPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lastWarmup, setLastWarmup] = useState<PythonEnvWarmupLog | null>(null);

  const canShow = visiblePythonCommandCount > 0;

  const loadState = async () => {
    setLoadingState(true);
    setError(null);
    try {
      const next = await commands.getPythonEnvState(cwd, rootCwd);
      setState(next);
      setSelectedInterpreterPath(next.preferredBaseInterpreterPath ?? next.selectedEnv?.interpreterPath ?? "");
    } catch (e) {
      setError(summarizeError(e));
    } finally {
      setLoadingState(false);
    }
  };

  const runAction = async (action: "warmup" | "rebuild") => {
    setBusyAction(action);
    setError(null);
    try {
      const log =
        action === "warmup"
          ? await commands.warmupPythonEnv(cwd, rootCwd)
          : await commands.rebuildPythonEnv(cwd, rootCwd);
      setLastWarmup(log);
      await loadState();
    } catch (e) {
      setError(summarizeError(e));
    } finally {
      setBusyAction(null);
    }
  };

  const applyInterpreter = async () => {
    if (!selectedInterpreterPath) {
      setError("Select a Python interpreter first.");
      return;
    }
    setSavingInterpreter(true);
    setError(null);
    try {
      await commands.setPreferredPythonInterpreter(rootCwd, cwd, selectedInterpreterPath);
      const log = await commands.rebuildPythonEnv(cwd, rootCwd);
      setLastWarmup(log);
      await loadState();
    } catch (e) {
      setError(summarizeError(e));
    } finally {
      setSavingInterpreter(false);
    }
  };

  useEffect(() => {
    if (!canShow) return;
    void loadState();
  }, [cwd, rootCwd, canShow]);

  const dependencySummary = useMemo(() => {
    if (!state) return "";
    const deps = [];
    if (state.hasRequirements) deps.push("requirements.txt");
    if (state.hasPyproject) deps.push("pyproject.toml");
    return deps.length > 0 ? deps.join(" + ") : "None detected";
  }, [state]);

  const availableInterpreters = state?.availableInterpreters ?? [];
  const preferredPath = state?.preferredBaseInterpreterPath ?? "";
  const selectedIsChanged = !!selectedInterpreterPath && selectedInterpreterPath !== preferredPath;
  const selectedCandidate = availableInterpreters.find(
    (candidate) => candidate.executablePath === selectedInterpreterPath,
  );

  if (!canShow) return null;

  return (
    <div className="rounded-xl border border-border-light bg-surface overflow-hidden transition-all duration-200 shadow-sm">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-border-light bg-surface-secondary/40">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-surface flex items-center justify-center border border-border-light shadow-sm">
            <Terminal size={13} className="text-text-secondary" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-[12px] font-semibold text-text leading-none">Python Runtime</h3>
            <span className="text-[10px] text-text-muted">Version + env setup</span>
          </div>
        </div>
        <button
          onClick={loadState}
          disabled={loadingState || !!busyAction}
          className="h-7 px-2.5 rounded-md border border-border-light bg-surface text-[11px] font-medium text-text-secondary hover:text-text hover:bg-surface-secondary disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors shadow-sm"
        >
          {loadingState ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          Reload
        </button>
      </div>

      <div className="p-3">
        {error && (
          <div className="mb-2 rounded-md border border-danger/20 bg-danger-light/50 px-2.5 py-2 text-[11px] text-danger-dark flex items-start gap-2 animate-fade-in">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {!state && loadingState && (
          <div className="rounded-md border border-border-light bg-surface-secondary/30 px-3 py-3 text-[11px] text-text-secondary flex items-center gap-2 animate-fade-in">
            <Loader2 size={14} className="animate-spin text-text-muted" />
            Loading Python runtime...
          </div>
        )}

        {!state && !loadingState && (
          <div className="rounded-md border border-border-light border-dashed bg-surface-secondary/30 px-3 py-3 text-center animate-fade-in">
            <p className="text-[11px] text-text-secondary font-medium">Could not load Python runtime</p>
            <button
              onClick={loadState}
              disabled={loadingState || !!busyAction}
              className="mt-2 h-7 px-3 rounded-md bg-surface text-[11px] font-medium text-text border border-border-light hover:bg-surface-secondary shadow-sm disabled:opacity-50 cursor-pointer inline-flex items-center gap-2 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {state && (
          <div className="animate-fade-in space-y-2">
            {availableInterpreters.length === 0 ? (
              <div className="rounded-md border border-danger/20 bg-danger-light/30 px-2.5 py-2 text-[11px] text-danger-dark flex items-center gap-2">
                <AlertTriangle size={14} />
                No Python interpreter found on PATH.
              </div>
            ) : (
              <div className="rounded-md border border-border-light bg-surface-secondary/20 p-2.5">
                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                  <select
                    value={selectedInterpreterPath}
                    onChange={(e) => setSelectedInterpreterPath(e.target.value)}
                    disabled={savingInterpreter || !!busyAction}
                    className="flex-1 h-8 px-2 rounded-md border border-border-light bg-surface text-[12px] text-text"
                  >
                    <option value="">Select Python version</option>
                    {availableInterpreters.map((candidate) => (
                      <option key={candidate.executablePath} value={candidate.executablePath}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={applyInterpreter}
                    disabled={savingInterpreter || !!busyAction || !selectedInterpreterPath || !selectedIsChanged}
                    className="h-8 px-3 rounded-md bg-accent text-white text-[11px] font-medium disabled:opacity-50 cursor-pointer border-none"
                  >
                    {savingInterpreter ? "Switching..." : "Switch Python"}
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-text-muted font-mono truncate">
                  {shortPath(selectedCandidate?.executablePath ?? preferredPath)}
                </div>
              </div>
            )}

            <div className="rounded-md border border-border-light bg-surface-secondary/20 p-2.5">
              <div className="text-[11px] text-text-secondary">
                Env: <span className="font-medium text-text">{state.selectedEnv?.name ?? "none"}</span>
                <span className="mx-2 text-text-muted">|</span>
                Deps: <span className="font-medium text-text">{dependencySummary}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => runAction("warmup")}
                disabled={!!busyAction}
                className="h-8 px-3 rounded-md bg-text text-surface text-[11px] font-medium hover:bg-text/90 disabled:opacity-50 border-none cursor-pointer flex items-center gap-2 shadow-sm transition-all"
              >
                {busyAction === "warmup" ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                Setup Env
              </button>
              <button
                onClick={() => runAction("rebuild")}
                disabled={!!busyAction}
                className="h-8 px-3 rounded-md border border-border-light bg-surface text-[11px] font-medium text-text hover:bg-surface-secondary disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-sm transition-all"
              >
                {busyAction === "rebuild" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                Rebuild Env
              </button>
            </div>
          </div>
        )}

        {lastWarmup && (
          <details className="mt-2 rounded-md border border-border-light overflow-hidden bg-surface-secondary/10 animate-fade-in shadow-sm">
            <summary className="list-none cursor-pointer flex items-center justify-between px-3 py-2 bg-surface-secondary/40">
              <div className="flex items-center gap-2.5 truncate">
                <StatusBadge status={lastWarmup.status} />
                <span className="text-[11px] text-text-muted truncate">Last setup details</span>
              </div>
              {lastWarmup.status === "failed" ? (
                <AlertTriangle size={14} className="text-danger shrink-0" />
              ) : (
                <CheckCircle2 size={14} className="text-success shrink-0" />
              )}
            </summary>
            <div className="max-h-40 overflow-auto bg-[#0A0A0B] p-2.5">
              <pre className="text-[10px] leading-[1.5] text-[#E0E0E0] font-mono whitespace-pre-wrap">
                {lastWarmup.outputLines.length > 0
                  ? lastWarmup.outputLines.join("\n")
                  : "No output generated"}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
