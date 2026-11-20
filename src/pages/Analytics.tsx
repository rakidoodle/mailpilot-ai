import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarClock,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";

interface DailyPoint {
  date: string;
  count: number;
  failures: number;
}

interface AgentStat {
  agent: string;
  runs: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  avgDurationMs: number | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

interface Analytics {
  asOf: string;
  windowDays: number;
  emails: {
    total: number;
    unread: number;
    highPriority: number;
    accounts: number;
    byCategory: Array<{ label: string; count: number }>;
    byPriority: Array<{ label: string; count: number }>;
    daily: DailyPoint[];
  };
  agents: {
    totalRuns: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
    avgDurationMs: number | null;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    byAgent: AgentStat[];
    daily: DailyPoint[];
  };
  scheduling: {
    total: number;
    pending: number;
    awaitingApproval: number;
    approved: number;
    sending: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
}

const agentLabels: Record<string, string> = {
  classification: "Classification",
  summarization: "Summarization",
  reply: "Reply draft",
};

const outcomeStyles = [
  { key: "sent", label: "Sent", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  { key: "approved", label: "Approved", dot: "bg-blue-500", bar: "bg-blue-500" },
  {
    key: "awaitingApproval",
    label: "Awaiting approval",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  { key: "sending", label: "Sending", dot: "bg-indigo-500", bar: "bg-indigo-500" },
  { key: "failed", label: "Failed", dot: "bg-red-500", bar: "bg-red-500" },
  { key: "cancelled", label: "Cancelled", dot: "bg-slate-300", bar: "bg-slate-300" },
] as const;

function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
}

function formatDay(date: string): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function successTone(rate: number | null): string {
  if (rate === null) return "bg-slate-200";
  if (rate >= 90) return "bg-emerald-500";
  if (rate >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function DailyBars({
  points,
  label,
  tone,
}: {
  points: DailyPoint[];
  label: string;
  tone: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.count));

  return (
    <div>
      <div
        className="flex h-36 items-end gap-1"
        role="img"
        aria-label={label}
      >
        {points.map((point) => (
          <div
            key={point.date}
            className="flex h-full flex-1 items-end"
            title={`${formatDay(point.date)}: ${point.count}${
              point.failures ? ` (${point.failures} failed)` : ""
            }`}
          >
            <div
              className={`w-full rounded-t ${tone}`}
              style={{ height: `${(point.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{formatDay(points[0]?.date ?? "")}</span>
        <span>{formatDay(points[points.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Mail;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

export function Analytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/analytics")
      .then(async (response) => {
        const payload = (await response.json()) as Analytics & {
          error?: { message: string };
        };
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Could not load analytics.");
        }
        if (!cancelled) {
          setData(payload);
          setError(null);
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
  }, [reloadKey]);

  const totalTokens = data
    ? data.agents.promptTokens + data.agents.completionTokens
    : 0;
  const isEmpty =
    data !== null &&
    data.emails.total === 0 &&
    data.agents.totalRuns === 0 &&
    data.scheduling.total === 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Email volume, agent quality, and delivery outcomes — read straight from D1."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <BarChart3 className="size-3.5" />
          {data
            ? `Last ${data.windowDays} days · updated ${new Date(
                data.asOf,
              ).toLocaleTimeString()}`
            : "Live from D1 — no placeholder numbers"}
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={isLoading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading && !data ? (
        <p className="text-sm text-slate-500">Loading analytics…</p>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">
            Analytics could not load.
          </p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            Try again
          </button>
        </div>
      ) : !data ? null : isEmpty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <BarChart3 className="mx-auto size-8 text-slate-300" />
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            No analytics yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            This page only reports real activity. Connect Gmail to sync email or
            run the agents from an email, then come back.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Emails"
              value={data.emails.total}
              hint={`${data.emails.unread} unread · ${data.emails.accounts} accounts`}
              icon={Mail}
            />
            <Kpi
              label="Agent runs"
              value={data.agents.totalRuns}
              hint={
                data.agents.successRate === null
                  ? "No runs yet"
                  : `${data.agents.successRate}% success · ${data.agents.failed} failed`
              }
              icon={Bot}
            />
            <Kpi
              label="Scheduled sent"
              value={data.scheduling.sent}
              hint={`${data.scheduling.awaitingApproval} awaiting approval · ${data.scheduling.failed} failed`}
              icon={Send}
            />
            <Kpi
              label="Est. AI cost"
              value={formatCost(data.agents.costUsd)}
              hint={`${totalTokens.toLocaleString()} tokens across agents`}
              icon={Sparkles}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Email volume
                </h2>
                <span className="text-xs text-slate-400">
                  {data.emails.highPriority} high priority
                </span>
              </div>
              <div className="mt-4">
                <DailyBars
                  points={data.emails.daily}
                  label={`Emails received per day over the last ${data.windowDays} days`}
                  tone="bg-brand-500/80"
                />
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Agent quality
              </h2>
              <div className="mt-4 space-y-4">
                {data.agents.byAgent.length === 0 ? (
                  <p className="text-sm text-slate-400">No agent runs yet.</p>
                ) : (
                  data.agents.byAgent.map((agent) => (
                    <div key={agent.agent}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">
                          {agentLabels[agent.agent] ?? agent.agent}
                        </span>
                        <span className="font-medium text-slate-900">
                          {agent.successRate === null
                            ? "—"
                            : `${agent.successRate}%`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${successTone(
                            agent.successRate,
                          )}`}
                          style={{ width: `${agent.successRate ?? 0}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {agent.runs} runs · avg{" "}
                        {agent.avgDurationMs === null
                          ? "—"
                          : `${(agent.avgDurationMs / 1000).toFixed(1)}s`}{" "}
                        ·{" "}
                        {(agent.promptTokens + agent.completionTokens).toLocaleString()}{" "}
                        tokens
                      </p>
                    </div>
                  ))
                )}
              </div>
              {data.agents.avgDurationMs !== null && (
                <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  Overall average {(data.agents.avgDurationMs / 1000).toFixed(1)}s
                  per agent run.
                </p>
              )}
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Agent runs
                </h2>
                <span className="text-xs text-slate-400">
                  {data.agents.succeeded} succeeded · {data.agents.failed} failed
                </span>
              </div>
              <div className="mt-4">
                <DailyBars
                  points={data.agents.daily}
                  label={`Agent runs per day over the last ${data.windowDays} days`}
                  tone="bg-violet-500/80"
                />
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Category distribution
              </h2>
              <div className="mt-4 space-y-3">
                {data.emails.byCategory.length === 0 ? (
                  <p className="text-sm text-slate-400">No emails yet.</p>
                ) : (
                  data.emails.byCategory.map((category) => {
                    const max = Math.max(
                      1,
                      ...data.emails.byCategory.map((entry) => entry.count),
                    );
                    const share = data.emails.total
                      ? Math.round((category.count / data.emails.total) * 100)
                      : 0;
                    return (
                      <div key={category.label}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{category.label}</span>
                          <span className="text-slate-500">
                            {category.count} · {share}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{
                              width: `${(category.count / max) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Delivery outcomes
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                {data.scheduling.total} scheduled messages
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {outcomeStyles.map((outcome) => (
                <div
                  key={outcome.key}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${outcome.dot}`} />
                    <span className="text-xs font-medium text-slate-600">
                      {outcome.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {data.scheduling[outcome.key]}
                  </p>
                </div>
              ))}
            </div>

            {data.scheduling.total > 0 && (
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {outcomeStyles.map((outcome) => {
                  const value = data.scheduling[outcome.key];
                  if (value === 0) return null;
                  return (
                    <div
                      key={outcome.key}
                      className={outcome.bar}
                      style={{
                        width: `${(value / data.scheduling.total) * 100}%`,
                      }}
                      title={`${outcome.label}: ${value}`}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
