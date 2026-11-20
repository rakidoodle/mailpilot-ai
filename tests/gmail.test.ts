import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken, pkceChallenge, randomToken } from "../worker/crypto";
import {
  buildAuthUrl,
  extractBodyText,
  GMAIL_SCOPES,
  mapGmailMessage,
  parseAddress,
  refreshAccessToken,
} from "../worker/gmail";

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("token encryption", () => {
  it("round-trips a refresh token", async () => {
    const encrypted = await encryptToken("1//refresh-token", "test-secret");
    expect(encrypted).not.toContain("refresh-token");
    expect(encrypted.split(".")).toHaveLength(2);
    await expect(decryptToken(encrypted, "test-secret")).resolves.toBe(
      "1//refresh-token",
    );
  });

  it("rejects a wrong secret", async () => {
    const encrypted = await encryptToken("secret-token", "key-a");
    await expect(decryptToken(encrypted, "key-b")).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptToken("secret-token", "key-a");
    const [iv, cipher] = encrypted.split(".");
    const tampered = `${iv}.${cipher.slice(0, -2)}AA`;
    await expect(decryptToken(tampered, "key-a")).rejects.toThrow();
  });

  it("refuses a missing secret", async () => {
    await expect(encryptToken("x", "")).rejects.toThrow(/secret/);
  });
});

describe("pkce and state", () => {
  it("produces url-safe tokens", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomToken(16)).not.toBe(randomToken(16));
  });

  it("derives a stable S256 challenge", async () => {
    const first = await pkceChallenge("verifier-value");
    const second = await pkceChallenge("verifier-value");
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await pkceChallenge("other")).not.toBe(first);
  });
});

describe("Gmail auth URL", () => {
  it("requests offline read-only access with PKCE", () => {
    const url = new URL(
      buildAuthUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:5173/api/gmail/callback",
        state: "state-123",
        codeChallenge: "challenge-abc",
      }),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPES.join(" "));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/api/gmail/callback",
    );
  });
});

describe("message mapping", () => {
  it("parses display names and bare addresses", () => {
    expect(parseAddress('"Amara Okafor" <amara@example.com>')).toEqual({
      name: "Amara Okafor",
      email: "amara@example.com",
    });
    expect(parseAddress("billing@example.com")).toEqual({
      name: "billing@example.com",
      email: "billing@example.com",
    });
  });

  it("prefers text/plain and decodes base64url", () => {
    const text = extractBodyText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: base64Url("Plain body") } },
        { mimeType: "text/html", body: { data: base64Url("<p>HTML body</p>") } },
      ],
    });
    expect(text).toBe("Plain body");
  });

  it("falls back to stripped HTML", () => {
    const html = extractBodyText({
      mimeType: "text/html",
      body: { data: base64Url("<p>Hello <b>there</b></p><script>x()</script>") },
    });
    expect(html).toBe("Hello there");
  });

  it("maps headers, snippet, and date", () => {
    const mapped = mapGmailMessage({
      id: "18abc",
      threadId: "18abc",
      snippet: "Two changes before Friday.",
      internalDate: "1795140000000",
      payload: {
        headers: [
          { name: "From", value: "Amara Okafor <amara@example.com>" },
          { name: "Subject", value: "Landing page revisions" },
        ],
        mimeType: "text/plain",
        body: { data: base64Url("Full body text") },
      },
    });

    expect(mapped.gmailMessageId).toBe("18abc");
    expect(mapped.senderName).toBe("Amara Okafor");
    expect(mapped.senderEmail).toBe("amara@example.com");
    expect(mapped.subject).toBe("Landing page revisions");
    expect(mapped.receivedAt).toBe(
      new Date(1795140000000).toISOString(),
    );
  });
});

describe("token refresh", () => {
  it("returns a new access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: "ya29.new" }), {
          status: 200,
        }),
      ),
    );

    await expect(
      refreshAccessToken({
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "refresh",
      }),
    ).resolves.toBe("ya29.new");
  });

  it("surfaces invalid_grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant", { status: 400 })),
    );

    await expect(
      refreshAccessToken({
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "revoked",
      }),
    ).rejects.toThrow(/400/);
  });
});
