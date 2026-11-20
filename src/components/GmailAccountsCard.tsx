import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface GmailAccount {
  id: string;
  email: string;
  connected: boolean;
  connectedAt: string;
  lastSyncedAt: string | null;
}

const callbackMessages: Record<string, string> = {
  connected: "Gmail connected.",
  denied: "Google access was denied.",
  invalid_state: "The OAuth state expired or was invalid. Try again.",
  invalid_request: "Google returned an incomplete response.",
  exchange_failed: "Token exchange failed. Check your Google credentials.",
  not_configured: "Google OAuth is not configured on the worker.",
};

export function GmailAccountsCard() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [configured, setConfigured] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchParams] = useSearchParams();

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetch("/api/gmail/status"), fetch("/api/gmail/accounts")])
      .then(async ([statusResponse, accountsResponse]) => {
        const status = (await statusResponse.json()) as {
          configured?: boolean;
          redirectUri?: string;
        };
        const data = (await accountsResponse.json()) as {
          accounts?: GmailAccount[];
          error?: { message: string };
        };
        if (!accountsResponse.ok) {
          throw new Error(data.error?.message ?? "Could not load accounts.");
        }
        if (!cancelled) {
          setConfigured(Boolean(status.configured));
          setRedirectUri(status.redirectUri ?? "");
          setAccounts(data.accounts ?? []);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Could not load accounts.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this Gmail account and delete its synced emails?")) {
      return;
    }
    const response = await fetch(`/api/gmail/accounts/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: { message: string } };
      setError(data.error?.message ?? "Could not disconnect account.");
      return;
    }
    reload();
  }

  const callbackCode = searchParams.get("gmail");
  const callbackNotice = callbackCode ? callbackMessages[callbackCode] : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Gmail accounts</h2>
      </div>

      <p className="mt-2 text-sm text-slate-500">
        Connect Gmail with read-only access. Each account is checked against the
        signed-in user before any sync or disconnect.
      </p>

      {callbackNotice && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {callbackNotice}
        </p>
      )}

      {isLoading ? (
        <p className="mt-3 text-sm text-slate-400">Loading accounts…</p>
      ) : accounts.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-sm font-medium text-slate-800">
                {account.email}
              </span>
              <span className="text-xs text-slate-400">
                {account.connected
                  ? account.lastSyncedAt
                    ? `Synced ${new Date(account.lastSyncedAt).toLocaleString()}`
                    : "Never synced"
                  : "Demo row, not connected"}
              </span>
              <button
                type="button"
                onClick={() => void disconnect(account.id)}
                className="ml-auto text-xs font-medium text-red-600 hover:text-red-700"
              >
                {account.connected ? "Disconnect" : "Remove demo row"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No accounts connected.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={configured ? "/api/gmail/connect" : undefined}
          aria-disabled={!configured}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            configured
              ? "bg-brand-600 text-white"
              : "cursor-not-allowed border border-slate-200 text-slate-400"
          }`}
        >
          <RefreshCw className="size-4" />
          {accounts.some((account) => account.connected)
            ? "Connect another account"
            : "Connect Gmail"}
        </a>
      </div>

      {!configured && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">Google OAuth is not configured.</p>
          <p className="mt-1">
            Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY
            to .dev.vars, then restart the worker.
          </p>
          {redirectUri && (
            <p className="mt-1">
              Authorized redirect URI: <code>{redirectUri}</code>
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
