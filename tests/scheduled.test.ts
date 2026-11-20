import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../worker/env";
import worker from "../worker/index";
import {
  buildRawEmail,
  encodeRawMessage,
  processDueScheduled,
} from "../worker/mailer";

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

const row = {
  id: "sch_1",
  account_id: "acc_1",
  user_id: "usr_demo",
  to_email: "amara@example.com",
  subject: "Re: Landing page revisions",
  body: "Thanks — shipping Friday.",
  message_id: "sch_1@mailpilot.local",
  account_email: "hello@northwind.studio",
  encrypted_refresh_token: "malformed-token",
};

interface FakeOptions {
  rows?: unknown[];
  claimChanges?: number;
  configured?: boolean;
}

function fakeEnv(options: FakeOptions = {}) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const rows = options.rows ?? [row];
  const claimChanges = options.claimChanges ?? 1;

  function run(sql: string, args: unknown[]) {
    calls.push({ sql, args });
    return {
      meta: {
        changes: sql.includes("SET status = 'sending'") ? claimChanges : 0,
      },
    };
  }

  const DB = {
    prepare(sql: string) {
      return {
        async all() {
          calls.push({ sql, args: [] });
          return { results: rows };
        },
        async first() {
          return null;
        },
        async run() {
          return run(sql, []);
        },
        bind(...args: unknown[]) {
          return {
            async all() {
              calls.push({ sql, args });
              return { results: rows };
            },
            async first() {
              return null;
            },
            async run() {
              return run(sql, args);
            },
          };
        },
      };
    },
  };

  const env = {
    DB,
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    TOKEN_ENCRYPTION_KEY: "test-key",
  } as unknown as Bindings;

  if (options.configured === false) {
    delete (env as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID;
  }

  return { env, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("raw email building", () => {
  it("writes headers and a base64 body with CRLF separators", () => {
    const raw = buildRawEmail({
      from: "hello@northwind.studio",
      to: "amara@example.com",
      subject: "Re: Landing page revisions",
      body: "Thanks — shipping Friday.",
      messageId: "sch_1@mailpilot.local",
      date: new Date("2026-11-20T10:00:00Z"),
    });

    const [headerBlock, bodyBlock] = raw.split("\r\n\r\n");
    expect(headerBlock).toContain("From: hello@northwind.studio");
    expect(headerBlock).toContain("To: amara@example.com");
    expect(headerBlock).toContain("Subject: Re: Landing page revisions");
    expect(headerBlock).toContain("Message-ID: <sch_1@mailpilot.local>");
    expect(headerBlock).toContain("MIME-Version: 1.0");
    expect(headerBlock).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decodeBase64(bodyBlock.replace(/\r\n/g, ""))).toBe(
      "Thanks — shipping Friday.",
    );
  });

  it("RFC 2047 encodes non-ASCII subjects and keeps ASCII intact", () => {
    const encoded = buildRawEmail({
      from: "a@example.com",
      to: "b@example.com",
      subject: "Café update ✓",
      body: "Body",
      messageId: "m@mailpilot.local",
    });
    expect(encoded).toContain("Subject: =?UTF-8?B?");

    const plain = buildRawEmail({
      from: "a@example.com",
      to: "b@example.com",
      subject: "Plain subject",
      body: "Body",
      messageId: "m@mailpilot.local",
    });
    expect(plain).toContain("Subject: Plain subject");
  });

  it("url-safe encodes the raw message for the Gmail API", () => {
    const raw = "From: a@example.com\r\n\r\nHello";
    const encoded = encodeRawMessage(raw);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64(encoded.replace(/-/g, "+").replace(/_/g, "/"))).toBe(raw);
  });

  it("strips line breaks so headers cannot be injected", () => {
    const raw = buildRawEmail({
      from: "a@example.com",
      to: "victim@example.com\r\nBcc: attacker@example.com",
      subject: "Hello\r\nBcc: attacker@example.com",
      body: "Body",
      messageId: "m@mailpilot.local\r\nX-Evil: 1",
    });
    const [headerBlock] = raw.split("\r\n\r\n");
    const headerLines = headerBlock.split("\r\n");
    expect(headerLines.some((line) => line.startsWith("Bcc:"))).toBe(false);
    expect(headerLines.some((line) => line.startsWith("X-Evil:"))).toBe(false);
    expect(headerLines).toHaveLength(8);
  });
});

describe("processDueScheduled", () => {
  it("skips cleanly when Google credentials are missing", async () => {
    const { env } = fakeEnv({ configured: false });
    await expect(processDueScheduled(env)).resolves.toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: "gmail_not_configured",
    });
  });

  it("does nothing when another run already claimed the row", async () => {
    const { env, calls } = fakeEnv({ claimChanges: 0 });
    await expect(processDueScheduled(env)).resolves.toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
    });
    expect(calls.some((call) => call.sql.includes("SET status = 'failed'"))).toBe(
      false,
    );
  });

  it("marks the row failed when the stored token cannot be decrypted", async () => {
    const { env, calls } = fakeEnv({ claimChanges: 1 });
    const result = await processDueScheduled(env);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    const failure = calls.find((call) =>
      call.sql.includes("SET status = 'failed'"),
    );
    expect(failure?.args[0]).toMatch(/Malformed encrypted token/);
    expect(
      calls.some((call) => call.sql.includes("INSERT INTO audit_events")),
    ).toBe(true);
  });
});

describe("cron handler", () => {
  it("runs the same due-queue job as the API", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { env, calls } = fakeEnv({ rows: [] });

    await worker.scheduled!({} as unknown as ScheduledController, env);

    expect(calls.some((call) => call.sql.includes("FROM scheduled_emails"))).toBe(
      true,
    );
    expect(log).toHaveBeenCalledWith("cron scheduled-send", {
      processed: 0,
      sent: 0,
      failed: 0,
    });
  });
});
