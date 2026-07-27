import Link from "next/link";

/** Build a query string from params, overriding the page. */
function hrefFor(params: Record<string, string>, page: number): string {
  const sp = new URLSearchParams(params);
  sp.set("page", String(page));
  return `/leads?${sp.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  total,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  params: Record<string, string>;
}) {
  if (total === 0) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
      <p className="text-slate-500">
        Page <span className="font-medium text-slate-700">{page}</span> of{" "}
        {totalPages} · {total.toLocaleString()} records
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(params, prev)}
          aria-disabled={page <= 1}
          className={
            page <= 1
              ? "pointer-events-none rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300"
              : "rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          }
        >
          Previous
        </Link>
        <Link
          href={hrefFor(params, next)}
          aria-disabled={page >= totalPages}
          className={
            page >= totalPages
              ? "pointer-events-none rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300"
              : "rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          }
        >
          Next
        </Link>
      </div>
    </div>
  );
}
