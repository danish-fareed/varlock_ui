import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectStore } from "@/stores/projectStore";
import { useVarlockCommand } from "@/hooks/useVarlockCommand";
import { useVaultStore } from "@/stores/vaultStore";
import { VaultUnlockScreen } from "@/components/vault/VaultUnlockScreen";
import type { VarlockStatus } from "@/lib/types";
import { Check, Terminal } from "lucide-react";

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const { checkVarlock, installVarlock } = useVarlockCommand();
  const [varlockStatus, setVarlockStatus] = useState<VarlockStatus | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const vaultStatus = useVaultStore((s) => s.status);
  const checkVaultStatus = useVaultStore((s) => s.checkStatus);
  const tryAutoUnlock = useVaultStore((s) => s.tryAutoUnlock);

  useEffect(() => {
    const init = async () => {
      try {
        const status = await checkVarlock();
        setVarlockStatus(status);
        await loadProjects();
        // Check vault status
        await checkVaultStatus();
        // Try auto-unlock from keychain
        await tryAutoUnlock();
      } catch {
        setVarlockStatus({ installed: false, version: null, path: null });
      } finally {
        setChecking(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      await installVarlock();
      const status = await checkVarlock();
      setVarlockStatus(status);
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  // Loading state
  if (checking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-accent mx-auto mb-4 animate-pulse-soft flex items-center justify-center">
            <Check size={18} strokeWidth={1.5} color="white" aria-hidden="true" />
          </div>
          <p className="text-text-secondary text-sm">Starting Varlock...</p>
        </div>
      </div>
    );
  }

  // Varlock not installed screen
  if (varlockStatus && !varlockStatus.installed) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center max-w-md px-6 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-accent-light border border-accent/15 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center">
              <Terminal size={14} strokeWidth={1.5} color="white" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-text mb-2">
            Varlock CLI Not Found
          </h1>
          <p className="text-text-secondary text-sm mb-6 leading-6">
            Varlock UI requires the Varlock CLI to be installed. Would you like
            to install it now via npm?
          </p>
          {installError && (
            <div className="bg-danger-light text-danger-dark text-sm px-4 py-3 rounded-xl mb-4 text-left border border-danger/15">
              {installError}
            </div>
          )}
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {installing ? "Installing..." : "Install Varlock"}
          </button>
          <p className="text-text-muted text-xs mt-4">
            Runs: npm install -g varlock
          </p>
        </div>
      </div>
    );
  }

  // Vault unlock gate — show unlock screen if vault needs setup or is locked
  if (vaultStatus && (!vaultStatus.initialized || !vaultStatus.unlocked)) {
    return <VaultUnlockScreen />;
  }

  // Main app
  return <AppLayout />;
}

