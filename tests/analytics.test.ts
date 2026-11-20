import { describe, expect, it } from "vitest";
import {
  buildDailySeries,
  summarizeAgents,
  utcToday,
  type AgentAggregateRow,
} from "../worker/analytics";

function agentRow(
  overrides: Partial<AgentAggregateRow> & Pick<AgentAggregateRow, "agent">,
): AgentAggregateRow {
  return {
    runs: 0,
    succeeded: 0,
    failed: 0,
    avg_duration_ms: null,
    timed_runs: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
    ...overrides,
  };
}

describe("summarizeAgents", () => {
  it("totals runs, rates, tokens, cost, and weighted duration", () => {
    const summary = summarizeAgents([
      agentRow({
        agent: "classification",
        runs: 2,
        succeeded: 1,
        failed: 1,
        avg_duration_ms: 100,
        timed_runs: 2,
        prompt_tokens: 10,
        completion_tokens: 5,
        cost_usd: 0.0001,
      }),
      agentRow({
        agent: "summarization",
        runs: 1,
        succeeded: 1,
        avg_duration_ms: 300,
        timed_runs: 1,
        prompt_tokens: 20,
        completion_tokens: 10,
      }),
      agentRow({
        agent: "reply",
        runs: 3,
        succeeded: 2,
        failed: 1,
        avg_duration_ms: 500,
        timed_runs: 3,
        prompt_tokens: 30,
        completion_tokens: 15,
        cost_usd: 0.0002,
      }),
    ]);

    expect(summary.totalRuns).toBe(6);
    expect(summary.succeeded).toBe(4);
    expect(summary.failed).toBe(2);
    expect(summary.successRate).toBe(67);
    expect(summary.avgDurationMs).toBe(333);
    expect(summary.promptTokens).toBe(60);
    expect(summary.completionTokens).toBe(30);
    expect(summary.costUsd).toBeCloseTo(0.0003);
    expect(summary.byAgent.map((agent) => agent.agent)).toEqual([
      "classification",
      "summarization",
      "reply",
    ]);
    expect(summary.byAgent[2].successRate).toBe(67);
  });

  it("returns null rates and averages instead of inventing zeroes", () => {
    const summary = summarizeAgents([]);
    expect(summary.totalRuns).toBe(0);
    expect(summary.successRate).toBeNull();
    expect(summary.avgDurationMs).toBeNull();
    expect(summary.byAgent).toEqual([]);

    const emptyAgent = summarizeAgents([
      agentRow({ agent: "reply", runs: 0, succeeded: 0, failed: 0 }),
    ]);
    expect(emptyAgent.byAgent[0].successRate).toBeNull();
    expect(emptyAgent.byAgent[0].avgDurationMs).toBeNull();
  });

  it("ignores untimed runs when averaging duration", () => {
    const summary = summarizeAgents([
      agentRow({
        agent: "reply",
        runs: 4,
        succeeded: 4,
        avg_duration_ms: 1000,
        timed_runs: 2,
      }),
    ]);
    expect(summary.avgDurationMs).toBe(1000);
  });

  it("keeps known agents first and appends unknown ones alphabetically", () => {
    const summary = summarizeAgents([
      agentRow({ agent: "zeta" }),
      agentRow({ agent: "reply" }),
      agentRow({ agent: "alpha" }),
    ]);
    expect(summary.byAgent.map((agent) => agent.agent)).toEqual([
      "reply",
      "alpha",
      "zeta",
    ]);
  });
});

describe("buildDailySeries", () => {
  it("fills missing days with zeroes", () => {
    const series = buildDailySeries(
      [
        { day: "2026-11-18", count: 2, failures: 0 },
        { day: "2026-11-20", count: 1, failures: 1 },
      ],
      3,
      "2026-11-20",
    );

    expect(series).toEqual([
      { date: "2026-11-18", count: 2, failures: 0 },
      { date: "2026-11-19", count: 0, failures: 0 },
      { date: "2026-11-20", count: 1, failures: 1 },
    ]);
  });

  it("crosses month boundaries in UTC", () => {
    const series = buildDailySeries([], 2, "2026-03-01");
    expect(series.map((point) => point.date)).toEqual([
      "2026-02-28",
      "2026-03-01",
    ]);
  });

  it("defaults failures to zero when a row omits them", () => {
    const series = buildDailySeries(
      [{ day: "2026-11-20", count: 4 }],
      1,
      "2026-11-20",
    );
    expect(series[0]).toEqual({
      date: "2026-11-20",
      count: 4,
      failures: 0,
    });
  });
});

describe("utcToday", () => {
  it("formats the UTC date, not the local one", () => {
    expect(utcToday(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-20");
    expect(utcToday(new Date("2026-11-21T00:30:00Z"))).toBe("2026-11-21");
  });
});
