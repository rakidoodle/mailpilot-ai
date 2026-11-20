import { Inbox as InboxIcon, Mail, Star, Users } from "lucide-react";
import { CategoryBadge, PriorityBadge } from "../components/Badges";
import { PageHeader } from "../components/PageHeader";
import { mockEmails, type Category } from "../data/mockEmails";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const categories = Array.from(new Set(mockEmails.map((email) => email.category)));

export function Dashboard() {
  const stats = [
    {
      label: "Processed emails",
      value: mockEmails.length,
      icon: Mail,
      hint: "Fictional demo data",
    },
    {
      label: "High priority",
      value: mockEmails.filter((email) => email.priority === "High").length,
      icon: Star,
      hint: "Needs attention",
    },
    {
      label: "Unread",
      value: mockEmails.filter((email) => email.unread).length,
      icon: InboxIcon,
      hint: "Across 2 accounts",
    },
    {
      label: "Connected accounts",
      value: 1,
      icon: Users,
      hint: "Gmail connection pending",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of email activity and agent results."
      />

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
            {mockEmails.slice(0, 5).map((email) => (
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
            {categories.map((category: Category) => {
              const count = mockEmails.filter(
                (email) => email.category === category,
              ).length;
              const percent = Math.round((count / mockEmails.length) * 100);
              return (
                <div key={category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{category}</span>
                    <span className="font-medium text-slate-900">{count}</span>
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
    </div>
  );
}
