import { BarChart3 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export function Analytics() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Email volume, categories, drafts, and delivery outcomes."
      />

      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <BarChart3 className="mx-auto size-8 text-slate-300" />
        <h2 className="mt-3 text-sm font-semibold text-slate-900">
          Analytics need real data
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Charts will read from D1 once agents and Gmail sync exist. No fake
          numbers here. Recharts and live metrics arrive in Milestone 8.
        </p>
      </div>
    </div>
  );
}
