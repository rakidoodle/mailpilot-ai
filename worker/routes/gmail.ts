import { Hono } from "hono";
import { decryptToken, encryptToken, pkceChallenge, randomToken } from "../crypto";
import { DEMO_USER_ID, type Bindings } from "../env";
import {
  buildAuthUrl,
  exchangeCode,
  getMessage,
  getProfileEmail,
  listMessageIds,
  mapGmailMessage,
  refreshAccessToken,
} from "../gmail";

interface AccountRow {
  id: string;
  email: string;
  encrypted_refresh_token: string | null;
  connected_at: string;
  last_synced_at: string | null;
}

const gmail = new Hono<{ Bindings: Bindings }>();

function redirectUri(env: Bindings): string {
  return `${env.APP_URL ?? "http://localhost:5173"}/api/gmail/callback`;
}

function googleConfigured(env: Bindings): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY,
  );
}

gmail.get("/status", async (c) => {
  const accounts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM gmail_accounts WHERE user_id = ?",
  )
    .bind(DEMO_USER_ID)
    .first<{ total: number }>();

  return c.json({
    configured: googleConfigured(c.env),
    redirectUri: redirectUri(c.env),
    accounts: accounts?.total ?? 0,
  });
});

gmail.get("/connect", async (c) => {
  if (!googleConfigured(c.env)) {
    return c.json(
      {
        error: {
          code: "gmail_not_configured",
          message:
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY in .dev.vars.",
        },
      },
      503,
    );
  }

  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);

  await c.env.DB.prepare(
    "INSERT INTO oauth_states (state, user_id, code_verifier) VALUES (?, ?, ?)",
  )
    .bind(state, DEMO_USER_ID, verifier)
    .run();

  return c.redirect(
    buildAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID!,
      redirectUri: redirectUri(c.env),
      state,
      codeChallenge: challenge,
    }),
  );
});

gmail.get("/callback", async (c) => {
  const settingsUrl = (c.env.APP_URL ?? "http://localhost:5173") + "/settings";
  if (!googleConfigured(c.env)) {
    return c.redirect(`${settingsUrl}?gmail=not_configured`);
  }

  const error = c.req.query("error");
  if (error) return c.redirect(`${settingsUrl}?gmail=denied`);

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.redirect(`${settingsUrl}?gmail=invalid_request`);

  // Single-use state, 10 minute lifetime, bound to the demo user.
  const stored = await c.env.DB.prepare(
    `SELECT code_verifier FROM oauth_states
     WHERE state = ? AND user_id = ? AND created_at > datetime('now', '-10 minutes')`,
  )
    .bind(state, DEMO_USER_ID)
    .first<{ code_verifier: string }>();

  await c.env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

  if (!stored) return c.redirect(`${settingsUrl}?gmail=invalid_state`);

  try {
    const tokens = await exchangeCode({
      clientId: c.env.GOOGLE_CLIENT_ID!,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirectUri: redirectUri(c.env),
      codeVerifier: stored.code_verifier,
    });

    const email = await getProfileEmail(tokens.accessToken);
    const encrypted = await encryptToken(
      tokens.refreshToken,
      c.env.TOKEN_ENCRYPTION_KEY!,
    );

    const existing = await c.env.DB.prepare(
      "SELECT id FROM gmail_accounts WHERE user_id = ? AND email = ?",
    )
      .bind(DEMO_USER_ID, email)
      .first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE gmail_accounts
         SET encrypted_refresh_token = ?, connected_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
        .bind(encrypted, existing.id, DEMO_USER_ID)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO gmail_accounts (id, user_id, email, encrypted_refresh_token)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), DEMO_USER_ID, email, encrypted)
        .run();
    }

    return c.redirect(`${settingsUrl}?gmail=connected`);
  } catch (cause) {
    console.error("Gmail callback failed", cause);
    return c.redirect(`${settingsUrl}?gmail=exchange_failed`);
  }
});

gmail.get("/accounts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, connected_at, last_synced_at,
            encrypted_refresh_token IS NOT NULL AS connected
     FROM gmail_accounts WHERE user_id = ? ORDER BY connected_at ASC`,
  )
    .bind(DEMO_USER_ID)
    .all<Omit<AccountRow, "encrypted_refresh_token"> & { connected: number }>();

  return c.json({
    accounts: results.map((row) => ({
      id: row.id,
      email: row.email,
      connected: row.connected === 1,
      connectedAt: row.connected_at,
      lastSyncedAt: row.last_synced_at,
    })),
  });
});

gmail.delete("/accounts/:id", async (c) => {
  const result = await c.env.DB.prepare(
    "DELETE FROM gmail_accounts WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), DEMO_USER_ID)
    .run();

  if (!result.meta.changes) {
    return c.json(
      { error: { code: "not_found", message: "Account not found." } },
      404,
    );
  }
  return c.json({ deleted: true });
});

gmail.post("/sync", async (c) => {
  if (!googleConfigured(c.env)) {
    return c.json(
      {
        error: {
          code: "gmail_not_configured",
          message: "Google OAuth is not configured.",
        },
      },
      503,
    );
  }

  const { results: accounts } = await c.env.DB.prepare(
    `SELECT id, email, encrypted_refresh_token
     FROM gmail_accounts
     WHERE user_id = ? AND encrypted_refresh_token IS NOT NULL`,
  )
    .bind(DEMO_USER_ID)
    .all<AccountRow>();

  if (accounts.length === 0) {
    return c.json(
      {
        error: {
          code: "no_accounts",
          message: "No connected Gmail accounts. Connect one in Settings.",
        },
      },
      400,
    );
  }

  let synced = 0;
  const results: Array<{ id: string; email: string; synced?: number; error?: string }> =
    [];

  for (const account of accounts) {
    try {
      if (!account.encrypted_refresh_token) {
        throw new Error("Stored token is missing");
      }
      const refreshToken = await decryptToken(
        account.encrypted_refresh_token,
        c.env.TOKEN_ENCRYPTION_KEY!,
      );
      const accessToken = await refreshAccessToken({
        clientId: c.env.GOOGLE_CLIENT_ID!,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET!,
        refreshToken,
      });

      const ids = await listMessageIds(accessToken, {
        query: "newer_than:30d",
        maxResults: 25,
      });

      let accountSynced = 0;
      for (const id of ids) {
        const message = await getMessage(accessToken, id);
        const email = mapGmailMessage(message);

        await c.env.DB.prepare(
          `INSERT INTO email_records
             (id, account_id, gmail_message_id, thread_id, sender_name,
              sender_email, subject, preview, body_text, received_at, unread)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(account_id, gmail_message_id) DO UPDATE SET
             subject = excluded.subject,
             preview = excluded.preview,
             body_text = excluded.body_text,
             received_at = excluded.received_at`,
        )
          .bind(
            `${account.id}:${email.gmailMessageId}`,
            account.id,
            email.gmailMessageId,
            email.threadId,
            email.senderName,
            email.senderEmail,
            email.subject,
            email.preview,
            email.bodyText,
            email.receivedAt,
          )
          .run();

        accountSynced += 1;
        synced += 1;
      }

      await c.env.DB.prepare(
        `UPDATE gmail_accounts SET last_synced_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
        .bind(account.id, DEMO_USER_ID)
        .run();

      results.push({ id: account.id, email: account.email, synced: accountSynced });
    } catch (cause) {
      console.error(`Gmail sync failed for ${account.email}`, cause);
      results.push({
        id: account.id,
        email: account.email,
        error: cause instanceof Error ? cause.message : "Sync failed",
      });
    }
  }

  return c.json({ synced, results });
});

export default gmail;
