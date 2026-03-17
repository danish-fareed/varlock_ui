import { useState } from "react";
import { Layers } from "lucide-react";
import { useVaultStore } from "../../stores/vaultStore";
import type { SecretType } from "../../lib/types";

const SECRET_TYPES: { id: SecretType; label: string; desc: string }[] = [
  { id: "hex", label: "Hex String", desc: "0-9, a-f characters" },
  { id: "base64", label: "Base64", desc: "Base64 encoded bytes" },
  { id: "uuid", label: "UUID v4", desc: "Standard UUID format" },
  { id: "alphanumeric", label: "Alphanumeric", desc: "A-Z, a-z, 0-9" },
  { id: "password", label: "Password", desc: "With special characters" },
];

interface SecretGeneratorProps {
  onInsert?: (value: string) => void;
}

export function SecretGenerator({ onInsert }: SecretGeneratorProps) {
  const { generateSecret } = useVaultStore();
  const [secretType, setSecretType] = useState<SecretType>("hex");
  const [length, setLength] = useState(64);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setCopied(false);
    try {
      const value = await generateSecret(
        secretType,
        secretType === "uuid" ? undefined : length
      );
      setGenerated(value);
    } catch (e) {
      console.error("Generation failed:", e);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-secondary rounded-xl border border-border-light p-5">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <Layers size={16} className="text-accent" />
        Secret Generator
      </h3>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SECRET_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setSecretType(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
              secretType === t.id
                ? "bg-accent text-white border-accent"
                : "bg-surface border-border-light text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Length slider (hidden for UUID) */}
      {secretType !== "uuid" && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">Length</label>
            <span className="text-xs font-mono text-text">{length}</span>
          </div>
          <input
            type="range"
            min={8}
            max={128}
            value={length}
            onChange={(e) => setLength(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium cursor-pointer border-none hover:bg-accent-hover disabled:opacity-50 transition-colors mb-3"
      >
        {generating ? "Generating..." : "✨ Generate Secret"}
      </button>

      {/* Result */}
      {generated && (
        <div className="bg-surface rounded-lg border border-border-light p-3">
          <div className="flex items-start justify-between gap-2">
            <code className="text-xs text-text font-mono break-all flex-1">
              {generated}
            </code>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className="px-2 py-1 rounded text-xs bg-surface-secondary border border-border-light text-text-secondary hover:text-text cursor-pointer transition-colors"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              {onInsert && (
                <button
                  onClick={() => onInsert(generated)}
                  className="px-2 py-1 rounded text-xs bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 cursor-pointer transition-colors"
                >
                  Insert
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
