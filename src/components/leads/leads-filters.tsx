import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { REPORT_TYPES } from "@/lib/imports/report-type";

export type LeadsFilterValues = {
  q: string;
  county: string;
  city: string;
  entityType: string;
  source: string;
  importBatchId: string;
  from: string;
  to: string;
  recent: string;
  sort: string;
};

const SORT_OPTIONS = [
  { value: "effective_desc", label: "Newest effective date" },
  { value: "effective_asc", label: "Oldest effective date" },
  { value: "name_asc", label: "Business name A–Z" },
  { value: "imported_desc", label: "Import date (newest)" },
  { value: "county_asc", label: "County A–Z" },
];

/** Server-rendered GET filter form (full server-side filtering). */
export function LeadsFilters({
  values,
  batchOptions,
}: {
  values: LeadsFilterValues;
  batchOptions: { id: string; label: string }[];
}) {
  return (
    <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <Label htmlFor="q">Search business name</Label>
        <Input id="q" name="q" defaultValue={values.q} placeholder="e.g. Buckeye" />
      </div>
      <div>
        <Label htmlFor="county">County</Label>
        <Input id="county" name="county" defaultValue={values.county} />
      </div>
      <div>
        <Label htmlFor="city">Business city</Label>
        <Input id="city" name="city" defaultValue={values.city} />
      </div>
      <div>
        <Label htmlFor="entityType">Entity type</Label>
        <select
          id="entityType"
          name="entityType"
          defaultValue={values.entityType}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All</option>
          {REPORT_TYPES.filter((t) => t !== "Unknown").map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="source">Source</Label>
        <Input id="source" name="source" defaultValue={values.source} placeholder="OH_SOS" />
      </div>
      <div>
        <Label htmlFor="importBatchId">Import batch</Label>
        <select
          id="importBatchId"
          name="importBatchId"
          defaultValue={values.importBatchId}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">All imports</option>
          {batchOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="from">Effective from</Label>
        <Input id="from" name="from" type="date" defaultValue={values.from} />
      </div>
      <div>
        <Label htmlFor="to">Effective to</Label>
        <Input id="to" name="to" type="date" defaultValue={values.to} />
      </div>
      <div>
        <Label htmlFor="sort">Sort by</Label>
        <select
          id="sort"
          name="sort"
          defaultValue={values.sort}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="recent"
            value="1"
            defaultChecked={values.recent === "1"}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Recently imported
        </label>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit">Apply filters</Button>
        <Link
          href="/leads"
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
