import { Hono } from "hono";
import type { EmailListItem, EmailsResponse } from "../shared/types";

interface Bindings {
  DB: D1Database;
}

interface EmailRow {
  id: string;
  account_email: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  preview: string;
  category: string;
  priority: string;
  summary: string;
  received_at: string;
  unread: number;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true, database: "up" });
  } catch {
    return c.json({ ok: false, database: "down" }, 503);
  }
});

app.get("/api/emails", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
         e.id,
         a.email AS account_email,
         e.sender_name,
         e.sender_email,
         e.subject,
         e.preview,
         e.category,
         e.priority,
         e.summary,
         e.received_at,
         e.unread
       FROM email_records e
       JOIN gmail_accounts a ON a.id = e.account_id
       ORDER BY e.received_at DESC`,
    ).all<EmailRow>();

    const emails: EmailListItem[] = results.map((row) => ({
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
    }));

    return c.json({ emails } satisfies EmailsResponse);
  } catch (error) {
    console.error("GET /api/emails failed", error);
    return c.json(
      { error: { code: "database_error", message: "Could not load emails." } },
      500,
    );
  }
});

app.notFound((c) => {
  return c.json(
    { error: { code: "not_found", message: "No such API route." } },
    404,
  );
});

export default app;
