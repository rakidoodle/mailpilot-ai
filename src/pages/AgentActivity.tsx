import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

interface AgentRun {
  id: string;
  agent: string;
  model: string;
  status: string;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  emailSubject: string;
}

const agentLabels: Record<string, string> = {
  classification: "Classification",
  summarization: "Summarization",
  reply: "Reply",
};

export function AgentActivity() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent-runs")
      .then(async (response) => {
        const data = (await response.json()) as {
          runs?: AgentRun[];
          error?: { message: string };
        };
        if (!response.ok) {
          throw new Error(data.error?.message ?? "Could not load runs.");
        }
        if (!cancelled) {
          setRuns(data.runs ?? []);
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

  return (
    <div>
      <PageHeader
        title="Agent Activity"
        description="Which agent ran, on which email, with what model and result."
      />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Latest 50 executions, newest first.
        </p>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="size-3" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading agent runs…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Bot className="mx-auto size-8 text-slate-300" />
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            No agent runs yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Open an email and press Run agents. Every execution is logged here
            with duration, token usage, and errors.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {agentLabels[run.agent] ?? run.agent}
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-slate-600">
                    {run.emailSubject}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-slate-500">
                    {run.model}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        run.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {run.durationMs ?? 0} ms
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {run.promptTokens ?? 0} / {run.completionTokens ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {run.costUsd === null
                      ? "—"
                      : `$${run.costUsd.toFixed(6)}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(run.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
