import { Hono } from "hono";
import {
  buildDailySeries,
  summarizeAgents,
  utcToday,
  type AgentAggregateRow,
  type DailyInputRow,
} from "../analytics";
import { DEMO_USER_ID, type Bindings } from "../env";

interface TotalsRow {
  total: number;
  unread: number;
  high_priority: number;
  accounts: number;
}

interface LabelCountRow {
  label: string;
  count: number;
}

interface ScheduledStatusRow {
  status: string;
  count: number;
  approved: number;
}

const analytics = new Hono<{ Bindings: Bindings }>();

const WINDOW_DAYS = 14;

analytics.get("/", async (c) => {
  const user = DEMO_USER_ID;

  try {
    const [totals, categories, priorities, emailDaily, agentRows, agentDaily, scheduled] =
      await Promise.all([
        c.env.DB.prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN e.unread = 1 THEN 1 ELSE 0 END), 0) AS unread,
                  COALESCE(SUM(CASE WHEN e.priority = 'High' THEN 1 ELSE 0 END), 0) AS high_priority,
                  COUNT(DISTINCT e.account_id) AS accounts
           FROM email_records e
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ?`,
        )
          .bind(user)
          .first<TotalsRow>(),

        c.env.DB.prepare(
          `SELECT e.category AS label, COUNT(*) AS count
           FROM email_records e
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ?
           GROUP BY e.category
           ORDER BY count DESC, label ASC`,
        )
          .bind(user)
          .all<LabelCountRow>(),

        c.env.DB.prepare(
          `SELECT e.priority AS label, COUNT(*) AS count
           FROM email_records e
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ?
           GROUP BY e.priority
           ORDER BY count DESC, label ASC`,
        )
          .bind(user)
          .all<LabelCountRow>(),

        c.env.DB.prepare(
          `SELECT date(e.received_at) AS day, COUNT(*) AS count
           FROM email_records e
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ? AND date(e.received_at) >= date('now', ?)
           GROUP BY day`,
        )
          .bind(user, `-${WINDOW_DAYS - 1} days`)
          .all<DailyInputRow>(),

        c.env.DB.prepare(
          `SELECT r.agent AS agent,
                  COUNT(*) AS runs,
                  COALESCE(SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END), 0) AS succeeded,
                  COALESCE(SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
                  AVG(r.duration_ms) AS avg_duration_ms,
                  COALESCE(SUM(CASE WHEN r.duration_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS timed_runs,
                  COALESCE(SUM(r.prompt_tokens), 0) AS prompt_tokens,
                  COALESCE(SUM(r.completion_tokens), 0) AS completion_tokens,
                  COALESCE(SUM(r.cost_usd), 0) AS cost_usd
           FROM agent_runs r
           JOIN email_records e ON e.id = r.email_id
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ?
           GROUP BY r.agent`,
        )
          .bind(user)
          .all<AgentAggregateRow>(),

        c.env.DB.prepare(
          `SELECT date(r.created_at) AS day, COUNT(*) AS count,
                  COALESCE(SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END), 0) AS failures
           FROM agent_runs r
           JOIN email_records e ON e.id = r.email_id
           JOIN gmail_accounts a ON a.id = e.account_id
           WHERE a.user_id = ? AND date(r.created_at) >= date('now', ?)
           GROUP BY day`,
        )
          .bind(user, `-${WINDOW_DAYS - 1} days`)
          .all<DailyInputRow>(),

        c.env.DB.prepare(
          `SELECT s.status AS status, COUNT(*) AS count,
                  COALESCE(SUM(CASE WHEN s.approved_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS approved
           FROM scheduled_emails s
           JOIN gmail_accounts a ON a.id = s.account_id
           WHERE a.user_id = ?
           GROUP BY s.status`,
        )
          .bind(user)
          .all<ScheduledStatusRow>(),
      ]);

    const counts = {
      total: 0,
      pending: 0,
      awaitingApproval: 0,
      approved: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of scheduled.results) {
      counts.total += row.count;
      if (row.status === "pending") {
        counts.pending += row.count;
        counts.approved += row.approved;
        counts.awaitingApproval += row.count - row.approved;
      } else if (row.status === "sending") {
        counts.sending += row.count;
      } else if (row.status === "sent") {
        counts.sent += row.count;
      } else if (row.status === "failed") {
        counts.failed += row.count;
      } else if (row.status === "cancelled") {
        counts.cancelled += row.count;
      }
    }

    const today = utcToday();
    const summary = summarizeAgents(agentRows.results);
    const totalEmails = totals?.total ?? 0;

    return c.json({
      asOf: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      emails: {
        total: totalEmails,
        unread: totals?.unread ?? 0,
        highPriority: totals?.high_priority ?? 0,
        accounts: totals?.accounts ?? 0,
        byCategory: categories.results,
        byPriority: priorities.results,
        daily: buildDailySeries(emailDaily.results, WINDOW_DAYS, today),
      },
      agents: {
        ...summary,
        daily: buildDailySeries(agentDaily.results, WINDOW_DAYS, today),
      },
      scheduling: counts,
    });
  } catch (error) {
    console.error("GET /api/analytics failed", error);
    return c.json(
      {
        error: {
          code: "database_error",
          message: "Could not load analytics.",
        },
      },
      500,
    );
  }
});

export default analytics;
