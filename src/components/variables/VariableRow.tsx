import { useState, useRef, useEffect } from "react";
import type { MergedVariable } from "@/lib/types";
import { TYPE_BADGE_STYLES, DEFAULT_TYPE_BADGE } from "@/lib/constants";
import { useVaultStore } from "@/stores/vaultStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEnvironmentStore } from "@/stores/environmentStore";
import { readEnvFile, writeEnvFile } from "@/lib/commands";
import { isSensitiveKey } from "@/lib/utils";

interface VariableRowProps {
  variable: MergedVariable;
  onSelect?: (variable: MergedVariable) => void;
}

/**
 * Single variable row — macOS list item with hover states and clean typography.
 * Now includes a "Store in Vault" context action.
 */
export function VariableRow({ variable, onSelect }: VariableRowProps) {
  const typeBadge = TYPE_BADGE_STYLES[variable.type] ?? DEFAULT_TYPE_BADGE;
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const activeProject = useProjectStore((s) => s.activeProject);
  const setVariable = useVaultStore((s) => s.setVariable);

  // Intelligent recommendation
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

  const statusClass = !variable.valid
    ? "bg-danger-light text-danger-dark"
    : variable.sensitive
      ? "bg-accent-light text-accent"
      : "bg-success-light text-success-dark";

  const statusLabel = !variable.valid
    ? variable.errors[0] ?? "error"
    : variable.sensitive
      ? "secret"
      : "valid";

  const displayValue =
    variable.value === null ? (
      <span className="text-danger">— missing</span>
    ) : variable.sensitive ? (
      <span className="text-accent/60">
        {"•".repeat(Math.min(16, variable.value.length || 12))}
      </span>
    ) : (
      variable.value
    );

  const handleStoreInVault = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    
    if (!variable.value || !activeProject) return;

    try {
      // 1. Store the raw value in the vault
      await setVariable(
        activeProject.id,
        "default", // Assuming default env for now, could be dynamic
        variable.key,
        variable.value,
        variable.type,
        true // mark as sensitive
      );

      // 2. Read the current .env file
      const envPath = `${activeProject.path}/.env`;
      const envContent = await readEnvFile(envPath);

      // 3. Replace the value with a varlock reference
      const lines = envContent.split("\n");
      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) return line;
        
        // Handle "export KEY=value" or just "KEY=value"
        const isExport = trimmed.startsWith("export ");
        const contentStr = isExport ? trimmed.slice(7) : trimmed;
        
        const eqIdx = contentStr.indexOf("=");
        if (eqIdx < 0) return line;
        
        const key = contentStr.slice(0, eqIdx).trim();
        if (key === variable.key) {
          // Keep original indentation/export prefix
          const prefix = isExport ? "export " : "";
          const refUri = `varlock://vault/${variable.key}`;
          // Preserve any comments after the value (very basic implementation)
          const commentIdx = contentStr.indexOf("#", eqIdx);
          const comment = commentIdx > -1 ? ` ${contentStr.slice(commentIdx)}` : "";
          return `${prefix}${key}=${refUri}${comment}`;
        }
        return line;
      });

      // 4. Write back to disk
      await writeEnvFile(envPath, newLines.join("\n"));

      // 5. Trigger a reload of the environment so the UI updates
      useEnvironmentStore.getState().loadEnvironment(activeProject.path);
      
    } catch (e) {
      console.error("Failed to store variable in vault:", e);
      // In a real app we'd show a toast notification here
    }
  };

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect?.(variable)}
        className="w-full text-left grid grid-cols-[200px_1fr_80px_90px] px-4 py-2.5 gap-3 items-center hover:bg-surface-secondary/80 active:bg-surface-secondary transition-colors cursor-pointer border-none bg-transparent"
      >
        {/* Key */}
        <div className="font-mono text-[12px] font-medium text-text truncate flex items-center gap-1.5">
          {variable.sensitive && (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-accent shrink-0">
              <path d="M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          )}
          <span className="truncate">{variable.key}</span>
        </div>

        {/* Value */}
        <div className="font-mono text-[12px] text-text-secondary truncate">
          {displayValue}
        </div>

        {/* Type badge */}
        <div className="flex items-center gap-1">
          <span
            className="text-[10px] font-medium px-1.5 py-[2px] rounded-md"
            style={{ backgroundColor: typeBadge.bg, color: typeBadge.text }}
          >
            {variable.type}
          </span>
          {!variable.hasSchema && (
            <span
              className="text-[9px] text-text-muted"
              title="Type inferred — not confirmed in .env.schema"
            >
              *
            </span>
          )}
          {isRecommended && (
            <span
              className="text-[10px] font-medium px-1.5 py-[2px] rounded-md bg-accent-light/50 text-accent animate-pulse-soft"
              title="This variable looks sensitive. Recommended for Vault."
            >
              Recommended
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="flex justify-end">
          <span
            className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md truncate ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>
      </button>

      {/* Action Menu Trigger (visible on hover) */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="w-6 h-6 rounded-md bg-surface-tertiary text-text-secondary hover:text-text hover:bg-border flex items-center justify-center cursor-pointer border-none shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="3" r="1.5" fill="currentColor" />
            <circle cx="7" cy="7" r="1.5" fill="currentColor" />
            <circle cx="7" cy="11" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div 
          ref={menuRef}
          className="absolute right-4 top-[calc(100%-8px)] z-10 w-40 bg-surface rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)] py-1 animate-scale-in origin-top-right"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              if (variable.value) navigator.clipboard.writeText(variable.value);
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-accent hover:text-white cursor-pointer border-none bg-transparent flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Value
          </button>

          {!variable.sensitive ? (
            <button
              onClick={handleStoreInVault}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-accent hover:text-white cursor-pointer border-none bg-transparent flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="opacity-70">
                <path d="M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Store in Vault
            </button>
          ) : (
             <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text hover:bg-danger hover:text-white cursor-pointer border-none bg-transparent flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="opacity-70">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Remove from Vault
            </button>
          )}
        </div>
      )}
    </div>
  );
}
