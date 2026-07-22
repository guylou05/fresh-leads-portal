"use client";

import { signOutAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm font-medium text-slate-900">{name}</span>
          {role === "ADMIN" && <Badge tone="brand">Admin</Badge>}
        </div>
        <p className="text-xs text-slate-500">{email}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
        {initials || "?"}
      </span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
