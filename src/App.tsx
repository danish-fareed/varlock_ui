import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectStore } from "@/stores/projectStore";
import { useVarlockCommand } from "@/hooks/useVarlockCommand";
import type { VarlockStatus } from "@/lib/types";

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const { checkVarlock, installVarlock } = useVarlockCommand();
  const [varlockStatus, setVarlockStatus] = useState<VarlockStatus | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const status = await checkVarlock();
        setVarlockStatus(status);
        await loadProjects();
      } catch {
        // checkVarlock itself may fail if invoke is not available (dev mode)
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
        <div className="text-center">
          <div className="w-10 h-10 rounded-full bg-brand mx-auto mb-4 animate-pulse" />
          <p className="text-text-secondary text-sm">Starting Varlock...</p>
        </div>
      </div>
    );
  }

  // Varlock not installed screen
  if (varlockStatus && !varlockStatus.installed) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center max-w-md px-6">
          <div className="w-12 h-12 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4">
            <div className="w-5 h-5 rounded-full bg-brand" />
          </div>
          <h1 className="text-xl font-semibold text-text mb-2">
            Varlock CLI Not Found
          </h1>
          <p className="text-text-secondary text-sm mb-6">
            Varlock UI requires the Varlock CLI to be installed. Would you like
            to install it now via npm?
          </p>
          {installError && (
            <div className="bg-danger-light text-danger-dark text-sm px-4 py-3 rounded-lg mb-4 text-left">
              {installError}
            </div>
          )}
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-6 py-2.5 bg-brand text-white rounded-lg font-medium text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
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

  // Main app
  return <AppLayout />;
}
