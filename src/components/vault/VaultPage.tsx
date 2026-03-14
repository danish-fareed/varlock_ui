import { useState, useEffect } from "react";
import { useVaultStore } from "@/stores/vaultStore";
import { useProjectStore } from "@/stores/projectStore";
import { SetupWizard } from "./SetupWizard";
import { SecretGenerator } from "./SecretGenerator";
import { AiContextPanel } from "./AiContextPanel";
import { TeamSyncPanel } from "./TeamSyncPanel";
import type { VaultVariable } from "@/lib/types";

export function VaultPage() {
  const { status, lock, globalVariables, loadAllGlobalVariables, loading } = useVaultStore();
  const { projects } = useProjectStore();
  const [activeTab, setActiveTab] = useState<string>("vault");

  useEffect(() => {
    if (status?.unlocked && projects.length > 0) {
      loadAllGlobalVariables(projects);
    }
  }, [status?.unlocked, projects, loadAllGlobalVariables]);

  const tabs = [
    { id: "vault", label: "Overview" },
    { id: "import", label: "Import Secrets" },
    { id: "generate", label: "Generator" },
    { id: "ai-context", label: "AI Context" },
    { id: "team-sync", label: "Team Sync" },
  ];

  return (
    <div className="flex-1 overflow-auto p-6 bg-surface">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shadow-sm">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text">Vault</h1>
              <p className="text-sm text-text-secondary">
                {status?.unlocked ? "Securely storing your environment variables" : "Vault locked"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status?.unlocked && (
              <button
                onClick={lock}
                className="px-4 py-2 rounded-lg bg-transparent border border-border-light text-text-secondary text-sm font-medium hover:bg-surface-secondary transition-all cursor-pointer flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Lock Vault
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-8 border-b border-border-light pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[13px] font-medium rounded-t-lg cursor-pointer border-none transition-all ${
                activeTab === tab.id
                  ? "bg-surface-secondary text-accent border-b-2 border-accent"
                  : "bg-transparent text-text-muted hover:text-text hover:bg-surface-secondary/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="animate-fade-in">
          {activeTab === "vault" && (
            <div className="space-y-8">
              <VaultOverview />
              <div className="h-px bg-border-light" />
              <GlobalSecretsList 
                globalVariables={globalVariables} 
                projects={projects} 
                loading={loading}
              />
            </div>
          )}
          {activeTab === "import" && <SetupWizard />}
          {activeTab === "generate" && <SecretGenerator />}
          {activeTab === "ai-context" && <AiContextPanel />}
          {activeTab === "team-sync" && <TeamSyncPanel />}
        </div>
      </div>
    </div>
  );
}

function VaultOverview() {
  const { status } = useVaultStore();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-surface-secondary rounded-2xl p-6 border border-border-light shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status?.unlocked ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
             {status?.unlocked ? (
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
             ) : (
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
             )}
          </div>
          <div>
            <span className="text-text-muted text-[11px] uppercase tracking-wider font-semibold">Security Status</span>
            <p className="text-text font-medium mt-0.5">
              {status?.unlocked ? "Vault Unlocked" : "Vault Locked"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface-secondary rounded-2xl p-6 border border-border-light shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          </div>
          <div>
            <span className="text-text-muted text-[11px] uppercase tracking-wider font-semibold">Encryption Engine</span>
            <p className="text-text font-medium mt-0.5">XChaCha20-Poly1305</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalSecretsList({ 
  globalVariables, 
  projects, 
  loading 
}: { 
  globalVariables: Record<string, VaultVariable[]>, 
  projects: any[],
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-text-muted">Loading secrets from all projects...</p>
      </div>
    );
  }

  const projectIds = Object.keys(globalVariables).filter(id => {
    const vars = globalVariables[id];
    return vars && vars.length > 0;
  });

  if (projectIds.length === 0) {
    return (
      <div className="py-20 text-center bg-surface-secondary/50 rounded-2xl border border-border-light border-dashed">
        <div className="w-12 h-12 rounded-full bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
            <path d="M12 2v20M2 12h20" />
          </svg>
        </div>
        <h3 className="text-[15px] font-medium text-text mb-1">No secrets stored in Vault</h3>
        <p className="text-sm text-text-secondary">Variables stored in Vault across your projects will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">Global Secrets</h2>
      {projectIds.map(projectId => {
        const project = projects.find(p => p.id === projectId);
        const vars = globalVariables[projectId];
        if (!vars || vars.length === 0) return null;
        return (
          <div key={projectId} className="bg-surface rounded-2xl border border-border-light overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-surface-secondary border-b border-border-light flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center text-accent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                </div>
                <span className="text-[13px] font-semibold text-text">{project?.name || projectId}</span>
              </div>
              <span className="text-[11px] font-medium text-text-muted">{vars.length} secrets</span>
            </div>
            <div className="divide-y divide-border-light">
              {vars.map(v => (
                <SecretRow key={`${projectId}-${v.env}-${v.key}`} variable={v} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SecretRow({ variable }: { variable: VaultVariable }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="px-5 py-3 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors group">
      <div className="min-w-0 flex-1 flex items-center gap-4">
        <div className="w-40 shrink-0">
          <span className="font-mono text-xs font-medium text-text truncate block">{variable.key}</span>
          <span className="text-[10px] text-text-muted uppercase tracking-tighter">{variable.env}</span>
        </div>
        <div className="font-mono text-xs text-text-secondary truncate flex-1">
          {revealed ? variable.value : "•".repeat(16)}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => setRevealed(!revealed)}
          className="p-1.5 rounded-md hover:bg-surface-tertiary text-text-muted hover:text-text transition-colors cursor-pointer"
          title={revealed ? "Hide secret" : "Reveal secret"}
        >
          {revealed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(variable.value)}
          className="p-1.5 rounded-md hover:bg-surface-tertiary text-text-muted hover:text-text transition-colors cursor-pointer"
          title="Copy secret"
        >
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
      </div>
    </div>
  );
}
