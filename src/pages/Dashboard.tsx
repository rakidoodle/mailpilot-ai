import { Inbox as InboxIcon, Mail, Star, Users } from "lucide-react";
import { CategoryBadge, PriorityBadge } from "../components/Badges";
import { DataSourceNotice } from "../components/DataSourceNotice";
import { PageHeader } from "../components/PageHeader";
import { useEmails } from "../hooks/useEmails";
import type { Category } from "../../shared/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function Dashboard() {
  const { emails, isLoading, source, error, reload } = useEmails();

  const stats = [
    {
      label: "Processed emails",
      value: emails.length,
      icon: Mail,
      hint: source === "api" ? "From D1 database" : "Fictional demo data",
    },
    {
      label: "High priority",
      value: emails.filter((email) => email.priority === "High").length,
      icon: Star,
      hint: "Needs attention",
    },
    {
      label: "Unread",
      value: emails.filter((email) => email.unread).length,
      icon: InboxIcon,
      hint: "All connected accounts",
    },
    {
      label: "Connected accounts",
      value: new Set(emails.map((email) => email.account)).size,
      icon: Users,
      hint: "Demo accounts",
    },
  ];

  const categories = Array.from(
    new Set(emails.map((email) => email.category)),
  ) as Category[];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of email activity and agent results."
      />

      {source === "demo" && !isLoading && (
        <DataSourceNotice error={error} onRetry={reload} />
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading emails…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, hint }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{label}</p>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {value}
                </p>
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Recent emails
                </h2>
                <span className="text-xs text-slate-400">Latest 5</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {emails.slice(0, 5).map((email) => (
                  <li key={email.id} className="flex gap-3 px-5 py-4">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        email.unread ? "bg-brand-500" : "bg-slate-200"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {email.from}
                        </p>
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatDate(email.receivedAt)}
                        </span>
                      </div>
                      <p className="truncate text-sm text-slate-700">
                        {email.subject}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {email.summary}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <CategoryBadge category={email.category} />
                        <PriorityBadge priority={email.priority} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Category distribution
                </h2>
              </div>
              <div className="space-y-4 p-5">
                {categories.map((category) => {
                  const count = emails.filter(
                    (email) => email.category === category,
                  ).length;
                  const percent = emails.length
                    ? Math.round((count / emails.length) * 100)
                    : 0;
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{category}</span>
                        <span className="font-medium text-slate-900">
                          {count}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
