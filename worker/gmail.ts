export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: MessagePart[];
  };
}

export interface SyncedEmail {
  gmailMessageId: string;
  threadId: string | null;
  senderName: string;
  senderEmail: string;
  subject: string;
  preview: string;
  bodyText: string;
  receivedAt: string;
}

export function buildAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function parseAddress(raw: string): { name: string; email: string } {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, "");
    return { name: name || angle[2].trim(), email: angle[2].trim() };
  }
  return { name: trimmed, email: trimmed };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractBodyText(payload: GmailMessage["payload"]): string {
  if (!payload) return "";

  const plain: string[] = [];
  const html: string[] = [];

  function walk(part: MessagePart | NonNullable<GmailMessage["payload"]>) {
    const data = part.body?.data;
    if (data) {
      if (part.mimeType === "text/plain") plain.push(decodeBase64Url(data));
      else if (part.mimeType === "text/html") html.push(decodeBase64Url(data));
      else if (!part.parts?.length) plain.push(decodeBase64Url(data));
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);

  if (plain.length > 0) return plain.join("\n").trim();
  if (html.length > 0) return stripHtml(html.join("\n"));
  return "";
}

export function mapGmailMessage(message: GmailMessage): SyncedEmail {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";

  const sender = parseAddress(header("from"));
  const bodyText = extractBodyText(message.payload);
  const preview = (message.snippet ?? bodyText).slice(0, 300);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  return {
    gmailMessageId: message.id,
    threadId: message.threadId ?? null,
    senderName: sender.name,
    senderEmail: sender.email,
    subject: header("subject") || "(no subject)",
    preview,
    bodyText,
    receivedAt,
  };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return `${response.status}: ${text.slice(0, 200)}`;
}

export async function exchangeCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      code_verifier: options.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: options.redirectUri,
    }),
  });

  if (!response.ok) throw new Error(`Token exchange failed (${await readError(response)})`);

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error("Google did not return a refresh token. Reconnect with consent.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) throw new Error(`Token refresh failed (${await readError(response)})`);

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Token refresh returned no access token");
  return data.access_token;
}

export async function getProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail profile failed (${await readError(response)})`);

  const data = (await response.json()) as { emailAddress?: string };
  if (!data.emailAddress) throw new Error("Gmail profile returned no address");
  return data.emailAddress;
}

export async function listMessageIds(
  accessToken: string,
  options: { query?: string; maxResults?: number } = {},
): Promise<string[]> {
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 25),
  });
  if (options.query) params.set("q", options.query);

  const response = await fetch(`${API_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail list failed (${await readError(response)})`);

  const data = (await response.json()) as {
    messages?: Array<{ id: string }>;
  };
  return (data.messages ?? []).map((message) => message.id);
}

export async function getMessage(
  accessToken: string,
  id: string,
): Promise<GmailMessage> {
  const response = await fetch(`${API_BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail get failed (${await readError(response)})`);
  return (await response.json()) as GmailMessage;
}
