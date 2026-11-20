import { useMemo, useState } from "react";
import { CategoryBadge, PriorityBadge } from "../components/Badges";
import { PageHeader } from "../components/PageHeader";
import { mockEmails, type Category } from "../data/mockEmails";

const filters: Array<Category | "All"> = [
  "All",
  "Work",
  "Personal",
  "Promotions",
  "Support",
  "Finance",
  "Other",
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Inbox() {
  const [activeFilter, setActiveFilter] = useState<Category | "All">("All");

  const emails = useMemo(
    () =>
      activeFilter === "All"
        ? mockEmails
        : mockEmails.filter((email) => email.category === activeFilter),
    [activeFilter],
  );

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Demo messages classified and summarized by AI agents."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === filter
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {emails.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-slate-500">
            No emails in this category.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {emails.map((email) => (
              <li
                key={email.id}
                className="cursor-pointer px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${
                      email.unread ? "bg-brand-500" : "bg-slate-200"
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    {email.from}
                  </span>
                  <span className="text-xs text-slate-400">
                    {email.fromEmail}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {formatDateTime(email.receivedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {email.subject}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {email.summary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CategoryBadge category={email.category} />
                  <PriorityBadge priority={email.priority} />
                  <span className="ml-auto text-xs text-slate-400">
                    {email.account}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Fictional data. Live Gmail sync arrives in Milestone 6.
      </p>
    </div>
  );
}
