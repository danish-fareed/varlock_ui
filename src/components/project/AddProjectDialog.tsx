import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import * as commands from "@/lib/commands";

interface AddProjectDialogProps {
  onClose: () => void;
}

/**
 * Modal dialog for adding a new project.
 * Opens a native directory picker, then adds the project.
 */
export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const addProject = useProjectStore((s) => s.addProject);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap: move focus into dialog on mount
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Trap focus inside the dialog
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
      if (e.target === e.currentTarget) {
        onClose();
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-title"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-surface rounded-xl shadow-[0_28px_80px_rgba(0,0,0,0.45)] border border-border w-full max-w-md mx-4"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-light flex items-center justify-between">
          <h2 id="add-project-title" className="text-[15px] font-medium text-text">
            Add Project
          </h2>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="text-sm text-text-secondary mb-4">
            Select a project directory that contains (or will contain) a
            .env.schema file.
          </p>

          {/* Directory picker */}
          <button
            onClick={handlePickDirectory}
            disabled={loading || picking}
            className="w-full border border-dashed border-border rounded-xl py-5 text-center hover:border-brand hover:bg-brand-light/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-surface-secondary"
          >
            {selectedPath ? (
              <div>
                <p className="text-sm font-medium text-text mb-1">
                  {selectedPath.split(/[\\/]/).pop()}
                </p>
                <p className="text-xs text-text-muted">{selectedPath}</p>
              </div>
            ) : (
              <div>
                <div className="w-9 h-9 rounded-lg bg-brand/18 border border-brand/25 flex items-center justify-center mx-auto mb-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="text-brand"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 4v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3H3a1 1 0 00-1 1z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text mb-1">
                  {picking ? "Opening folder picker..." : "Choose directory"}
                </p>
                <p className="text-xs text-text-muted">
                  Select your project folder
                </p>
              </div>
            )}
          </button>

          {/* Error message */}
          {error && (
            <div
              className="mt-3 bg-danger-light text-danger-dark text-xs px-3 py-2 rounded-lg"
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
            className="px-4 py-2 text-xs text-text border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedPath || loading}
            className="px-4 py-2 text-xs text-white bg-brand border border-brand rounded-lg hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? "Adding..." : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
