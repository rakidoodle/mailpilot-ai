import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classificationSchema,
  replySchema,
  runEmailAgents,
  summarizationSchema,
  type EmailContext,
} from "../worker/agents";
import {
  estimateCost,
  extractJson,
  filterModels,
  normalizeModels,
} from "../worker/openrouter";

const sampleEmail: EmailContext = {
  id: "em_test",
  account: "hello@example.com",
  from: "Amara Okafor",
  fromEmail: "amara@example.com",
  subject: "Landing page revisions",
  preview: "Two small changes before we ship.",
  bodyText: "Two small changes before we ship on Friday.",
  receivedAt: "2026-11-20T09:12:00Z",
};

function chatResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model catalog", () => {
  it("converts per-token pricing to per-million and flags free models", () => {
    const models = normalizeModels([
      {
        id: "paid/model",
        name: "Paid Model",
        context_length: 128000,
        pricing: { prompt: "0.000003", completion: "0.000015" },
      },
      {
        id: "free/model:free",
        name: "Free Model",
        context_length: 32000,
        pricing: { prompt: "0", completion: "0" },
      },
    ]);

    const paid = models.find((model) => model.id === "paid/model");
    const free = models.find((model) => model.id === "free/model:free");

    expect(paid?.promptPricePerMillion).toBeCloseTo(3);
    expect(paid?.completionPricePerMillion).toBeCloseTo(15);
    expect(paid?.free).toBe(false);
    expect(free?.free).toBe(true);
    expect(models[0].name).toBe("Free Model");
  });

  it("filters by search text and free-only", () => {
    const models = normalizeModels([
      {
        id: "openai/gpt",
        name: "OpenAI GPT",
        pricing: { prompt: "0.000001", completion: "0.000002" },
      },
      {
        id: "meta/llama:free",
        name: "Meta Llama",
        pricing: { prompt: "0", completion: "0" },
      },
    ]);

    expect(filterModels(models, { search: "llama" })).toHaveLength(1);
    expect(filterModels(models, { freeOnly: true })).toHaveLength(1);
    expect(filterModels(models, { freeOnly: true, search: "gpt" })).toHaveLength(
      0,
    );
  });

  it("estimates cost from token usage", () => {
    const cost = estimateCost(
      {
        id: "x",
        name: "X",
        contextLength: 1000,
        promptPricePerMillion: 2,
        completionPricePerMillion: 8,
        free: false,
      },
      { promptTokens: 500_000, completionTokens: 250_000 },
    );
    expect(cost).toBeCloseTo(3);
  });
});

describe("extractJson", () => {
  it("handles fenced output", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("handles prose around the object", () => {
    expect(extractJson('Here you go: {"category":"Work"} — done')).toEqual({
      category: "Work",
    });
  });

  it("takes the first object when the model emits two", () => {
    expect(extractJson('{"a":1}\n{"b":2}')).toEqual({ a: 1 });
  });

  it("throws when no object exists", () => {
    expect(() => extractJson("no json here")).toThrow(/JSON object/);
  });
});

describe("structured output schemas", () => {
  it("rejects unknown categories", () => {
    expect(
      classificationSchema.safeParse({ category: "Spam", reason: "x" }).success,
    ).toBe(false);
  });

  it("requires priority and action items shape", () => {
    const result = summarizationSchema.safeParse({
      summary: "Short.",
      actionItems: ["reply"],
      priority: "High",
      priorityReason: "Deadline Friday.",
    });
    expect(result.success).toBe(true);

    expect(
      summarizationSchema.safeParse({
        summary: "Short.",
        actionItems: [],
        priority: "Urgent",
        priorityReason: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects empty reply bodies", () => {
    expect(replySchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("runEmailAgents", () => {
  it("runs classification, summarization, then reply with prior context", async () => {
    const prompts: string[] = [];
    const mockFetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      prompts.push(body.messages[1].content);

      if (body.messages[0].content.includes("classify")) {
        return chatResponse('{"category":"Work","reason":"Client project."}');
      }
      if (body.messages[0].content.includes("summarize")) {
        return chatResponse(
          '{"summary":"Two copy fixes.","actionItems":["Update hero copy"],"priority":"High","priorityReason":"Friday launch."}',
        );
      }
      return chatResponse('{"body":"Thanks, I will ship both changes today."}');
    });
    vi.stubGlobal("fetch", mockFetch);

    const runs = await runEmailAgents({
      apiKey: "test-key",
      model: "free/model",
      email: sampleEmail,
      tone: "friendly",
    });

    expect(runs.map((run) => run.agent)).toEqual([
      "classification",
      "summarization",
      "reply",
    ]);
    expect(runs.every((run) => run.status === "success")).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(prompts[2]).toContain("Category: Work");
    expect(prompts[2]).toContain("Summary: Two copy fixes.");
    expect(prompts[2]).toContain("Tone: friendly");
  });

  it("isolates a failing agent from the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const system = body.messages[0].content;
        if (system.includes("classify")) return chatResponse("not json at all");
        if (system.includes("summarize")) {
          return chatResponse(
            '{"summary":"Fine.","actionItems":[],"priority":"Low","priorityReason":"Nothing urgent."}',
          );
        }
        return chatResponse('{"body":"Sounds good."}');
      }),
    );

    const runs = await runEmailAgents({
      apiKey: "test-key",
      model: "free/model",
      email: sampleEmail,
    });

    expect(runs[0].status).toBe("failed");
    expect(runs[0].errorMessage).toMatch(/JSON/);
    expect(runs[1].status).toBe("success");
    expect(runs[2].status).toBe("success");
  });

  it("retries once when the first output is invalid", async () => {
    let classificationCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const system = body.messages[0].content;
        if (system.includes("classify")) {
          classificationCalls += 1;
          return classificationCalls === 1
            ? chatResponse("Sure, this is Work email.")
            : chatResponse('{"category":"Work","reason":"Client work."}');
        }
        if (system.includes("summarize")) {
          return chatResponse(
            '{"summary":"Fine.","actionItems":[],"priority":"Low","priorityReason":"Nothing urgent."}',
          );
        }
        return chatResponse('{"body":"Sounds good."}');
      }),
    );

    const runs = await runEmailAgents({
      apiKey: "test-key",
      model: "free/model",
      email: sampleEmail,
    });

    expect(classificationCalls).toBe(2);
    expect(runs[0].status).toBe("success");
    // Failed attempts throw before usage is returned, so only the second call counts.
    expect(runs[0].usage?.promptTokens).toBe(100);
  });

  it("surfaces OpenRouter HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );

    const runs = await runEmailAgents({
      apiKey: "test-key",
      model: "free/model",
      email: sampleEmail,
    });

    expect(runs).toHaveLength(3);
    expect(runs.every((run) => run.status === "failed")).toBe(true);
    expect(runs[0].errorMessage).toContain("429");
  });
});
