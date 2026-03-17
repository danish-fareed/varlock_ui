import { useState } from "react";
import { CommandCard } from "./CommandCard";
import { useCommandStore } from "@/stores/commandStore";
import { useProjectStore } from "@/stores/projectStore";
import * as commandsApi from "@/lib/commands";
import { Plus, Terminal, Server, Hammer, FlaskConical, Database, Sparkles, Rocket, Container, MoreHorizontal } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface rounded-xl p-5 max-w-md w-full shadow-xl border border-border-light animate-scale-in">
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
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-surface text-[13px] text-text placeholder:text-text-muted focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-secondary font-medium block mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
              className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-surface text-[13px] text-text font-mono placeholder:text-text-muted focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-secondary font-medium block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border-light bg-surface text-[13px] text-text focus:border-accent outline-none cursor-pointer"
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
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary text-[12px] font-medium cursor-pointer border-none bg-transparent hover:bg-surface-secondary transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !command.trim()} className="px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-medium cursor-pointer border-none disabled:opacity-50 shadow-sm hover:bg-accent-hover transition-colors">
            {saving ? "Saving…" : "Add Command"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category config ──

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  "dev-server": { label: "Dev Servers", icon: <Server size={13} strokeWidth={1.3} /> },
  build: { label: "Build", icon: <Hammer size={13} strokeWidth={1.3} /> },
  test: { label: "Tests", icon: <FlaskConical size={13} strokeWidth={1.3} /> },
  database: { label: "Database", icon: <Database size={13} strokeWidth={1.3} /> },
  "code-quality": { label: "Code Quality", icon: <Sparkles size={13} strokeWidth={1.3} /> },
  deploy: { label: "Deploy", icon: <Rocket size={13} strokeWidth={1.3} /> },
  docker: { label: "Docker", icon: <Container size={13} strokeWidth={1.3} /> },
  custom: { label: "Custom", icon: <MoreHorizontal size={13} strokeWidth={1.3} /> },
  other: { label: "Other", icon: <MoreHorizontal size={13} strokeWidth={1.3} /> },
};

// ── Command Grid ──

export function CommandGrid() {
  const scan = useCommandStore((s) => s.scan);
  const isScanning = useCommandStore((s) => s.isScanning);
  const [showAddModal, setShowAddModal] = useState(false);

  if (isScanning) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center animate-fade-in">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[12px] text-text-secondary">Scanning for commands…</p>
        </div>
      </div>
    );
  }

  if (!scan || scan.commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-surface rounded-xl border border-border-light">
        <div className="w-12 h-12 rounded-2xl bg-surface-tertiary flex items-center justify-center mb-4">
          <Terminal size={20} strokeWidth={1.2} className="text-text-muted" />
        </div>
        <h3 className="text-[14px] font-semibold text-text mb-1">No commands found</h3>
        <p className="text-[12px] text-text-secondary mb-4 max-w-xs text-center leading-5">
          Add a package.json, Makefile, or docker-compose.yml to your project to auto-discover commands.
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="h-8 px-4 rounded-lg bg-accent text-white text-[12px] font-medium cursor-pointer border-none shadow-sm hover:bg-accent-hover transition-colors flex items-center gap-1.5"
        >
          <Plus size={12} strokeWidth={2.5} />
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
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            Commands
          </span>
          <span className="text-[10px] font-medium text-text-muted bg-surface-tertiary rounded-full px-2 py-0.5 tabular-nums">
            {scan.commands.length}
          </span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="h-7 px-3 rounded-lg text-[11px] font-medium text-text-secondary hover:text-text hover:bg-surface-secondary cursor-pointer bg-transparent border border-border-light flex items-center gap-1.5 transition-colors"
        >
          <Plus size={11} strokeWidth={2} />
          Add Custom
        </button>
      </div>

      {/* Grouped command list */}
      <div className="flex flex-col gap-3">
        {Array.from(groups.entries()).map(([category, cmds]) => {
          const config = CATEGORY_CONFIG[category] ?? { label: category, icon: <MoreHorizontal size={13} /> };
          return (
            <div key={category} className="bg-surface rounded-xl border border-border-light overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary/40 border-b border-border-light">
                <span className="text-text-muted">{config.icon}</span>
                <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">
                  {config.label}
                </span>
                <span className="text-[10px] text-text-muted tabular-nums">
                  {cmds.length}
                </span>
              </div>
              {/* Commands */}
              <div className="divide-y divide-border-light/50">
                {cmds.map((cmd) => (
                  <CommandCard key={cmd.id} command={cmd} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && <AddCommandModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
