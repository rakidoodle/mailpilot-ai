interface DataSourceNoticeProps {
  error: string | null;
  onRetry: () => void;
}

export function DataSourceNotice({ error, onRetry }: DataSourceNoticeProps) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <span>
        Showing bundled demo data. API unavailable
        {error ? ` (${error})` : ""}.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
      >
        Retry
      </button>
    </div>
  );
}
