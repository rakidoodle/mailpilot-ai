const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * AES-GCM encryption for OAuth refresh tokens.
 * Output format: base64(iv).base64(ciphertext) — safe for a TEXT column.
 */
export async function encryptToken(
  plaintext: string,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("Encryption secret is missing");
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(
  payload: string,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("Encryption secret is missing");
  const [ivPart, cipherPart] = payload.split(".");
  if (!ivPart || !cipherPart) throw new Error("Malformed encrypted token");

  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(cipherPart),
  );
  return decoder.decode(plaintext);
}

export function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return base64(buffer)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64(new Uint8Array(digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
