import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface ScheduleReplyCardProps {
  emailId: string;
  fromAccount: string;
  to: string;
  defaultSubject: string;
  defaultBody: string;
  tone: string;
}

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Five minutes from now, rounded down to the minute, for `datetime-local`. */
function defaultSendTime(): string {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleReplyCard({
  emailId,
  fromAccount,
  to,
  defaultSubject,
  defaultBody,
  tone,
}: ScheduleReplyCardProps) {
  const [recipient, setRecipient] = useState(to);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sendAt, setSendAt] = useState(defaultSendTime);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime())) {
      setError("Pick a valid send time.");
      return;
    }
    if (!body.trim()) {
      setError("The reply body is empty.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId,
          to: recipient,
          subject,
          body,
          tone,
          scheduledAt: when.toISOString(),
          timezone,
        }),
      });
      const data = (await response.json()) as {
        scheduled?: { id: string; scheduledAt: string };
        error?: { message: string };
      };
      if (!response.ok || !data.scheduled) {
        throw new Error(data.error?.message ?? "Could not schedule reply.");
      }
      setCreatedAt(data.scheduled.scheduledAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not schedule reply.");
    } finally {
      setIsSaving(false);
    }
  }

  if (createdAt) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-emerald-900">
            Reply scheduled
          </h2>
        </div>
        <p className="mt-2 text-sm text-emerald-800">
          Queued for {new Date(createdAt).toLocaleString()} ({timezone}). Nothing
          is sent until you approve it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to="/scheduled"
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
          >
            Review and approve
          </Link>
          <button
            type="button"
            onClick={() => setCreatedAt(null)}
            className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            Schedule again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Schedule reply</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Review the draft above, adjust it here, then queue it. It waits for your
        approval on the Scheduled page before anything is sent.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-slate-600">
          From
          <input
            value={fromAccount}
            readOnly
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          To
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Subject
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Send at
          <input
            value={sendAt}
            onChange={(event) => setSendAt(event.target.value)}
            type="datetime-local"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">
            {timezone}
          </span>
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Body
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={9}
            required
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarClock className="size-4" />
          )}
          {isSaving ? "Scheduling…" : "Schedule reply"}
        </button>
      </form>
    </section>
  );
}
