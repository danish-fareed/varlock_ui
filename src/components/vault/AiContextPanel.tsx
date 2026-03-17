import { useState } from "react";
import { Info } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../../stores/projectStore";

type OutputFormat = "markdown" | "json";

export function AiContextPanel() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const [format, setFormat] = useState<OutputFormat>("markdown");
  const [env, setEnv] = useState("dev");
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!activeProject) return;
    setLoading(true);
    setCopied(false);
    try {
      if (format === "markdown") {
        const result = await invoke<string>("ai_context_markdown", {
          projectId: activeProject.id,
          envName: env,
        });
        setOutput(result);
      } else {
        const result = await invoke<string>("ai_context_json", {
          projectId: activeProject.id,
          envName: env,
        });
        setOutput(result);
      }
    } catch (e) {
      setOutput(`Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-secondary rounded-xl border border-border-light p-5">
      <h3 className="text-sm font-semibold text-text mb-1 flex items-center gap-2">
        <Info size={16} className="text-accent" />
        AI Context Generator
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Generate a sanitized environment map for AI agents — sensitive values are always redacted.
      </p>

      <div className="flex gap-2 mb-3">
        {/* Format toggle */}
        <div className="flex rounded-lg border border-border-light overflow-hidden">
          {(["markdown", "json"] as OutputFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer border-none transition-colors ${
                format === f
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              {f === "markdown" ? ".env.md" : ".env.json"}
            </button>
          ))}
        </div>

        {/* Env selector */}
        <input
          type="text"
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          placeholder="Environment"
          className="flex-1 px-3 py-1.5 rounded-lg border border-border-light bg-surface text-sm text-text"
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !activeProject}
          className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium cursor-pointer border-none hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Generate"}
        </button>
      </div>

      {/* Output */}
      {output && (
        <div className="relative">
          <pre className="bg-surface rounded-lg border border-border-light p-3 text-xs text-text font-mono overflow-auto max-h-80 whitespace-pre-wrap">
            {output}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 rounded text-xs bg-surface-secondary border border-border-light text-text-secondary hover:text-text cursor-pointer transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}

      {!output && (
        <div className="bg-surface rounded-lg border border-border-light p-6 text-center">
          <p className="text-xs text-text-muted">
            Click Generate to create a sanitized context map. Sensitive values will be replaced with safe examples (e.g., <code>sk_test_xxxx</code>).
          </p>
        </div>
      )}
    </div>
  );
}
