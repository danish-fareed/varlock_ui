import { useScanStore } from "@/stores/scanStore";
import type { VarlockLeak } from "@/lib/types";

/**
 * ScanResultsPanel — displays results from `varlock scan`.
 * Shows grouped-by-file leak findings, clean state, or error state.
 */
export function ScanResultsPanel() {
  const { state, result, error, dismissResults } = useScanStore();

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-4 bg-surface">
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
      <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      <p className="text-sm text-text-secondary">Running security scan...</p>
      <p className="text-xs text-text-muted">
        Checking project files for leaked secrets
      </p>
    </div>
  );
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-full bg-danger/20 border border-danger/30 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-danger"
          aria-hidden="true"
        >
          <path
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-full bg-success/20 border border-success/30 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-success"
          aria-hidden="true"
        >
          <path
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 12c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
  // Group leaks by file
  const grouped = groupLeaksByFile(leaks);
  const fileNames = Object.keys(grouped).sort();

  return (
    <>
      {/* Summary banner */}
      <div className="rounded-xl border border-danger/30 bg-danger-light/10 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-danger"
            aria-hidden="true"
          >
            <path
              d="M8 5v3m0 2.5h.005M14 8A6 6 0 112 8a6 6 0 0112 0z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
    <div className="rounded-xl border border-border overflow-hidden">
      {/* File header */}
      <div className="px-4 py-2.5 bg-surface-secondary border-b border-border-light flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-text-muted shrink-0"
          aria-hidden="true"
        >
          <path
            d="M3 2h5l3 3v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
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
    <div className="px-4 py-2 border-b border-border-light last:border-b-0 flex items-center gap-3">
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
      return { bg: "#FCEBEB", text: "#A32D2D" };
    case "medium":
    case "warning":
      return { bg: "#FAEEDA", text: "#633806" };
    case "low":
    case "info":
      return { bg: "#E6F1FB", text: "#185FA5" };
    default:
      return { bg: "#F1EFE8", text: "#5F5E5A" };
  }
}
