import { useState } from "react";
import { X } from "lucide-react";
import type { SchemaVarType } from "@/lib/types";

interface AddVariableModalProps {
  activeEnv: string;
  onClose: () => void;
  onSave: (key: string, value: string, type: SchemaVarType, description: string) => Promise<void>;
  existingVariables: { key: string }[];
}

const SCHEMA_TYPES: SchemaVarType[] = [
  "string", "url", "port", "number", "boolean", "enum", "email", "path",
];

export function AddVariableModal({ activeEnv, onClose, onSave, existingVariables }: AddVariableModalProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState<SchemaVarType>("string");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidKey = (k: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k);
  const isDuplicate = existingVariables.some(v => v.key === key.trim());

  // Real-time validation
  const keyError = key.trim()
    ? !isValidKey(key.trim())
      ? "Only letters, numbers, and underscores"
      : isDuplicate
        ? "Variable already exists"
        : null
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError("Key is required.");
      return;
    }
    if (!isValidKey(trimmedKey)) {
      setError("Key must contain only letters, numbers, and underscores, and cannot start with a number.");
      return;
    }

    if (isDuplicate) {
      setError(`Variable "${trimmedKey}" already exists in the project.`);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(trimmedKey, value, type, description);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface rounded-xl shadow-2xl overflow-hidden border border-border-light animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <h2 className="text-[15px] font-semibold text-text">Add Variable</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text transition-colors cursor-pointer border-none bg-transparent"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-left">
          {/* Identity Group */}
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Identity
            </div>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary mb-1.5 block">Key</span>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="e.g. DATABASE_URL"
                autoFocus
                className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-[13px] text-text font-mono outline-none transition-colors ${
                  keyError ? "border-danger focus:border-danger" : "border-border focus:border-accent"
                }`}
              />
              {keyError && (
                <span className="text-[10px] text-danger mt-1 block">{keyError}</span>
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-text-secondary mb-1.5 block">Type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SchemaVarType)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent transition-colors cursor-pointer"
                >
                  {SCHEMA_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-text-secondary mb-1.5 block">
                  Value <span className="text-text-muted font-normal text-[10px]">.env.{activeEnv}</span>
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value…"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text font-mono outline-none focus:border-accent transition-colors"
                />
              </label>
            </div>
          </div>

          {/* Schema Group */}
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Schema
            </div>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary mb-1.5 block">
                Description <span className="text-text-muted font-normal text-[10px]">optional</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this variable do?"
                rows={2}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent resize-none transition-colors"
              />
            </label>
          </div>

          {error && (
            <div className="p-3 text-[12px] text-danger-dark bg-danger-light border border-danger/15 rounded-lg">
              {error}
            </div>
          )}

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-[12px] text-text-secondary font-medium hover:bg-surface-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50 border-none bg-transparent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !!keyError}
              className="px-4 py-2 rounded-lg text-[12px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors shadow-sm cursor-pointer disabled:opacity-50 min-w-[80px] border-none"
            >
              {isSaving ? "Saving…" : "Add Variable"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
