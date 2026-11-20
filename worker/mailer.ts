import { decryptToken } from "./crypto";
import type { Bindings } from "./env";
import { refreshAccessToken } from "./gmail";

const encoder = new TextEncoder();

interface DueRow {
  id: string;
  account_id: string;
  user_id: string;
  to_email: string;
  subject: string;
  body: string;
  message_id: string | null;
  account_email: string;
  encrypted_refresh_token: string | null;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(bytes: Uint8Array): string {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderValue(value: string): string {
  // Non-ASCII headers must be RFC 2047 encoded.
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(encoder.encode(value))}?=`;
}

function wrapBase64(value: string, width = 76): string {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }
  return lines.join("\r\n");
}

function stripNewlines(value: string): string {
  // Addresses come from validated input, but headers must never contain a
  // line break: that would allow header injection (extra Bcc, etc.).
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildRawEmail(options: {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  date?: Date;
}): string {
  const date = options.date ?? new Date();
  const headers = [
    `From: ${stripNewlines(options.from)}`,
    `To: ${stripNewlines(options.to)}`,
    `Subject: ${encodeHeaderValue(stripNewlines(options.subject))}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${stripNewlines(options.messageId)}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${wrapBase64(base64(encoder.encode(options.body)))}`;
}

export function encodeRawMessage(raw: string): string {
  return base64Url(encoder.encode(raw));
}

async function sendWithGmail(
  accessToken: string,
  raw: string,
): Promise<{ id: string }> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodeRawMessage(raw) }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Gmail send returned no message id");
  return { id: data.id };
}

async function recordAudit(
  env: Bindings,
  row: DueRow,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_events
         (id, user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, 'scheduled_email', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        row.user_id,
        action,
        row.id,
        JSON.stringify(metadata).slice(0, 1000),
      )
      .run();
  } catch (cause) {
    console.error("audit insert failed", cause);
  }
}

/**
 * Sends every approved email whose time has passed.
 *
 * Duplicate protection:
 * - a row is claimed atomically (`status = 'sending'`) before any network call
 * - the claim only matches `status = 'pending'`, so concurrent cron runs skip it
 * - failures are marked `failed` and never retried automatically, because a
 *   timed-out request may still have delivered the message
 */
export async function processDueScheduled(env: Bindings): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped?: string;
}> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return { processed: 0, sent: 0, failed: 0, skipped: "gmail_not_configured" };
  }

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.account_id, a.user_id, s.to_email, s.subject, s.body,
            s.message_id, a.email AS account_email, a.encrypted_refresh_token
     FROM scheduled_emails s
     JOIN gmail_accounts a ON a.id = s.account_id
     WHERE s.status = 'pending'
       AND s.approved_at IS NOT NULL
       AND s.scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     ORDER BY s.scheduled_at ASC
     LIMIT 20`,
  ).all<DueRow>();

  let sent = 0;
  let failed = 0;
  let processed = 0;

  for (const row of results) {
    const claim = await env.DB.prepare(
      `UPDATE scheduled_emails
       SET status = 'sending', attempts = attempts + 1,
           last_attempt_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(row.id)
      .run();

    if (!claim.meta.changes) continue;
    processed += 1;

    try {
      if (!row.encrypted_refresh_token) {
        throw new Error("Gmail account is not connected");
      }
      const refreshToken = await decryptToken(
        row.encrypted_refresh_token,
        env.TOKEN_ENCRYPTION_KEY,
      );
      const accessToken = await refreshAccessToken({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        refreshToken,
      });

      const raw = buildRawEmail({
        from: row.account_email,
        to: row.to_email,
        subject: row.subject,
        body: row.body,
        messageId: row.message_id ?? `${row.id}@mailpilot.local`,
      });
      const result = await sendWithGmail(accessToken, raw);

      await env.DB.prepare(
        `UPDATE scheduled_emails
         SET status = 'sent', sent_at = datetime('now'), gmail_message_id = ?,
             error_message = NULL
         WHERE id = ?`,
      )
        .bind(result.id, row.id)
        .run();
      await recordAudit(env, row, "email.sent", { gmailMessageId: result.id });
      sent += 1;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown send failure";
      await env.DB.prepare(
        `UPDATE scheduled_emails
         SET status = 'failed', error_message = ?
         WHERE id = ?`,
      )
        .bind(message.slice(0, 500), row.id)
        .run();
      await recordAudit(env, row, "email.send_failed", { error: message.slice(0, 300) });
      failed += 1;
    }
  }

  return { processed, sent, failed };
}
