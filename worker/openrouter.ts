export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  /** USD per 1M input tokens. */
  promptPricePerMillion: number;
  /** USD per 1M output tokens. */
  completionPricePerMillion: number;
  free: boolean;
}

interface OpenRouterModelRow {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export class OpenRouterError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const CACHE_TTL_MS = 10 * 60 * 1000;

let modelCache: { fetchedAt: number; models: ModelInfo[] } | null = null;

function toNumber(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeModels(rows: OpenRouterModelRow[]): ModelInfo[] {
  return rows
    .map((row) => {
      const prompt = toNumber(row.pricing?.prompt) * 1_000_000;
      const completion = toNumber(row.pricing?.completion) * 1_000_000;
      return {
        id: row.id,
        name: row.name,
        contextLength: row.context_length ?? 0,
        promptPricePerMillion: prompt,
        completionPricePerMillion: completion,
        free: prompt === 0 && completion === 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getModels(force = false): Promise<ModelInfo[]> {
  const now = Date.now();
  if (!force && modelCache && now - modelCache.fetchedAt < CACHE_TTL_MS) {
    return modelCache.models;
  }

  const response = await fetch(MODELS_URL);
  if (!response.ok) {
    throw new OpenRouterError(
      `OpenRouter model list failed (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as { data?: OpenRouterModelRow[] };
  const models = normalizeModels(payload.data ?? []);
  modelCache = { fetchedAt: now, models };
  return models;
}

export function filterModels(
  models: ModelInfo[],
  options: { search?: string; freeOnly?: boolean } = {},
): ModelInfo[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  return models.filter((model) => {
    if (options.freeOnly && !model.free) return false;
    if (!search) return true;
    return (
      model.id.toLowerCase().includes(search) ||
      model.name.toLowerCase().includes(search)
    );
  });
}

export function estimateCost(model: ModelInfo, usage: Usage): number {
  return (
    (usage.promptTokens / 1_000_000) * model.promptPricePerMillion +
    (usage.completionTokens / 1_000_000) * model.completionPricePerMillion
  );
}

/** Extract the first complete JSON object from model output. */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/gim, "")
    .replace(/```$/gim, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) {
    throw new Error("Model output did not contain a JSON object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, index + 1));
      }
    }
  }

  throw new Error("Model output did not contain a complete JSON object");
}

export async function chatJson(options: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ data: unknown; usage: Usage; raw: string }> {
  const payload = {
    model: options.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    temperature: 0.2,
    max_tokens: options.maxTokens ?? 700,
  };

  async function send(withJsonMode: boolean) {
    return fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/rakidoodle/mailpilot-ai",
        "X-Title": "MailPilot AI",
      },
      body: JSON.stringify(
        withJsonMode
          ? { ...payload, response_format: { type: "json_object" } }
          : payload,
      ),
    });
  }

  // Prefer provider-enforced JSON mode; some models reject the parameter.
  let response = await send(true);
  if (response.status === 400) {
    response = await send(false);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new OpenRouterError(
      `OpenRouter request failed (${response.status}): ${detail.slice(0, 200)}`,
      response.status,
    );
  }

  const payloadJson = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const raw = payloadJson.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) {
    throw new Error("Model returned no content");
  }

  return {
    data: extractJson(raw),
    raw,
    usage: {
      promptTokens: payloadJson.usage?.prompt_tokens ?? 0,
      completionTokens: payloadJson.usage?.completion_tokens ?? 0,
    },
  };
}
