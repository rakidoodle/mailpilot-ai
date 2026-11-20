import { Hono } from "hono";
import {
  runEmailAgents,
  TONES,
  type EmailContext,
  type Tone,
} from "./agents";
import {
  estimateCost,
  filterModels,
  getModels,
  OpenRouterError,
  type ModelInfo,
} from "./openrouter";
import type { EmailListItem, EmailsResponse } from "../shared/types";
import { DEMO_USER_ID, type Bindings } from "./env";
import gmail from "./routes/gmail";

interface EmailRow {
  id: string;
  account_email: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  preview: string;
  body_text: string | null;
  category: string;
  priority: string;
  summary: string;
  received_at: string;
  unread: number;
}

interface SettingsRow {
  openrouter_model: string | null;
}

interface AgentRunRow {
  id: string;
  agent: string;
  model: string;
  status: string;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  output_summary: string | null;
  error_message: string | null;
  created_at: string;
  email_subject: string;
}

const app = new Hono<{ Bindings: Bindings }>();

const EMAIL_SELECT = `SELECT
  e.id,
  a.email AS account_email,
  e.sender_name,
  e.sender_email,
  e.subject,
  e.preview,
  e.body_text,
  e.category,
  e.priority,
  e.summary,
  e.received_at,
  e.unread
FROM email_records e
JOIN gmail_accounts a ON a.id = e.account_id`;

function toEmail(row: EmailRow): EmailListItem {
  return {
    id: row.id,
    account: row.account_email,
    from: row.sender_name,
    fromEmail: row.sender_email,
    subject: row.subject,
    preview: row.preview,
    category: row.category as EmailListItem["category"],
    priority: row.priority as EmailListItem["priority"],
    summary: row.summary,
    receivedAt: row.received_at,
    unread: row.unread === 1,
  };
}

function toEmailContext(row: EmailRow): EmailContext {
  return {
    ...toEmail(row),
    bodyText: row.body_text ?? row.preview,
  };
}

function allowPaid(env: Bindings): boolean {
  return env.ALLOW_PAID_MODELS === "true";
}

async function readSettings(env: Bindings): Promise<SettingsRow> {
  const row = await env.DB.prepare(
    "SELECT openrouter_model FROM settings WHERE user_id = ?",
  )
    .bind(DEMO_USER_ID)
    .first<SettingsRow>();
  return row ?? { openrouter_model: null };
}

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({
      ok: true,
      database: "up",
      openrouter: c.env.OPENROUTER_API_KEY ? "configured" : "missing_key",
      gmail: c.env.GOOGLE_CLIENT_ID ? "configured" : "missing_client",
      tokenEncryption: c.env.TOKEN_ENCRYPTION_KEY ? "configured" : "missing_key",
    });
  } catch {
    return c.json({ ok: false, database: "down" }, 503);
  }
});

app.get("/api/emails", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `${EMAIL_SELECT} ORDER BY e.received_at DESC`,
    ).all<EmailRow>();

    return c.json({ emails: results.map(toEmail) } satisfies EmailsResponse);
  } catch (error) {
    console.error("GET /api/emails failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not load emails." } },
      500,
    );
  }
});

app.get("/api/emails/:id", async (c) => {
  try {
    const row = await c.env.DB.prepare(`${EMAIL_SELECT} WHERE e.id = ?`)
      .bind(c.req.param("id"))
      .first<EmailRow>();

    if (!row) {
      return c.json(
        { error: { code: "not_found", message: "Email not found." } },
        404,
      );
    }
    return c.json({ email: toEmail(row), bodyText: row.body_text ?? "" });
  } catch (error) {
    console.error("GET /api/emails/:id failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not load email." } },
      500,
    );
  }
});

app.get("/api/models", async (c) => {
  const search = c.req.query("search") ?? "";
  const freeOnly = c.req.query("freeOnly") === "true";

  try {
    const models = filterModels(await getModels(), { search, freeOnly });
    return c.json({
      models: models.slice(0, 200),
      total: models.length,
      allowPaid: allowPaid(c.env),
    });
  } catch (error) {
    console.error("GET /api/models failed", error);
    return c.json(
      {
        error: {
          code: "openrouter_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Could not load OpenRouter models.",
        },
      },
      502,
    );
  }
});

app.get("/api/settings", async (c) => {
  try {
    const settings = await readSettings(c.env);
    return c.json({ model: settings.openrouter_model, allowPaid: allowPaid(c.env) });
  } catch (error) {
    console.error("GET /api/settings failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not load settings." } },
      500,
    );
  }
});

app.put("/api/settings/model", async (c) => {
  let modelId: unknown;
  try {
    const payload = await c.req.json<{ modelId?: unknown }>();
    modelId = payload.modelId;
  } catch {
    return c.json(
      { error: { code: "invalid_body", message: "Expected JSON body." } },
      400,
    );
  }

  if (typeof modelId !== "string" || modelId.length === 0) {
    return c.json(
      { error: { code: "invalid_model", message: "modelId is required." } },
      400,
    );
  }

  try {
    const models = await getModels();
    const model = models.find((entry) => entry.id === modelId);
    if (!model) {
      return c.json(
        {
          error: {
            code: "unknown_model",
            message: "Model is not in the OpenRouter catalog.",
          },
        },
        400,
      );
    }
    if (!model.free && !allowPaid(c.env)) {
      return c.json(
        {
          error: {
            code: "paid_model_disabled",
            message:
              "Paid models are disabled. Set ALLOW_PAID_MODELS=true to enable them.",
          },
        },
        400,
      );
    }

    await c.env.DB.prepare(
      `INSERT INTO settings (user_id, openrouter_model, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         openrouter_model = excluded.openrouter_model,
         updated_at = excluded.updated_at`,
    )
      .bind(DEMO_USER_ID, modelId)
      .run();

    return c.json({ model: modelId });
  } catch (error) {
    console.error("PUT /api/settings/model failed", error);
    return c.json(
      {
        error: {
          code: "openrouter_unavailable",
          message:
            error instanceof Error ? error.message : "Could not save model.",
        },
      },
      502,
    );
  }
});

app.get("/api/agent-runs", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.agent, r.model, r.status, r.duration_ms, r.prompt_tokens,
              r.completion_tokens, r.cost_usd, r.output_summary,
              r.error_message, r.created_at, e.subject AS email_subject
       FROM agent_runs r
       JOIN email_records e ON e.id = r.email_id
       ORDER BY r.created_at DESC
       LIMIT 50`,
    ).all<AgentRunRow>();

    return c.json({
      runs: results.map((row) => ({
        id: row.id,
        agent: row.agent,
        model: row.model,
        status: row.status,
        durationMs: row.duration_ms,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        costUsd: row.cost_usd,
        outputSummary: row.output_summary,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        emailSubject: row.email_subject,
      })),
    });
  } catch (error) {
    console.error("GET /api/agent-runs failed", error);
    return c.json(
      {
        error: {
          code: "database_error",
          message: "Could not load agent runs.",
        },
      },
      500,
    );
  }
});

app.post("/api/agents/run", async (c) => {
  if (!c.env.OPENROUTER_API_KEY) {
    return c.json(
      {
        error: {
          code: "openrouter_not_configured",
          message:
            "OPENROUTER_API_KEY is not set. Add it to .dev.vars for local development.",
        },
      },
      503,
    );
  }

  let body: { emailId?: unknown; tone?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "invalid_body", message: "Expected JSON body." } },
      400,
    );
  }

  if (typeof body.emailId !== "string" || body.emailId.length === 0) {
    return c.json(
      { error: { code: "invalid_body", message: "emailId is required." } },
      400,
    );
  }

  const tone = (typeof body.tone === "string" ? body.tone : "professional") as Tone;
  if (!TONES.includes(tone)) {
    return c.json(
      {
        error: {
          code: "invalid_tone",
          message: `tone must be one of: ${TONES.join(", ")}`,
        },
      },
      400,
    );
  }

  try {
    const settings = await readSettings(c.env);
    const modelId = settings.openrouter_model;
    if (!modelId) {
      return c.json(
        {
          error: {
            code: "model_not_selected",
            message: "Select an OpenRouter model in Settings first.",
          },
        },
        400,
      );
    }

    const row = await c.env.DB.prepare(`${EMAIL_SELECT} WHERE e.id = ?`)
      .bind(body.emailId)
      .first<EmailRow>();
    if (!row) {
      return c.json(
        { error: { code: "not_found", message: "Email not found." } },
        404,
      );
    }

    const email = toEmailContext(row);
    const results = await runEmailAgents({
      apiKey: c.env.OPENROUTER_API_KEY,
      model: modelId,
      email,
      tone,
    });

    let model: ModelInfo | undefined;
    try {
      model = (await getModels()).find((entry) => entry.id === modelId);
    } catch {
      model = undefined;
    }

    for (const result of results) {
      const cost =
        model && result.usage
          ? estimateCost(model, result.usage)
          : null;

      await c.env.DB.prepare(
        `INSERT INTO agent_runs
           (id, email_id, agent, model, status, duration_ms, prompt_tokens,
            completion_tokens, cost_usd, output_summary, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          email.id,
          result.agent,
          modelId,
          result.status,
          result.durationMs,
          result.usage?.promptTokens ?? null,
          result.usage?.completionTokens ?? null,
          cost,
          result.output ? JSON.stringify(result.output).slice(0, 2000) : null,
          result.errorMessage ?? null,
        )
        .run();
    }

    return c.json({ runs: results, model: modelId, email });
  } catch (error) {
    console.error("POST /api/agents/run failed", error);
    if (error instanceof OpenRouterError && error.status === 401) {
      return c.json(
        {
          error: {
            code: "invalid_api_key",
            message: "OpenRouter rejected the API key.",
          },
        },
        502,
      );
    }
    return c.json(
      {
        error: {
          code: "agent_run_failed",
          message:
            error instanceof Error ? error.message : "Agent run failed.",
        },
      },
      500,
    );
  }
});

app.route("/api/gmail", gmail);

app.notFound((c) => {
  return c.json(
    { error: { code: "not_found", message: "No such API route." } },
    404,
  );
});

export default app;
