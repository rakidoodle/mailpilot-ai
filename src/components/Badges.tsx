import type { Category, Priority } from "../../shared/types";

const categoryStyles: Record<Category, string> = {
  Work: "bg-blue-50 text-blue-700 ring-blue-600/10",
  Personal: "bg-purple-50 text-purple-700 ring-purple-600/10",
  Promotions: "bg-pink-50 text-pink-700 ring-pink-600/10",
  Support: "bg-orange-50 text-orange-700 ring-orange-600/10",
  Finance: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  Other: "bg-slate-100 text-slate-600 ring-slate-600/10",
};

const priorityStyles: Record<Priority, string> = {
  High: "bg-red-50 text-red-700 ring-red-600/10",
  Medium: "bg-amber-50 text-amber-700 ring-amber-600/10",
  Low: "bg-slate-100 text-slate-600 ring-slate-600/10",
};

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${categoryStyles[category]}`}
    >
      {category}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityStyles[priority]}`}
    >
      {priority}
    </span>
  );
}
