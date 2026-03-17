import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import * as commands from "@/lib/commands";
import { X, Folder } from "lucide-react";

interface AddProjectDialogProps {
  onClose: () => void;
}

/**
 * macOS-style sheet dialog for adding a new project.
 */
export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const addProject = useProjectStore((s) => s.addProject);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handlePickDirectory = async () => {
    setPicking(true);
    try {
      const path = await commands.pickDirectory();
      if (path) {
        setSelectedPath(path);
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPicking(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedPath) return;
    setLoading(true);
    setError(null);
    try {
      await addProject(selectedPath);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-title"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-surface rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.08)] w-full max-w-md mx-4 animate-scale-in"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between">
          <h2 id="add-project-title" className="text-[15px] font-bold text-text">
            Add Project
          </h2>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-tertiary transition-colors cursor-pointer border-none bg-transparent"
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="text-[13px] text-text-secondary mb-4 leading-5">
            Select a project directory that contains (or will contain) a
            .env.schema file.
          </p>

          {/* Directory picker */}
          <button
            onClick={handlePickDirectory}
            disabled={loading || picking}
            className="w-full border border-dashed border-border rounded-xl py-5 text-center hover:border-accent hover:bg-accent-light/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-surface-sunken"
          >
            {selectedPath ? (
              <div>
                <p className="text-[13px] font-medium text-text mb-0.5">
                  {selectedPath.split(/[\\/]/).pop()}
                </p>
                <p className="text-[11px] text-text-muted">{selectedPath}</p>
              </div>
            ) : (
              <div>
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center mx-auto mb-2">
                  <Folder
                    size={18}
                    strokeWidth={1.2}
                    className="text-accent"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-[13px] font-medium text-text mb-0.5">
                  {picking ? "Opening folder picker..." : "Choose directory"}
                </p>
                <p className="text-[11px] text-text-muted">
                  Select your project folder
                </p>
              </div>
            )}
          </button>

          {/* Error message */}
          {error && (
            <div
              className="mt-3 bg-danger-light text-danger-dark text-[12px] px-3 py-2 rounded-lg"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-light flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 px-4 text-[13px] font-medium text-text border border-border rounded-xl hover:bg-surface-secondary transition-colors cursor-pointer bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedPath || loading}
            className="h-10 px-4 text-[13px] font-bold text-white bg-accent border border-accent rounded-xl hover:bg-accent-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? "Adding..." : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
