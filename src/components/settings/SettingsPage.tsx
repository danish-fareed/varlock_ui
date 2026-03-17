import { useState, useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { createPortal } from "react-dom";
import { X, Shield, Wrench, Settings, Lock, Link, User } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = "general" | "vault" | "security" | "integrations" | "account";

/**
 * Redesigned settings modal with organized categories and Vault integration.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    theme,
    terminalFontSize,
    terminalScrollback,
    setTheme,
    setTerminalFontSize,
    setTerminalScrollback,
  } = useSettingsStore();

  const { status, unlock, lock, loading, error } = useVaultStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [password, setPassword] = useState("");

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await unlock(password);
      setPassword("");
    } catch {
      // Error handled by store
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.08)] w-full max-w-[700px] h-[500px] mx-4 animate-scale-in flex overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-[200px] bg-surface-secondary border-r border-border-light flex flex-col py-4 px-2 shrink-0">
          <div className="px-3 mb-4">
            <h2 className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Settings</h2>
          </div>
          <div className="space-y-0.5">
            <TabItem active={activeTab === "general"} onClick={() => setActiveTab("general")} icon="general">General</TabItem>
            <TabItem active={activeTab === "vault"} onClick={() => setActiveTab("vault")} icon="vault">Vault</TabItem>
            <TabItem active={activeTab === "security"} onClick={() => setActiveTab("security")} icon="security">Security</TabItem>
            <TabItem active={activeTab === "integrations"} onClick={() => setActiveTab("integrations")} icon="integrations">Integrations</TabItem>
            <TabItem active={activeTab === "account"} onClick={() => setActiveTab("account")} icon="account">Account</TabItem>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-surface min-w-0">
          <div className="px-8 pt-6 pb-4 flex items-center justify-between shrink-0">
            <h1 className="text-lg font-bold text-text capitalize">{activeTab}</h1>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-muted hover:text-text transition-colors cursor-pointer border-none bg-transparent"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
            {activeTab === "general" && (
              <div className="space-y-8 animate-fade-in">
                <section>
                  <label className="text-[13px] font-semibold text-text mb-4 block">Appearance</label>
                  <div className="grid grid-cols-3 gap-3">
                    <ThemeCard label="Light" active={theme === "light"} onClick={() => setTheme("light")}>
                      <LightThemePreview />
                    </ThemeCard>
                    <ThemeCard label="Dark" active={theme === "dark"} onClick={() => setTheme("dark")}>
                      <DarkThemePreview />
                    </ThemeCard>
                    <ThemeCard label="System" active={theme === "system"} onClick={() => setTheme("system")}>
                      <SystemThemePreview />
                    </ThemeCard>
                  </div>
                </section>

                <div className="h-px bg-border-light" />

                <section className="space-y-4">
                  <label className="text-[13px] font-semibold text-text block">Terminal Preferences</label>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] text-text font-medium">Font size</p>
                      <p className="text-[11px] text-text-muted">Adjust the console text size.</p>
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => setTerminalFontSize(Math.max(10, terminalFontSize - 1))} className="w-8 h-8 rounded-lg border border-border-light bg-surface hover:bg-surface-secondary flex items-center justify-center">-</button>
                       <span className="text-[13px] font-mono text-text w-6 text-center">{terminalFontSize}</span>
                       <button onClick={() => setTerminalFontSize(Math.min(24, terminalFontSize + 1))} className="w-8 h-8 rounded-lg border border-border-light bg-surface hover:bg-surface-secondary flex items-center justify-center">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] text-text font-medium">Scrollback</p>
                      <p className="text-[11px] text-text-muted">Lines kept in history.</p>
                    </div>
                    <select
                      value={terminalScrollback}
                      onChange={(e) => setTerminalScrollback(Number(e.target.value))}
                      className="h-8 px-2 rounded-lg border border-border-light bg-surface text-text text-[13px] outline-none"
                    >
                      <option value={1000}>1,000 lines</option>
                      <option value={5000}>5,000 lines</option>
                      <option value={10000}>10,000 lines</option>
                    </select>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "vault" && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface-secondary rounded-2xl p-5 border border-border-light">
                   <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status?.unlocked ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                       <Shield size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-text"> {status?.unlocked ? "Vault is Unlocked" : "Vault is Locked"}</p>
                      <p className="text-[11px] text-text-muted">Protecting secrets with XChaCha20-Poly1305.</p>
                    </div>
                    {status?.unlocked && (
                      <button onClick={lock} className="px-3 py-1.5 rounded-lg bg-surface border border-border-light text-[12px] font-semibold hover:bg-surface-tertiary transition-colors">Lock Now</button>
                    )}
                   </div>
                </div>

                {!status?.unlocked && (
                  <form onSubmit={handleUnlock} className="space-y-4 pt-4">
                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 block">Master Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter vault password..."
                        className="w-full h-10 px-4 rounded-xl border border-border bg-surface-secondary text-[13px] focus:border-accent outline-none transition-all"
                        disabled={loading}
                      />
                    </div>
                    {error && <p className="text-[11px] text-danger font-medium">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading || !password}
                      className="w-full h-10 rounded-xl bg-accent text-white text-[13px] font-bold hover:bg-accent-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Unlock Vault"}
                    </button>
                  </form>
                )}

                <div className="pt-4 space-y-4">
                   <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">Advanced</label>
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-[13px] text-text font-medium">Reset Keychain</p>
                       <p className="text-[11px] text-text-muted">Forget this device and reset auto-unlock.</p>
                     </div>
                     <button className="px-3 py-1.5 rounded-lg border border-danger/20 text-danger text-[12px] font-semibold hover:bg-danger/5">Reset</button>
                   </div>
                </div>
              </div>
            )}

            {(activeTab === "security" || activeTab === "integrations" || activeTab === "account") && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-3xl bg-surface-secondary flex items-center justify-center text-text-muted">
                  <Wrench size={32} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-text">Coming Soon</h3>
                  <p className="text-[13px] text-text-muted mt-1 max-w-[240px]">This section is under active development and will be available in a future update.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function TabItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  const getIcon = () => {
    switch (icon) {
      case "general": return <Settings size={16} />;
      case "vault": return <Shield size={16} />;
      case "security": return <Lock size={16} />;
      case "integrations": return <Link size={16} />;
      case "account": return <User size={16} />;
      default: return null;
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer border-none ${
        active 
          ? "bg-accent text-white shadow-md shadow-accent/20" 
          : "bg-transparent text-text-muted hover:bg-surface-tertiary hover:text-text"
      }`}
    >
      <span className={active ? "text-white" : "text-text-secondary"}>{getIcon()}</span>
      {children}
    </button>
  );
}

function ThemeCard({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-2xl border-2 p-3 transition-all cursor-pointer group ${
        active ? "border-accent bg-accent/5" : "border-border-light bg-surface hover:border-border"
      }`}
    >
      <div className="rounded-xl overflow-hidden mb-3 border border-border-light shadow-sm">{children}</div>
      <div className="flex items-center justify-center gap-2">
        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-accent" : "border-border"}`}>
          {active && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </div>
        <span className={`text-[12px] font-bold ${active ? "text-accent" : "text-text-muted group-hover:text-text"}`}>{label}</span>
      </div>
    </button>
  );
}

function LightThemePreview() {
  return (
    <div className="h-16 bg-[#F5F5F7] flex p-1 gap-1">
      <div className="w-8 bg-white rounded-lg shadow-sm" />
      <div className="flex-1 bg-white rounded-lg shadow-sm" />
    </div>
  );
}

function DarkThemePreview() {
  return (
    <div className="h-16 bg-[#1C1C1E] flex p-1 gap-1">
      <div className="w-8 bg-[#2C2C2E] rounded-lg border border-white/5" />
      <div className="flex-1 bg-[#2C2C2E] rounded-lg border border-white/5" />
    </div>
  );
}

function SystemThemePreview() {
  return (
    <div className="h-16 flex overflow-hidden">
      <div className="flex-1 bg-[#F5F5F7]" />
      <div className="flex-1 bg-[#1C1C1E]" />
    </div>
  );
}
