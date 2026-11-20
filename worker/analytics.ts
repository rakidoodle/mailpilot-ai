export interface AgentAggregateRow {
  agent: string;
  runs: number;
  succeeded: number | null;
  failed: number | null;
  avg_duration_ms: number | null;
  timed_runs: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
}

export interface AgentStat {
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

export interface AgentSummary {
  totalRuns: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  avgDurationMs: number | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  byAgent: AgentStat[];
}

export interface DailyInputRow {
  day: string;
  count: number;
  failures?: number | null;
}

export interface DailyPoint {
  date: string;
  count: number;
  failures: number;
}

const AGENT_ORDER = ["classification", "summarization", "reply"];

function rate(succeeded: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((succeeded / total) * 100);
}

/**
 * Collapses one-row-per-agent SQL aggregates into the shape the dashboard
 * needs. Rates and averages are null when there is nothing to divide by, so
 * the UI can render "—" instead of a made-up zero.
 */
export function summarizeAgents(rows: AgentAggregateRow[]): AgentSummary {
  const byAgent = rows
    .map<AgentStat>((row) => {
      const runs = row.runs ?? 0;
      const succeeded = row.succeeded ?? 0;
      const failed = row.failed ?? 0;
      return {
        agent: row.agent,
        runs,
        succeeded,
        failed,
        successRate: rate(succeeded, runs),
        avgDurationMs:
          row.avg_duration_ms === null
            ? null
            : Math.round(row.avg_duration_ms),
        promptTokens: row.prompt_tokens ?? 0,
        completionTokens: row.completion_tokens ?? 0,
        costUsd: row.cost_usd ?? 0,
      };
    })
    .sort((a, b) => {
      const left = AGENT_ORDER.indexOf(a.agent);
      const right = AGENT_ORDER.indexOf(b.agent);
      if (left !== -1 || right !== -1) {
        return (left === -1 ? AGENT_ORDER.length : left) -
          (right === -1 ? AGENT_ORDER.length : right);
      }
      return a.agent.localeCompare(b.agent);
    });

  const totalRuns = byAgent.reduce((sum, agent) => sum + agent.runs, 0);
  const succeeded = byAgent.reduce((sum, agent) => sum + agent.succeeded, 0);
  const failed = byAgent.reduce((sum, agent) => sum + agent.failed, 0);

  // Weighted average: each agent average counts once per timed run it measured.
  const timedRunsByAgent = new Map(
    rows.map((row) => [row.agent, row.timed_runs ?? 0]),
  );
  const timed = byAgent.map((agent) => ({
    agent,
    timedRuns: timedRunsByAgent.get(agent.agent) ?? 0,
  }));
  const timedRuns = timed.reduce((sum, entry) => sum + entry.timedRuns, 0);
  const avgDurationMs =
    timedRuns === 0
      ? null
      : Math.round(
          timed.reduce(
            (sum, entry) =>
              sum + (entry.agent.avgDurationMs ?? 0) * entry.timedRuns,
            0,
          ) / timedRuns,
        );

  return {
    totalRuns,
    succeeded,
    failed,
    successRate: rate(succeeded, totalRuns),
    avgDurationMs,
    promptTokens: byAgent.reduce((sum, agent) => sum + agent.promptTokens, 0),
    completionTokens: byAgent.reduce(
      (sum, agent) => sum + agent.completionTokens,
      0,
    ),
    costUsd: byAgent.reduce((sum, agent) => sum + agent.costUsd, 0),
    byAgent,
  };
}

/**
 * Returns exactly `days` UTC buckets ending on `today` (YYYY-MM-DD), inserting
 * zeroes for days D1 has no rows for. Missing days must be visible: a flat
 * chart is honest, a gap is not.
 */
export function buildDailySeries(
  rows: DailyInputRow[],
  days: number,
  today: string,
): DailyPoint[] {
  const counts = new Map<string, DailyInputRow>();
  for (const row of rows) counts.set(row.day, row);

  const end = new Date(`${today}T00:00:00Z`);
  const series: DailyPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const row = counts.get(key);
    series.push({
      date: key,
      count: row?.count ?? 0,
      failures: row?.failures ?? 0,
    });
  }

  return series;
}

/** UTC day string used to anchor the series, matching D1's date() output. */
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
