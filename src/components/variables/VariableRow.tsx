import { useState, useRef, useEffect } from "react";
import type { MergedVariable } from "@/lib/types";
import { TYPE_BADGE_STYLES, DEFAULT_TYPE_BADGE } from "@/lib/constants";
import { useVaultStore } from "@/stores/vaultStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { readEnvFile, writeEnvFile } from "@/lib/commands";
import { updateSchemaEntry, serializeSchemaEntry, parseSchema } from "@/lib/schemaParser";
import type { SchemaEntry, SchemaVarType } from "@/lib/types";
import { isSensitiveKey } from "@/lib/utils";
import { Shield, MoreVertical, Copy, ShieldOff, Trash, Eye, EyeOff, ShieldAlert, Lock } from "lucide-react";

interface VariableRowProps {
  variable: MergedVariable;
  isSelected?: boolean;
  onSelect?: (variable: MergedVariable) => void;
  onDelete?: () => void;
  isLast?: boolean;
}

/**
 * Variable row — table grid layout matching column headers.
 * Columns: Status dot | Key | Value | Type | Actions
 */
export function VariableRow({ variable, isSelected, onSelect, onDelete, isLast }: VariableRowProps) {
  const typeBadge = TYPE_BADGE_STYLES[variable.type] ?? DEFAULT_TYPE_BADGE;
  const [showMenu, setShowMenu] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeProject = useProjectStore((s) => s.activeProject);
  const activeEnv = useEnvironmentStore((s) => s.activeEnv);
  const setVariable = useVaultStore((s) => s.setVariable);

  const isRecommended = !variable.sensitive && isSensitiveKey(variable.key);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Status config
  const statusConfig = !variable.valid
    ? { color: "bg-danger", ring: "ring-danger/20", tooltip: variable.errors[0] ?? "Validation error" }
    : variable.sensitive
      ? { color: "bg-accent", ring: "ring-accent/20", tooltip: "Stored as secret" }
      : { color: "bg-success", ring: "ring-success/20", tooltip: "Valid" };

  const statusLabel = !variable.valid
    ? (variable.errors[0]?.substring(0, 20) ?? "error")
    : variable.sensitive
      ? "secret"
      : "valid";

  const statusClass = !variable.valid
    ? "bg-danger-light text-danger-dark"
    : variable.sensitive
      ? "bg-accent-light text-accent"
      : "bg-success-light text-success-dark";

  const displayValue =
    variable.value === null ? (
      <span className="text-danger font-medium">— missing</span>
    ) : variable.sensitive && !showValue ? (
      <span className="text-text-muted tracking-wider">
        {"•".repeat(Math.min(14, variable.value.length || 8))}
      </span>
    ) : (
      variable.value
    );

  const handleStoreInVault = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);

    if (!variable.value || !activeProject) return;

    try {
      await setVariable(
        activeProject.id,
        activeEnv,
        variable.key,
        variable.value,
        variable.type,
        true,
        variable.required,
        variable.description
      );

      const envPath = `${activeProject.path}/.env`;
      const envContent = await readEnvFile(envPath);

      const lines = envContent.split("\n");
      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) return line;
        const isExport = trimmed.startsWith("export ");
        const contentStr = isExport ? trimmed.slice(7) : trimmed;
        const eqIdx = contentStr.indexOf("=");
        if (eqIdx < 0) return line;
        const key = contentStr.slice(0, eqIdx).trim();
        if (key === variable.key) {
          const prefix = isExport ? "export " : "";
          const refUri = `varlock://vault/${variable.key}`;
          const commentIdx = contentStr.indexOf("#", eqIdx);
          const comment = commentIdx > -1 ? ` ${contentStr.slice(commentIdx)}` : "";
          return `${prefix}${key}=${refUri}${comment}`;
        }
        return line;
      });

      await writeEnvFile(envPath, newLines.join("\n"));

      // Also mark it sensitive in .env.schema
      const schemaPath = `${activeProject.path}/.env.schema`;
      let schemaContent = "";
      try {
        schemaContent = await readEnvFile(schemaPath);
      } catch (e) {
        // file might not exist
      }

      const updatedEntry: SchemaEntry = {
        key: variable.key,
        baseValue: variable.schemaBaseValue ?? variable.value ?? "",
        type: (variable.type as SchemaVarType) ?? "string",
        required: variable.required ?? true,
        sensitive: true, // Force to sensitive
        description: variable.description ?? "",
        enumValues: variable.enumValues ?? [],
        decorators: [], // We don't have access to existing decorators easily here, but parsing it from schemaContent works
        lineStart: variable.schemaLineStart ?? 0,
        lineEnd: variable.schemaLineEnd ?? 0,
      };

      // Try to preserve existing decorators if entry exists
      if (schemaContent) {
        const existingEntries = parseSchema(schemaContent);
        const existing = existingEntries.find((e) => e.key === variable.key);
        if (existing) {
          updatedEntry.decorators = existing.decorators;
        }
      }

      let nextSchemaContent: string;
      if (schemaContent && variable.hasSchema) {
        nextSchemaContent = updateSchemaEntry(schemaContent, updatedEntry);
      } else if (schemaContent) {
        const block = serializeSchemaEntry(updatedEntry);
        const lineEnding = schemaContent.includes("\r\n") ? "\r\n" : "\n";
        const hasTrailing = schemaContent.endsWith("\n");
        nextSchemaContent = schemaContent + (hasTrailing ? lineEnding : lineEnding + lineEnding) + block + lineEnding;
      } else {
        nextSchemaContent = serializeSchemaEntry(updatedEntry) + "\n";
      }

      await writeEnvFile(schemaPath, nextSchemaContent);

      useEnvironmentStore.getState().loadEnvironment(activeProject.path);

      // Refresh vault global variables so the Vault tab updates immediately
      const { projects } = useProjectStore.getState();
      useVaultStore.getState().loadAllGlobalVariables(projects);
    } catch (e) {
      console.error("Failed to store variable in vault:", e);
    }
  };

  return (
    <div
      className={`group relative grid grid-cols-[200px_1fr_80px_90px_32px] px-4 py-2.5 gap-3 items-center transition-all border-none bg-transparent ${
        isSelected
          ? "bg-accent/5 border-l-[2.5px] border-l-accent"
          : "hover:bg-surface-secondary/60 active:bg-surface-secondary border-l-[2.5px] border-l-transparent"
      } ${isLast ? "rounded-b-[11px]" : ""}`}
      onClick={() => onSelect?.(variable)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(variable) }}
    >
      {/* Key */}
      <div className="font-mono text-[12px] font-semibold text-text truncate flex items-center gap-1.5 min-w-0">
        <div
          className={`w-[6px] h-[6px] rounded-full shrink-0 ${statusConfig.color} ring-1 ${statusConfig.ring}`}
          title={statusConfig.tooltip}
        />
        {variable.sensitive && (
          <Shield size={11} strokeWidth={1.5} className="text-accent shrink-0" />
        )}
        {variable.isVaultRef && (
          <Lock size={10} strokeWidth={1.6} className="text-accent shrink-0" />
        )}
        <span className="truncate">{variable.key}</span>
        {isRecommended && (
          <span title="This variable looks sensitive. Consider storing in Vault.">
            <ShieldAlert size={10} strokeWidth={1.5} className="text-accent/50 shrink-0" />
          </span>
        )}
      </div>

      {/* Value */}
      <div className="font-mono text-[12px] text-text-secondary truncate flex items-center gap-1.5 min-w-0">
        <span className="truncate">{displayValue}</span>
        {variable.sensitive && variable.value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowValue(!showValue);
            }}
            className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer bg-transparent border-none shrink-0 opacity-0 group-hover:opacity-100"
          >
            {showValue ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        )}
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-1 min-w-0">
        <span className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md truncate ${typeBadge}`}>
          {variable.type}
        </span>
        {!variable.hasSchema && (
          <span
            className="text-[8px] text-text-muted italic shrink-0"
            title="Type inferred — not in .env.schema"
          >
            *
          </span>
        )}
      </div>

      {/* Status badge */}
      <div className="flex justify-end min-w-0">
        <span
          className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md truncate ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Action Menu Trigger (Column 5) */}
      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="w-6 h-6 rounded-md bg-surface-tertiary/80 text-text-secondary hover:text-text hover:bg-border-light flex items-center justify-center cursor-pointer border-none shadow-sm backdrop-blur-sm"
        >
          <MoreVertical size={13} />
        </button>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-3 top-[calc(100%-4px)] z-10 w-44 bg-surface-secondary rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.05),0_0_0_1px_rgba(255,255,255,0.05)] py-1 animate-slide-down origin-top-right border border-border-light/50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              if (variable.value) navigator.clipboard.writeText(variable.value);
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-surface-tertiary cursor-pointer border-none bg-transparent flex items-center gap-2 transition-colors"
          >
            <Copy size={12} strokeWidth={1.5} className="text-text-muted" />
            Copy Value
          </button>

          {!variable.sensitive ? (
            <button
              onClick={handleStoreInVault}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-surface-tertiary cursor-pointer border-none bg-transparent flex items-center gap-2 transition-colors"
            >
              <Shield size={12} strokeWidth={1.2} className="text-text-muted" />
              Store in Vault
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-surface-tertiary cursor-pointer border-none bg-transparent flex items-center gap-2 transition-colors"
            >
              <ShieldOff size={12} strokeWidth={1.2} className="text-text-muted" />
              Remove from Vault
            </button>
          )}

          <div className="h-px bg-border-light my-1 mx-2" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              if (onDelete) onDelete();
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger-light cursor-pointer border-none bg-transparent flex items-center gap-2 transition-colors"
          >
            <Trash size={12} strokeWidth={1.2} />
            Delete Variable
          </button>
        </div>
      )}
    </div>
  );
}
