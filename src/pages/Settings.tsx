import { KeyRound, Mail, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export function Settings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connected accounts, AI model choice, and preferences."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-slate-500" />
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

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              OpenRouter model
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            No model selected. The model picker reads OpenRouter's model list in
            Milestone 4. Free models stay enabled; paid models stay disabled by
            default.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400"
          >
            Select model
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              API keys and secrets
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            All provider keys stay server-side in Cloudflare secrets. Nothing is
            stored in the browser or committed to Git. Milestone 3 wires this
            up.
          </p>
        </section>
      </div>
    </div>
  );
}
