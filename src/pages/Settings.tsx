import { useEffect, useState } from "react";
import { Lock, Search, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

interface ModelOption {
  id: string;
  name: string;
  contextLength: number;
  promptPricePerMillion: number;
  completionPricePerMillion: number;
  free: boolean;
}

function priceLabel(model: ModelOption) {
  if (model.free) return "Free";
  return `$${model.promptPricePerMillion.toFixed(2)} / $${model.completionPricePerMillion.toFixed(2)} per 1M tokens`;
}

export function Settings() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [search, setSearch] = useState("");
  const [freeOnly, setFreeOnly] = useState(true);
  const [selected, setSelected] = useState("");
  const [savedModel, setSavedModel] = useState<string | null>(null);
  const [allowPaid, setAllowPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((response) => response.json())
      .then(
        (data: { model: string | null; allowPaid: boolean }) => {
          if (cancelled) return;
          setSavedModel(data.model);
          setSelected(data.model ?? "");
          setAllowPaid(data.allowPaid);
        },
      )
      .catch(() => {
        if (!cancelled) setError("Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (freeOnly) params.set("freeOnly", "true");

      fetch(`/api/models?${params.toString()}`)
        .then(async (response) => {
          const data = (await response.json()) as {
            models?: ModelOption[];
            error?: { message: string };
          };
          if (!response.ok) {
            throw new Error(data.error?.message ?? "Could not load models.");
          }
          if (!cancelled) {
            setModels(data.models ?? []);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(
              cause instanceof Error ? cause.message : "Could not load models.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, freeOnly]);

  async function saveModel() {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: selected }),
      });
      const data = (await response.json()) as {
        model?: string;
        error?: { message: string };
      };
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Could not save model.");
      }
      setSavedModel(data.model ?? selected);
      setNotice("Model saved. All agents now use it.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save model.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connected accounts, AI model choice, and preferences."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              OpenRouter model
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            One model powers classification, summarization, and reply drafting.
            The catalog comes from OpenRouter's public models API.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(event) => setFreeOnly(event.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Free only
            </label>
          </div>

          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">
              {isLoading ? "Loading models…" : "Choose a model"}
            </option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
                {model.free ? " — Free" : ` — ${priceLabel(model)}`}
              </option>
            ))}
          </select>

          {!allowPaid && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="size-3" />
              Paid models are disabled by default (ALLOW_PAID_MODELS).
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={saveModel}
              disabled={!selected || isSaving || selected === savedModel}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save model"}
            </button>
            {savedModel && (
              <span className="truncate text-xs text-slate-500">
                Current: {savedModel}
              </span>
            )}
          </div>

          {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Gmail accounts
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            No accounts connected. Google OAuth and multi-account support arrive
            in Milestone 6.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400"
          >
            Connect Gmail
          </button>
        </section>
      </div>
    </div>
  );
}
