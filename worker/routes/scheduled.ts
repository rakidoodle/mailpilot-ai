import { Hono } from "hono";
import { DEMO_USER_ID, type Bindings } from "../env";
import { processDueScheduled } from "../mailer";

interface CreateBody {
  emailId?: unknown;
  draftId?: unknown;
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  tone?: unknown;
  scheduledAt?: unknown;
  timezone?: unknown;
  approved?: unknown;
}

interface ScheduledRow {
  id: string;
  draft_id: string | null;
  account_id: string;
  to_email: string;
  subject: string;
  body: string;
  scheduled_at: string;
  timezone: string;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  gmail_message_id: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  account_email: string;
  account_connected: number;
  email_id: string | null;
  email_subject: string | null;
}

const scheduled = new Hono<{ Bindings: Bindings }>();

const SCHEDULED_SELECT = `SELECT
  s.id, s.draft_id, s.account_id, s.to_email, s.subject, s.body,
  s.scheduled_at, s.timezone, s.status, s.approved_at, s.sent_at,
  s.gmail_message_id, s.error_message, s.attempts, s.created_at,
  a.email AS account_email,
  a.encrypted_refresh_token IS NOT NULL AS account_connected,
  d.email_id AS email_id,
  e.subject AS email_subject
FROM scheduled_emails s
JOIN gmail_accounts a ON a.id = s.account_id
LEFT JOIN drafts d ON d.id = s.draft_id
LEFT JOIN email_records e ON e.id = d.email_id`;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function audit(
  env: Bindings,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  // Audit failures must never block the user action.
  try {
    await env.DB.prepare(
      `INSERT INTO audit_events
         (id, user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, 'scheduled_email', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        DEMO_USER_ID,
        action,
        entityId,
        JSON.stringify(metadata).slice(0, 1000),
      )
      .run();
  } catch (cause) {
    console.error("audit insert failed", cause);
  }
}

scheduled.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `${SCHEDULED_SELECT}
       WHERE a.user_id = ?
       ORDER BY
         CASE s.status
           WHEN 'sending' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'failed' THEN 2
           WHEN 'sent' THEN 3
           ELSE 4
         END,
         s.scheduled_at ASC
       LIMIT 100`,
    )
      .bind(DEMO_USER_ID)
      .all<ScheduledRow>();

    return c.json({
      scheduled: results.map((row) => ({
        id: row.id,
        emailId: row.email_id,
        emailSubject: row.email_subject,
        account: row.account_email,
        accountConnected: row.account_connected === 1,
        to: row.to_email,
        subject: row.subject,
        body: row.body,
        scheduledAt: row.scheduled_at,
        timezone: row.timezone,
        status: row.status,
        approved: row.approved_at !== null,
        approvedAt: row.approved_at,
        sentAt: row.sent_at,
        gmailMessageId: row.gmail_message_id,
        errorMessage: row.error_message,
        attempts: row.attempts,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("GET /api/scheduled failed", error);
    return c.json(
      {
        error: {
          code: "database_error",
          message: "Could not load scheduled emails.",
        },
      },
      500,
    );
  }
});

scheduled.post("/", async (c) => {
  let input: CreateBody;
  try {
    input = await c.req.json<CreateBody>();
  } catch {
    return c.json(
      { error: { code: "invalid_body", message: "Expected JSON body." } },
      400,
    );
  }

  const emailId = typeof input.emailId === "string" ? input.emailId : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const timezone =
    typeof input.timezone === "string" && input.timezone
      ? input.timezone
      : "UTC";

  if (!emailId) {
    return c.json(
      { error: { code: "invalid_email", message: "emailId is required." } },
      400,
    );
  }
  if (!body) {
    return c.json(
      { error: { code: "empty_body", message: "The reply body is empty." } },
      400,
    );
  }
  if (body.length > 20_000 || subject.length > 300 || to.length > 320) {
    return c.json(
      { error: { code: "too_long", message: "A field exceeds the size limit." } },
      400,
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return c.json(
      { error: { code: "invalid_recipient", message: "Enter a valid recipient." } },
      400,
    );
  }
  if (!isValidTimeZone(timezone)) {
    return c.json(
      { error: { code: "invalid_timezone", message: "Unknown timezone." } },
      400,
    );
  }

  const scheduledDate =
    typeof input.scheduledAt === "string" ? new Date(input.scheduledAt) : null;
  if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
    return c.json(
      {
        error: {
          code: "invalid_schedule_time",
          message: "scheduledAt must be an ISO timestamp.",
        },
      },
      400,
    );
  }
  if (scheduledDate.getTime() < Date.now() - 60_000) {
    return c.json(
      {
        error: {
          code: "schedule_in_past",
          message: "Pick a send time in the future.",
        },
      },
      400,
    );
  }

  try {
    // The email row owns the sending account; never trust a client account id.
    const email = await c.env.DB.prepare(
      `SELECT e.id, e.sender_email, e.subject, e.account_id
       FROM email_records e
       JOIN gmail_accounts a ON a.id = e.account_id
       WHERE e.id = ? AND a.user_id = ?`,
    )
      .bind(emailId, DEMO_USER_ID)
      .first<{
        id: string;
        sender_email: string;
        subject: string;
        account_id: string;
      }>();

    if (!email) {
      return c.json(
        { error: { code: "not_found", message: "Email not found." } },
        404,
      );
    }

    const draftId = crypto.randomUUID();
    const scheduledId = crypto.randomUUID();
    const tone =
      typeof input.tone === "string" && input.tone
        ? input.tone.slice(0, 30)
        : "professional";
    const approved = input.approved === true;

    await c.env.DB.prepare(
      `INSERT INTO drafts (id, email_id, tone, content)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(draftId, email.id, tone, body)
      .run();

    await c.env.DB.prepare(
      `INSERT INTO scheduled_emails
         (id, draft_id, account_id, to_email, subject, body, scheduled_at,
          timezone, status, approved_at, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        scheduledId,
        draftId,
        email.account_id,
        to || email.sender_email,
        subject || `Re: ${email.subject}`,
        body,
        scheduledDate.toISOString(),
        timezone,
        approved ? new Date().toISOString() : null,
        `${scheduledId}@mailpilot.local`,
      )
      .run();

    await audit(c.env, "email.scheduled", scheduledId, {
      emailId: email.id,
      scheduledAt: scheduledDate.toISOString(),
      approved,
    });

    return c.json(
      {
        scheduled: {
          id: scheduledId,
          scheduledAt: scheduledDate.toISOString(),
          approved,
        },
      },
      201,
    );
  } catch (error) {
    console.error("POST /api/scheduled failed", error);
    return c.json(
      {
        error: {
          code: "schedule_failed",
          message:
            error instanceof Error ? error.message : "Could not schedule email.",
        },
      },
      500,
    );
  }
});

scheduled.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await c.env.DB.prepare(
      `UPDATE scheduled_emails
       SET approved_at = datetime('now')
       WHERE id = ? AND status = 'pending' AND approved_at IS NULL
         AND account_id IN (SELECT id FROM gmail_accounts WHERE user_id = ?)`,
    )
      .bind(id, DEMO_USER_ID)
      .run();

    if (!result.meta.changes) {
      const existing = await c.env.DB.prepare(
        `SELECT s.status, s.approved_at
         FROM scheduled_emails s
         JOIN gmail_accounts a ON a.id = s.account_id
         WHERE s.id = ? AND a.user_id = ?`,
      )
        .bind(id, DEMO_USER_ID)
        .first<{ status: string; approved_at: string | null }>();

      if (!existing) {
        return c.json(
          { error: { code: "not_found", message: "Scheduled email not found." } },
          404,
        );
      }
      return c.json(
        {
          error: {
            code: "not_approvable",
            message: `Already ${existing.approved_at ? "approved" : existing.status}.`,
          },
        },
        409,
      );
    }

    await audit(c.env, "email.approved", id, {});
    return c.json({ approved: true });
  } catch (error) {
    console.error("POST /api/scheduled/:id/approve failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not approve email." } },
      500,
    );
  }
});

scheduled.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await c.env.DB.prepare(
      `UPDATE scheduled_emails
       SET status = 'cancelled'
       WHERE id = ? AND status IN ('pending', 'failed')
         AND account_id IN (SELECT id FROM gmail_accounts WHERE user_id = ?)`,
    )
      .bind(id, DEMO_USER_ID)
      .run();

    if (!result.meta.changes) {
      return c.json(
        {
          error: {
            code: "not_cancellable",
            message: "Only pending or failed emails can be cancelled.",
          },
        },
        409,
      );
    }

    await audit(c.env, "email.cancelled", id, {});
    return c.json({ cancelled: true });
  } catch (error) {
    console.error("POST /api/scheduled/:id/cancel failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not cancel email." } },
      500,
    );
  }
});

/**
 * Manual trigger for the same job the cron runs. Useful locally and as an
 * explicit "send due mail now" control. Sending still requires approval and a
 * due time; nothing here bypasses either guard.
 */
scheduled.post("/process", async (c) => {
  try {
    const result = await processDueScheduled(c.env);
    return c.json(result);
  } catch (error) {
    console.error("POST /api/scheduled/process failed", error);
    return c.json(
      {
        error: {
          code: "process_failed",
          message:
            error instanceof Error ? error.message : "Could not process queue.",
        },
      },
      500,
    );
  }
});

export default scheduled;
