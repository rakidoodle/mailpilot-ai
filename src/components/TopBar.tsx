import { useEffect, useState } from "react";
import { Menu, RefreshCw, Search } from "lucide-react";

interface TopBarProps {
  onOpenSidebar: () => void;
}

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const [accountCount, setAccountCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gmail/accounts")
      .then((response) => response.json())
      .then((data: { accounts?: Array<{ connected?: boolean }> }) => {
        if (!cancelled) {
          setAccountCount(
            (data.accounts ?? []).filter((account) => account.connected).length,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAccountCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function syncInbox() {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/gmail/sync", { method: "POST" });
      const data = (await response.json()) as {
        error?: { message: string };
        synced?: number;
      };
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Sync failed.");
      }
      window.location.reload();
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : "Sync failed.");
      setIsSyncing(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        aria-label="Open navigation"
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={onOpenSidebar}
      >
        <Menu className="size-5" />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search emails"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {syncError && (
        <p className="ml-auto hidden max-w-56 truncate text-xs text-red-600 sm:block">
          {syncError}
        </p>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 sm:inline">
          Demo data
        </span>
        <button
          type="button"
          onClick={() => void syncInbox()}
          disabled={isSyncing || accountCount === 0}
          title={
            accountCount === 0
              ? "Connect Gmail in Settings to enable sync"
              : "Sync the last 30 days from Gmail"
          }
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing…" : "Sync Inbox"}
        </button>
      </div>
    </header>
  );
}
