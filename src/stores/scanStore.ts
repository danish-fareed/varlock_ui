import { create } from "zustand";
import type { VarlockScanResult } from "@/lib/types";
import * as commands from "@/lib/commands";

type ScanState = "idle" | "scanning" | "done" | "error";

interface ScanStore {
  /** Current scan state */
  state: ScanState;
  /** Latest scan result */
  result: VarlockScanResult | null;
  /** Error message if scan failed */
  error: string | null;
  /** Whether the results panel is visible */
  showResults: boolean;

  // Actions
  runScan: (cwd: string) => Promise<void>;
  dismissResults: () => void;
  reset: () => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  state: "idle",
  result: null,
  error: null,
  showResults: false,

  runScan: async (cwd) => {
    set({ state: "scanning", error: null, showResults: true });
    try {
      const result = await commands.varlockScan(cwd);
      set({ state: "done", result, showResults: true });
    } catch (e) {
      set({ state: "error", error: String(e), showResults: true });
    }
  },

  dismissResults: () => {
    set({ showResults: false });
  },

  reset: () => {
    set({ state: "idle", result: null, error: null, showResults: false });
  },
}));
