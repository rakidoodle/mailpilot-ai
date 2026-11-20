import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CategoryBadge, PriorityBadge } from "../components/Badges";
import { PageHeader } from "../components/PageHeader";
import type { EmailListItem } from "../../shared/types";

type Tone = "professional" | "friendly" | "concise";

interface AgentRun {
  agent: "classification" | "summarization" | "reply";
  status: "success" | "failed";
  output?: {
    category?: string;
    reason?: string;
    summary?: string;
    actionItems?: string[];
    priority?: "High" | "Medium" | "Low";
    priorityReason?: string;
    body?: string;
  };
  usage?: { promptTokens: number; completionTokens: number };
  durationMs: number;
  errorMessage?: string;
}

const agentLabels: Record<AgentRun["agent"], string> = {
  classification: "Classification",
  summarization: "Summarization",
  reply: "Reply draft",
};

export function EmailDetail() {
  const { id } = useParams<{ id: string }>();
  const [email, setEmail] = useState<EmailListItem | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/emails/${id}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          email?: EmailListItem;
          bodyText?: string;
          error?: { message: string };
        };
        if (!response.ok || !data.email) {
          throw new Error(data.error?.message ?? "Could not load email.");
        }
        if (!cancelled) {
          setEmail(data.email);
          setBodyText(data.bodyText ?? data.email.preview);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Load failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function runAgents() {
    if (!id) return;
    setIsRunning(true);
    setError(null);
    setRuns([]);
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: id, tone }),
      });
      const data = (await response.json()) as {
        runs?: AgentRun[];
        error?: { message: string };
      };
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Agent run failed.");
      }
      setRuns(data.runs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent run failed.");
    } finally {
      setIsRunning(false);
    }
  }

  const reply = runs.find((run) => run.agent === "reply" && run.status === "success");

  async function copyReply() {
    if (!reply?.output?.body) return;
    await navigator.clipboard.writeText(reply.output.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading email…</p>;
  }

  if (!email) {
    return (
      <div>
        <p className="text-sm text-red-600">{error ?? "Email not found."}</p>
        <Link to="/inbox" className="mt-3 inline-block text-sm text-brand-600">
          Back to inbox
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/inbox"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-4" />
        Inbox
      </Link>

      <PageHeader title={email.subject} description={`${email.from} <${email.fromEmail}>`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={email.category} />
            <PriorityBadge priority={email.priority} />
            <span className="ml-auto text-xs text-slate-400">
              {new Date(email.receivedAt).toLocaleString()} · {email.account}
            </span>
          </div>

          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">
            {bodyText || email.preview}
          </p>

          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Stored summary
            </p>
            <p className="mt-1 text-sm text-slate-700">{email.summary}</p>
          </div>
        </article>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Run AI agents
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Classification, summarization, and reply draft run in sequence
              with the model selected in Settings.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-600">
              Reply tone
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="concise">Concise</option>
              </select>
            </label>

            <button
              type="button"
              onClick={runAgents}
              disabled={isRunning}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isRunning ? "Agents running…" : "Run agents"}
            </button>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>

          {runs.map((run) => (
            <section
              key={run.agent}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {agentLabels[run.agent]}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    run.status === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {run.status}
                </span>
              </div>

              {run.status === "failed" ? (
                <p className="mt-2 text-xs text-red-600">{run.errorMessage}</p>
              ) : (
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {run.output?.category && (
                    <p>
                      <span className="font-medium">{run.output.category}</span>
                      {run.output.reason ? ` — ${run.output.reason}` : ""}
                    </p>
                  )}
                  {run.output?.summary && <p>{run.output.summary}</p>}
                  {run.output?.priority && (
                    <p className="text-xs text-slate-500">
                      Priority: {run.output.priority}
                      {run.output.priorityReason
                        ? ` — ${run.output.priorityReason}`
                        : ""}
                    </p>
                  )}
                  {run.output?.actionItems && run.output.actionItems.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {run.output.actionItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {run.output?.body && (
                    <div>
                      <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm">
                        {run.output.body}
                      </p>
                      <button
                        type="button"
                        onClick={copyReply}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600"
                      >
                        <Copy className="size-3" />
                        {copied ? "Copied" : "Copy reply"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {run.usage && (
                <p className="mt-3 text-xs text-slate-400">
                  {run.durationMs} ms · {run.usage.promptTokens} in /{" "}
                  {run.usage.completionTokens} out tokens
                </p>
              )}
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}
