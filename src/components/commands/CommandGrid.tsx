import { useState } from "react";
import { CommandCard } from "./CommandCard";
import { useCommandStore } from "@/stores/commandStore";
import { useProjectStore } from "@/stores/projectStore";
import * as commandsApi from "@/lib/commands";

// ── Add Command Modal ──

function AddCommandModal({ onClose }: { onClose: () => void }) {
  const { activeProject } = useProjectStore();
  const { scanProject } = useCommandStore();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [category, setCategory] = useState("other");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !command.trim() || !activeProject) return;
    setSaving(true);
    try {
      await commandsApi.saveCustomCommand(activeProject.path, name, command, category);
      await scanProject(activeProject.path);
      onClose();
    } catch (e) {
      console.error("Failed to save custom command:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-2xl p-5 max-w-md w-full shadow-xl border border-border-light animate-scale-in">
        <h3 className="text-[14px] font-semibold text-text mb-4">
          Add Custom Command
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-text-secondary font-medium block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dev server"
              className="w-full px-3 py-2 rounded-lg border border-border-light bg-surface-secondary text-[12px] text-text placeholder:text-text-muted focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-secondary font-medium block mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
              className="w-full px-3 py-2 rounded-lg border border-border-light bg-surface-secondary text-[12px] text-text font-mono placeholder:text-text-muted focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-secondary font-medium block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border-light bg-surface-secondary text-[12px] text-text focus:border-accent outline-none cursor-pointer"
            >
              <option value="dev-server">Dev Server</option>
              <option value="build">Build</option>
              <option value="test">Test</option>
              <option value="database">Database</option>
              <option value="code-quality">Code Quality</option>
              <option value="deploy">Deploy</option>
              <option value="docker">Docker</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-surface-secondary text-text-secondary text-[11px] font-medium cursor-pointer border-none">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !command.trim()} className="px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-medium cursor-pointer border-none disabled:opacity-50">
            {saving ? "Saving..." : "Add Command"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category grouping ──

const CATEGORY_LABELS: Record<string, string> = {
  "dev-server": "Dev Servers",
  build: "Build",
  test: "Tests",
  database: "Database",
  "code-quality": "Code Quality",
  deploy: "Deploy",
  docker: "Docker",
  custom: "Custom",
  other: "Other",
};

// ── Command Grid ──

export function CommandGrid() {
  const scan = useCommandStore((s) => s.scan);
  const isScanning = useCommandStore((s) => s.isScanning);
  const [showAddModal, setShowAddModal] = useState(false);

  if (isScanning) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center animate-fade-in">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[11px] text-text-secondary">Scanning for commands...</p>
        </div>
      </div>
    );
  }

  if (!scan || scan.commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-surface-secondary/30 rounded-xl border border-border-light border-dashed">
        <div className="text-[24px] mb-2 opacity-30">🔍</div>
        <h3 className="text-[13px] font-medium text-text mb-1">No commands found</h3>
        <p className="text-[11px] text-text-secondary mb-3">
          Add a package.json, Makefile, or docker-compose.yml
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-medium cursor-pointer border-none"
        >
          Add Custom Command
        </button>
        {showAddModal && <AddCommandModal onClose={() => setShowAddModal(false)} />}
      </div>
    );
  }

  // Group by category
  const groups = new Map<string, typeof scan.commands>();
  for (const cmd of scan.commands) {
    const cat = cmd.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(cmd);
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
          {scan.commands.length} commands
        </span>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-[10px] font-medium text-accent hover:underline cursor-pointer bg-transparent border-none"
        >
          + Add custom
        </button>
      </div>

      {/* Grouped command list */}
      {Array.from(groups.entries()).map(([category, cmds]) => (
        <div key={category}>
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5 px-1">
            {CATEGORY_LABELS[category] || category}
          </div>
          <div className="flex flex-col gap-1.5">
            {cmds.map((cmd) => (
              <CommandCard key={cmd.id} command={cmd} />
            ))}
          </div>
        </div>
      ))}

      {showAddModal && <AddCommandModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
