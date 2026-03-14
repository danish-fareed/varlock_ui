import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import * as commands from "@/lib/commands";
import { useEnvironmentStore } from "@/stores/environmentStore";

/**
 * Watches the active project's directory for `.env*` file changes.
 * When a change is detected, the environment store is automatically reloaded.
 *
 * The Rust backend emits a `"file-changed"` event with the project ID as payload
 * whenever a `.env*` file in the watched directory is modified.
 */
export function useFileWatcher(
  projectId: string | undefined,
  projectPath: string | undefined,
) {
  const loadEnvironment = useEnvironmentStore((s) => s.loadEnvironment);
  const activeEnv = useEnvironmentStore((s) => s.activeEnv);

  // Keep refs so the event handler always sees current values
  // without causing the effect to re-run on every env change.
  const pathRef = useRef(projectPath);
  const envRef = useRef(activeEnv);
  const idRef = useRef(projectId);
  pathRef.current = projectPath;
  envRef.current = activeEnv;
  idRef.current = projectId;

  useEffect(() => {
    if (!projectId || !projectPath) return;

    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    async function setup() {
      // Start watching the project directory for .env* changes
      try {
        await commands.watchProject(projectId!, projectPath!);
      } catch (e) {
        console.warn("Failed to start file watcher:", e);
        return;
      }

      if (cancelled) {
        // Cleanup race: component unmounted before setup finished
        commands.unwatchProject(projectId!).catch(() => {});
        return;
      }

      // Listen for file-changed events from the Rust backend
      const unlisten = await listen<string>("file-changed", (event) => {
        // Only reload if the event is for our active project
        if (event.payload === idRef.current && pathRef.current) {
          loadEnvironment(pathRef.current, envRef.current);
        }
      });

      if (cancelled) {
        unlisten();
        commands.unwatchProject(projectId!).catch(() => {});
        return;
      }

      unlistenFn = unlisten;
    }

    setup();

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
      commands.unwatchProject(projectId!).catch(() => {});
    };
  }, [projectId, projectPath, loadEnvironment]);
}
