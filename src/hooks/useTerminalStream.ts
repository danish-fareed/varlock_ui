import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TERMINAL_FONT_FAMILY, TERMINAL_FONT_SIZE, TERMINAL_THEME } from "@/lib/constants";

interface UseTerminalOptions {
  /** Callback when user types in the terminal */
  onData?: (data: string) => void;
}

interface UseTerminalReturn {
  /** Ref to attach to the terminal container div */
  terminalRef: React.RefObject<HTMLDivElement | null>;
  /** Write data to the terminal display */
  write: (data: string) => void;
  /** Write a line to the terminal display */
  writeln: (data: string) => void;
  /** Clear the terminal */
  clear: () => void;
  /** Force a resize/fit */
  fit: () => void;
  /** Get the underlying Terminal instance (for advanced use) */
  getTerminal: () => Terminal | null;
}

/**
 * Hook that manages an xterm.js Terminal instance.
 * Handles creation, mounting, resize, and cleanup.
 */
export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    // Track animation frame IDs for cleanup
    let initFrameId: number | null = null;
    let resizeFrameId: number | null = null;

    // Create terminal instance
    const terminal = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      theme: TERMINAL_THEME,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    termRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Mount terminal to DOM
    terminal.open(container);

    // Initial fit after a small delay for layout settling
    initFrameId = requestAnimationFrame(() => {
      initFrameId = null;
      try {
        fitAddon.fit();
      } catch {
        // Terminal may not be ready yet
      }
    });

    // Handle user input
    let dataDisposable: { dispose: () => void } | null = null;
    if (options.onData) {
      dataDisposable = terminal.onData(options.onData);
    }

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      // Cancel any pending resize frame
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
      // Debounce resize to avoid excessive fits
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null;
        try {
          fitAddon.fit();
        } catch {
          // Terminal may not be ready yet
        }
      });
    });
    resizeObserver.observe(container);
    observerRef.current = resizeObserver;

    // Cleanup on unmount
    return () => {
      // Cancel pending animation frames
      if (initFrameId !== null) {
        cancelAnimationFrame(initFrameId);
      }
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
      resizeObserver.disconnect();
      dataDisposable?.dispose();
      terminal.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      observerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    termRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const fit = useCallback(() => {
    try {
      fitAddonRef.current?.fit();
    } catch {
      // Ignore if terminal not ready
    }
  }, []);

  const getTerminal = useCallback(() => termRef.current, []);

  return { terminalRef, write, writeln, clear, fit, getTerminal };
}
