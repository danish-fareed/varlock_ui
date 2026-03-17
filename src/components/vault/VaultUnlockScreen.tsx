import { useState, useEffect } from "react";
import { useVaultStore } from "../../stores/vaultStore";
import { CircleAlert, Lock } from "lucide-react";

export function VaultUnlockScreen() {
  const { status, loading, error, setup, unlock, tryAutoUnlock, clearError, checkStatus } =
    useVaultStore();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [autoUnlockAttempted, setAutoUnlockAttempted] = useState(false);

  const isSetup = status?.initialized === false;

  // Try auto-unlock from keychain on mount
  useEffect(() => {
    if (!autoUnlockAttempted && status?.hasKeychainKey) {
      setAutoUnlockAttempted(true);
      tryAutoUnlock();
    }
  }, [status, autoUnlockAttempted, tryAutoUnlock]);

  // Load status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (isSetup) {
      if (password !== confirmPassword) {
        useVaultStore.setState({ error: "Passwords do not match" });
        return;
      }
      if (password.length < 8) {
        useVaultStore.setState({
          error: "Password must be at least 8 characters",
        });
        return;
      }
      try {
        await setup(password);
      } catch {
        // Error already set in store
      }
    } else {
      try {
        await unlock(password, remember);
      } catch {
        // Error already set in store
      }
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-surface-secondary">
      <div className="w-full max-w-sm px-6 animate-fade-in">
        <div className="bg-surface rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.08)] p-8">
          {/* Devpad logo */}
          <div className="h-8 flex items-center justify-center mx-auto mb-6">
            <img src="/logo.svg" alt="Devpad Logo" className="h-full w-auto object-contain text-text" />
          </div>

          <p className="text-sm text-text-secondary text-center mb-5 leading-relaxed">
            {isSetup
              ? "Set a master password to encrypt your environment secrets."
              : "Enter your master password to access your encrypted environment variables."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="vault-password" className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 block">
                Master Password
              </label>
              <input
                id="vault-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-4 rounded-xl border border-border bg-surface-secondary text-[13px] focus:border-accent outline-none transition-all placeholder:text-text-muted/50"
                autoFocus
                disabled={loading}
              />
            </div>

            {isSetup && (
              <div className="space-y-1.5">
                <label htmlFor="vault-confirm" className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 block">
                  Confirm Password
                </label>
                <input
                  id="vault-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-surface-secondary text-[13px] focus:border-accent outline-none transition-all placeholder:text-text-muted/50"
                  disabled={loading}
                />
              </div>
            )}

            {!isSetup && (
              <label className="flex items-center gap-2 cursor-pointer group px-1 pt-1">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent focus:ring-offset-0 bg-surface-secondary accent-accent cursor-pointer"
                />
                <span className="text-[13px] font-medium text-text-secondary group-hover:text-text transition-colors select-none">
                  Remember on this device
                </span>
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-danger-light text-danger-dark text-sm px-4 py-3 rounded-xl border border-danger/20 mt-2">
                <CircleAlert size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full h-10 rounded-xl bg-accent text-white text-[13px] font-bold hover:bg-accent-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
              disabled={loading || !password}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSetup ? (
                "Create Vault"
              ) : (
                "Unlock Vault"
              )}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-6 pt-5 border-t border-border-light/60">
            <Lock size={14} className="text-green-500" />
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
              XChaCha20-Poly1305 Encrypted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
