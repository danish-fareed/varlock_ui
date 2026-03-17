import { useState, useEffect } from "react";
import { useVaultStore } from "../../stores/vaultStore";
import { useProjectStore } from "../../stores/projectStore";
import { listEnvFiles, readEnvFile } from "../../lib/commands";
import { Wand2, ChevronRight, Check } from "lucide-react";

type WizardStep = "source" | "detect" | "review" | "done";

interface DetectedVariable {
  key: string;
  value: string;
  sensitive: boolean;
  varType: string;
}

/** Infer if a key name refers to a sensitive value */
function inferSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  const sensitivePatterns = [
    "secret", "key", "token", "password", "passwd", "api_key",
    "apikey", "private", "auth", "credential", "jwt", "stripe",
    "aws", "firebase", "sendgrid", "twilio", "database_url",
    "db_url", "connection_string", "encryption",
  ];
  return sensitivePatterns.some((p) => lower.includes(p));
}

/** Infer variable type from key name and value */
function inferType(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (lower.includes("port")) return "port";
  if (lower.includes("url") || lower.includes("uri") || value.startsWith("http")) return "url";
  if (lower.includes("email")) return "email";
  if (lower.includes("path") || lower.includes("dir")) return "path";
  if (value === "true" || value === "false") return "boolean";
  if (/^\d+$/.test(value)) return "number";
  return "string";
}

/** Parse .env content into variables with inferred metadata */
function parseEnvContent(content: string): DetectedVariable[] {
  const vars: DetectedVariable[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const rest = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const eqIdx = rest.indexOf("=");
    if (eqIdx < 0) continue;
    const key = rest.slice(0, eqIdx).trim();
    const value = rest.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    vars.push({
      key,
      value,
      sensitive: inferSensitive(key),
      varType: inferType(key, value),
    });
  }
  return vars;
}

export function SetupWizard() {
  const activeProject = useProjectStore((s) => s.activeProject);
  const { importEnv, loadVariables } = useVaultStore();

  const [step, setStep] = useState<WizardStep>("source");
  const [envFiles, setEnvFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedVariable[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  // Load env files for the project
  useEffect(() => {
    if (activeProject) {
      listEnvFiles(activeProject.path).then(setEnvFiles).catch(() => {});
    }
  }, [activeProject]);

  const handleSelectFile = async (file: string) => {
    if (!activeProject) return;
    setSelectedFile(file);
    try {
      const content = await readEnvFile(`${activeProject.path}/${file}`);
      const vars = parseEnvContent(content);
      setDetected(vars);
      setStep("detect");
    } catch (e) {
      console.error("Failed to read env file:", e);
    }
  };

  const toggleSensitive = (key: string) => {
    setDetected((prev) =>
      prev.map((v) => (v.key === key ? { ...v, sensitive: !v.sensitive } : v))
    );
  };

  const handleImport = async () => {
    if (!activeProject || !selectedFile) return;
    setImporting(true);
    try {
      const content = await readEnvFile(`${activeProject.path}/${selectedFile}`);
      const sensitiveKeys = detected.filter((v) => v.sensitive).map((v) => v.key);
      await importEnv(
        activeProject.id,
        selectedFile.replace(/^\.env\.?/, "") || "default",
        content,
        sensitiveKeys
      );
      setResultMessage(
        `Imported ${detected.length} variables. Generated .env with varlock:// references for ${sensitiveKeys.length} sensitive values.`
      );
      setStep("done");
      await loadVariables(activeProject.id, selectedFile.replace(/^\.env\.?/, "") || "default");
    } catch (e) {
      setResultMessage(`Import failed: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="p-6 text-center text-text-muted">
        Select a project from the sidebar to start the setup wizard.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-surface">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Wand2 size={20} strokeWidth={1.5} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text">Setup Wizard</h1>
            <p className="text-xs text-text-secondary">
              Import environment variables into the encrypted vault
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {(["source", "detect", "review", "done"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? "bg-accent text-white"
                    : i < ["source", "detect", "review", "done"].indexOf(step)
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-secondary text-text-muted"
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="w-8 h-px bg-border-light" />}
            </div>
          ))}
        </div>

        {/* Step 1: Source selection */}
        {step === "source" && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-text mb-3">
              Select an .env file to import
            </h2>
            {envFiles.length === 0 ? (
              <p className="text-text-muted text-sm">
                No .env files found in {activeProject.name}. Create one first.
              </p>
            ) : (
              envFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => handleSelectFile(file)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border-light bg-surface hover:bg-surface-secondary transition-colors cursor-pointer flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-text">{file}</span>
                  <ChevronRight size={14} strokeWidth={1.3} />
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2: Detection review */}
        {step === "detect" && (
          <div>
            <h2 className="text-sm font-medium text-text mb-1">
              Detected {detected.length} variables from {selectedFile}
            </h2>
            <p className="text-xs text-text-secondary mb-4">
              Review sensitivity detection. Toggle 🔒 to mark variables as sensitive — they'll be stored encrypted in the vault.
            </p>
            <div className="border border-border-light rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary border-b border-border-light">
                    <th className="text-left px-3 py-2 font-medium text-text-muted text-xs">Key</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted text-xs">Type</th>
                    <th className="text-center px-3 py-2 font-medium text-text-muted text-xs">Sensitive</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted text-xs">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {detected.map((v) => (
                    <tr key={v.key} className="border-b border-border-light last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-text">{v.key}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{v.varType}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleSensitive(v.key)}
                          className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer border-none ${
                            v.sensitive
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-surface-secondary text-text-muted"
                          }`}
                        >
                          {v.sensitive ? "🔒 Yes" : "No"}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-muted truncate max-w-[200px]">
                        {v.sensitive ? "••••••••" : v.value.slice(0, 30)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between mt-4">
              <button
                onClick={() => setStep("source")}
                className="px-4 py-2 rounded-lg bg-transparent border border-border-light text-text-secondary text-sm cursor-pointer hover:bg-surface-secondary transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium cursor-pointer hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {importing ? "Importing..." : `Import ${detected.length} Variables`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <Check size={32} strokeWidth={2} className="text-green-500" />
            </div>
            <h2 className="text-lg font-semibold text-text mb-2">Import Complete</h2>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">{resultMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
