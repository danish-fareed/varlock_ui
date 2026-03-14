import { forwardRef, useImperativeHandle } from "react";
import { useTerminal } from "@/hooks/useTerminalStream";

export interface TerminalInstanceHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  fit: () => void;
}

/**
 * xterm.js terminal instance wrapper.
 * Exposes write/clear methods via imperative handle for the parent to push data.
 */
export const TerminalInstance = forwardRef<TerminalInstanceHandle>(
  function TerminalInstance(_props, ref) {
    const { terminalRef, write, writeln, clear, fit } = useTerminal();

    useImperativeHandle(ref, () => ({
      write,
      writeln,
      clear,
      fit,
    }));

    return (
      <div
        ref={terminalRef}
        className="terminal-container w-full h-full bg-[#1a1a18]"
        role="log"
        aria-label="Terminal output"
      />
    );
  },
);
