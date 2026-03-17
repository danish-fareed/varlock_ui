/**
 * TeamSyncPanel — Phase 4 Architecture Preview
 *
 * This is a UI placeholder showing the planned team sync architecture.
 * Actual sync functionality will be implemented when Varlock Cloud is ready.
 */

import { Users } from "lucide-react";

export function TeamSyncPanel() {
  return (
    <div className="bg-surface-secondary rounded-xl border border-border-light p-5">
      <h3 className="text-sm font-semibold text-text mb-1 flex items-center gap-2">
        <Users size={16} className="text-accent" />
        Team Sync
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent uppercase tracking-wider">
          Coming Soon
        </span>
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Encrypted team sharing with content-addressed conflict resolution.
      </p>

      {/* Architecture cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <ArchCard
          icon="🔐"
          title="End-to-End Encrypted"
          desc="Secrets encrypted before leaving your device. Server never sees plaintext."
        />
        <ArchCard
          icon="🔄"
          title="Content-Addressed Sync"
          desc="SHA-256 hashes detect conflicts. Merge UI for divergent changes."
        />
        <ArchCard
          icon="👥"
          title="Role-Based Access"
          desc="Admin, Developer, and Read-Only roles per project."
        />
        <ArchCard
          icon="📋"
          title="Audit Trail"
          desc="Full access log with actor, timestamp, and action history."
        />
      </div>

      {/* Architecture diagram */}
      <div className="bg-surface rounded-lg border border-border-light p-4 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-text-secondary">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-base">💻</div>
            <span>Local Vault</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-accent">→ Encrypted →</span>
            <span className="text-[10px] text-text-muted">XChaCha20</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 text-base">☁️</div>
            <span>Varlock Cloud</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-accent">→ Encrypted →</span>
            <span className="text-[10px] text-text-muted">XChaCha20</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-base">👩‍💻</div>
            <span>Team Member</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted mt-3 text-center">
        Team sync will be available when Varlock Cloud launches. Your local vault is fully functional in the meantime.
      </p>
    </div>
  );
}

function ArchCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-surface rounded-lg border border-border-light p-3">
      <div className="text-lg mb-1">{icon}</div>
      <h4 className="text-xs font-semibold text-text mb-0.5">{title}</h4>
      <p className="text-[11px] text-text-muted leading-relaxed">{desc}</p>
    </div>
  );
}
