import { Bot } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export function AgentActivity() {
  return (
    <div>
      <PageHeader
        title="Agent Activity"
        description="Which agent ran, on which email, with what model and result."
      />

      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <Bot className="mx-auto size-8 text-slate-300" />
        <h2 className="mt-3 text-sm font-semibold text-slate-900">
          No agent runs yet
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Classification, summarization, and reply runs will be logged here with
          duration, token usage, and errors. Agents arrive in Milestone 5.
        </p>
      </div>
    </div>
  );
}
