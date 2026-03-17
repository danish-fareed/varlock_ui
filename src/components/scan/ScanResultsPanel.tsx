import { useScanStore } from "@/stores/scanStore";
import type { VarlockLeak } from "@/lib/types";
import { CircleAlert, ShieldCheck, FileText } from "lucide-react";

/**
 * ScanResultsPanel — displays results from `varlock scan`.
 * macOS-style result cards grouped by file.
 */
export function ScanResultsPanel() {
  const { state, result, error, dismissResults } = useScanStore();

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-4 bg-surface animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-text">Security Scan</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Check for leaked secrets in project files
          </p>
        </div>
        <button
          onClick={dismissResults}
          className="px-3 py-1.5 text-xs text-text border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer"
        >
          Back to dashboard
        </button>
      </div>

      {/* Scanning state */}
      {state === "scanning" && <ScanningState />}

      {/* Error state */}
      {state === "error" && <ErrorState error={error} />}

      {/* Results */}
      {state === "done" && result && (
        <>
          {result.clean ? (
            <CleanState />
          ) : (
            <FindingsView leaks={result.leaks} totalCount={result.leakCount} />
          )}
        </>
      )}
    </div>
  );
}

// ── States ──

function ScanningState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      <p className="text-sm text-text-secondary">Running security scan...</p>
      <p className="text-xs text-text-muted">
        Checking project files for leaked secrets
      </p>
    </div>
  );
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-danger-light border border-danger/20 flex items-center justify-center shadow-sm">
        <CircleAlert size={24} strokeWidth={1.5} className="text-danger" aria-hidden="true" />
      </div>
      <div className="text-center max-w-sm">
        <h3 className="text-sm font-medium text-text mb-1">Scan failed</h3>
        <p className="text-xs text-text-secondary leading-5">{error}</p>
      </div>
    </div>
  );
}

function CleanState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-success-light border border-success/20 flex items-center justify-center shadow-sm">
        <ShieldCheck size={24} strokeWidth={1.5} className="text-success" aria-hidden="true" />
      </div>
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-medium text-text mb-1">No leaks found</h3>
        <p className="text-sm text-text-secondary leading-6">
          Your project files are clean. No sensitive values were detected in
          tracked files.
        </p>
      </div>
    </div>
  );
}

// ── Findings view ──

function FindingsView({
  leaks,
  totalCount,
}: {
  leaks: VarlockLeak[];
  totalCount: number;
}) {
  const grouped = groupLeaksByFile(leaks);
  const fileNames = Object.keys(grouped).sort();

  return (
    <>
      {/* Summary banner */}
      <div className="rounded-xl border border-danger/20 bg-danger-light p-4 flex items-center gap-3 animate-fade-in">
        <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center shrink-0">
          <CircleAlert size={16} strokeWidth={1.5} className="text-danger" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-danger-dark">
            {totalCount} secret{totalCount !== 1 ? "s" : ""} leaked
          </p>
          <p className="text-xs text-danger-dark/70 mt-0.5">
            Found in {fileNames.length} file{fileNames.length !== 1 ? "s" : ""}.
            Remove sensitive values from tracked files and use the schema +
            environment system instead.
          </p>
        </div>
      </div>

      {/* Grouped by file */}
      <div className="flex flex-col gap-3">
        {fileNames.map((file) => (
          <FileGroup key={file} file={file} leaks={grouped[file]!} />
        ))}
      </div>
    </>
  );
}

function FileGroup({ file, leaks }: { file: string; leaks: VarlockLeak[] }) {
  return (
    <div className="rounded-xl border border-border-light overflow-hidden shadow-sm animate-fade-in">
      {/* File header */}
      <div className="px-4 py-2.5 bg-surface-secondary border-b border-border-light flex items-center gap-2">
        <FileText size={14} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden="true" />
        <span className="font-mono text-xs font-medium text-text">{file}</span>
        <span className="text-[11px] text-text-muted ml-auto">
          {leaks.length} finding{leaks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Leak rows */}
      <div>
        {leaks.map((leak, i) => (
          <LeakRow key={`${leak.key}-${leak.line}-${i}`} leak={leak} />
        ))}
      </div>
    </div>
  );
}

function LeakRow({ leak }: { leak: VarlockLeak }) {
  const severityStyle = getSeverityStyle(leak.severity);

  return (
    <div className="px-4 py-2 border-b border-border-light last:border-b-0 flex items-center gap-3 bg-surface">
      {/* Severity badge */}
      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
        style={{ background: severityStyle.bg, color: severityStyle.text }}
      >
        {leak.severity}
      </span>

      {/* Key */}
      <span className="font-mono text-xs text-text flex-1 truncate">
        {leak.key}
      </span>

      {/* Line number */}
      <span className="text-[11px] text-text-muted shrink-0">
        line {leak.line}
      </span>
    </div>
  );
}

// ── Helpers ──

function groupLeaksByFile(
  leaks: VarlockLeak[],
): Record<string, VarlockLeak[]> {
  const grouped: Record<string, VarlockLeak[]> = {};
  for (const leak of leaks) {
    if (!grouped[leak.file]) {
      grouped[leak.file] = [];
    }
    grouped[leak.file]!.push(leak);
  }
  return grouped;
}

function getSeverityStyle(severity: string): { bg: string; text: string } {
  switch (severity.toLowerCase()) {
    case "high":
    case "critical":
      return { bg: "#FFEDED", text: "#A51D14" };
    case "medium":
    case "warning":
      return { bg: "#FFF4E5", text: "#8A4D00" };
    case "low":
    case "info":
      return { bg: "#E8F2FF", text: "#0A5DC2" };
    default:
      return { bg: "#F5F5F7", text: "#6E6E73" };
  }
}
