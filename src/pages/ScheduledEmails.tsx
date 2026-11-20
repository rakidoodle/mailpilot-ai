import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";

interface ScheduledEmail {
  id: string;
  emailId: string | null;
  emailSubject: string | null;
  account: string;
  accountConnected: boolean;
  to: string;
  subject: string;
  body: string;
  scheduledAt: string;
  timezone: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  approved: boolean;
  approvedAt: string | null;
  sentAt: string | null;
  gmailMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
}

interface ProcessResult {
  processed?: number;
  sent?: number;
  failed?: number;
  skipped?: string;
  error?: { message: string };
}

function statusView(item: ScheduledEmail): { label: string; className: string } {
  if (item.status === "sent")
    return { label: "Sent", className: "bg-emerald-50 text-emerald-700" };
  if (item.status === "failed")
    return { label: "Failed", className: "bg-red-50 text-red-700" };
  if (item.status === "sending")
    return { label: "Sending", className: "bg-blue-50 text-blue-700" };
  if (item.status === "cancelled")
    return { label: "Cancelled", className: "bg-slate-100 text-slate-500" };
  return item.approved
    ? { label: "Approved", className: "bg-blue-50 text-blue-700" }
    : { label: "Awaiting approval", className: "bg-amber-50 text-amber-700" };
}

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} d`;
}

export function ScheduledEmails() {
  const [items, setItems] = useState<ScheduledEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  // Keep "due now" labels fresh without polling the API.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/scheduled")
      .then(async (response) => {
        const data = (await response.json()) as {
          scheduled?: ScheduledEmail[];
          error?: { message: string };
        };
        if (!response.ok) {
          throw new Error(data.error?.message ?? "Could not load scheduled emails.");
        }
        if (!cancelled) {
          setItems(data.scheduled ?? []);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load scheduled emails.",
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

  async function act(id: string, action: "approve" | "cancel") {
    if (
      action === "approve" &&
      !window.confirm(
        "Approve this email? It will be sent automatically once its time passes.",
      )
    ) {
      return;
    }

    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/scheduled/${id}/${action}`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: { message: string } };
      if (!response.ok) {
        throw new Error(data.error?.message ?? `Could not ${action} email.`);
      }
      setNotice(action === "approve" ? "Email approved." : "Email cancelled.");
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function processDue() {
    setIsProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/scheduled/process", { method: "POST" });
      const data = (await response.json()) as ProcessResult;
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Could not process the queue.");
      }
      if (data.skipped === "gmail_not_configured") {
        setNotice(
          "Google OAuth is not configured, so nothing could be sent. Nothing was marked as failed.",
        );
      } else {
        setNotice(
          `Checked ${data.processed ?? 0}: ${data.sent ?? 0} sent, ${
            data.failed ?? 0
          } failed.`,
        );
      }
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Processing failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  const dueApproved = items.filter(
    (item) =>
      item.status === "pending" &&
      item.approved &&
      new Date(item.scheduledAt).getTime() <= now,
  );
  const awaiting = items.filter(
    (item) => item.status === "pending" && !item.approved,
  ).length;

  return (
    <div>
      <PageHeader
        title="Scheduled Emails"
        description="Approved messages waiting to be sent, plus delivery history."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <ShieldCheck className="size-4 text-slate-500" />
        <p className="text-xs text-slate-600">
          Every send needs an approved message and a due time. Gmail also needs a
          connected account with send access.
        </p>
        <div className="ml-auto flex items-center gap-3">
          {awaiting > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              {awaiting} awaiting approval
            </span>
          )}
          <button
            type="button"
            onClick={() => void processDue()}
            disabled={isProcessing || dueApproved.length === 0}
            title={
              dueApproved.length === 0
                ? "No approved email is due yet"
                : "Send approved emails whose time has passed"
            }
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {isProcessing ? "Sending…" : `Send due now (${dueApproved.length})`}
          </button>
        </div>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading scheduled emails…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarClock className="mx-auto size-8 text-slate-300" />
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            No scheduled emails
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Run the reply agent on an email, review the draft, then schedule it
            from the email detail page.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const status = statusView(item);
            const isBusy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      To {item.to} · from {item.account}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    {new Date(item.scheduledAt).toLocaleString()} ·{" "}
                    {item.timezone}
                    {item.status === "pending" && ` (${relativeTime(item.scheduledAt)})`}
                  </span>
                  {item.sentAt && <span>Sent {new Date(item.sentAt).toLocaleString()}</span>}
                  {!item.accountConnected && (
                    <span className="text-amber-700">Account not connected</span>
                  )}
                  {item.attempts > 0 && <span>Attempts: {item.attempts}</span>}
                </div>

                {item.errorMessage && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <XCircle className="mt-0.5 size-3.5 shrink-0" />
                    {item.errorMessage}
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    Message body
                  </summary>
                  <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    {item.body}
                  </p>
                </details>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {item.status === "pending" && !item.approved && (
                    <button
                      type="button"
                      onClick={() => void act(item.id, "approve")}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Approve
                    </button>
                  )}
                  {(item.status === "pending" || item.status === "failed") && (
                    <button
                      type="button"
                      onClick={() => void act(item.id, "cancel")}
                      disabled={isBusy}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                  {item.emailId && (
                    <a
                      href={`/inbox/${item.emailId}`}
                      className="text-xs font-medium text-brand-600"
                    >
                      Source email
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
