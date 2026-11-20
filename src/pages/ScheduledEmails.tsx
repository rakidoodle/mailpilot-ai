import { CalendarClock } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export function ScheduledEmails() {
  return (
    <div>
      <PageHeader
        title="Scheduled Emails"
        description="Approved messages waiting to be sent, plus delivery history."
      />

      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <CalendarClock className="mx-auto size-8 text-slate-300" />
        <h2 className="mt-3 text-sm font-semibold text-slate-900">
          No scheduled emails
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Approved replies will appear here with their send time, timezone, and
          delivery status. Scheduling arrives in Milestone 7.
        </p>
      </div>
    </div>
  );
}
