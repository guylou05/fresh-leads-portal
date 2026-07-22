"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  changeUserRole,
  createUser,
  resetUserPassword,
  setUserStatus,
  type AdminActionState,
} from "@/app/(app)/settings/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
};

const initial: AdminActionState = {};

/** Fire a toast whenever a server action returns a new result. */
function useActionToast(
  state: AdminActionState,
  onSuccess?: () => void,
): void {
  const { toast } = useToast();
  const last = useRef<AdminActionState>({});
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok && state.message) {
      toast(state.message, "success");
      onSuccess?.();
    }
    if (state.error) toast(state.error, "error");
    // onSuccess intentionally omitted to avoid re-running on identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, toast]);
}

function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  useActionToast(state, () => {
    formRef.current?.reset();
    setOpen(false);
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Create user</h2>
          <p className="text-sm text-slate-500">
            Add a new internal team member.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "secondary" : "primary"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "New user"}
        </Button>
      </div>
      {open && (
        <form
          ref={formRef}
          action={action}
          className="grid grid-cols-1 gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-2"
        >
          <div>
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" name="name" required maxLength={120} />
          </div>
          <div>
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              name="role"
              defaultValue="USER"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <Label htmlFor="new-password">Temporary password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-slate-400">Minimum 10 characters.</p>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={pending}>
              Create user
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function RoleForm({ user, disabled }: { user: ManagedUser; disabled: boolean }) {
  const [state, action, pending] = useActionState(changeUserRole, initial);
  useActionToast(state);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <select
        name="role"
        defaultValue={user.role}
        disabled={disabled || pending}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label={`Role for ${user.email}`}
        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
      >
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
      </select>
    </form>
  );
}

function StatusForm({
  user,
  disabled,
}: {
  user: ManagedUser;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setUserStatus, initial);
  useActionToast(state);
  const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button
        type="submit"
        size="sm"
        variant={user.status === "ACTIVE" ? "danger" : "secondary"}
        loading={pending}
        disabled={disabled}
      >
        {user.status === "ACTIVE" ? "Disable" : "Reactivate"}
      </Button>
    </form>
  );
}

function ResetPasswordForm({ user }: { user: ManagedUser }) {
  const [state, action, pending] = useActionState(resetUserPassword, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  useActionToast(state, () => {
    formRef.current?.reset();
    setOpen(false);
  });

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
      >
        Reset password
      </Button>
      {open && (
        <form
          ref={formRef}
          action={action}
          className="mt-2 flex items-center gap-2"
        >
          <input type="hidden" name="userId" value={user.id} />
          <Input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="New password (10+ chars)"
            autoComplete="new-password"
            className="h-8 w-56 text-xs"
            aria-label={`New password for ${user.email}`}
          />
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </form>
      )}
    </div>
  );
}

export function UsersManager({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <CreateUserForm />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last login</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">
                        {user.name}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <RoleForm user={user} disabled={isSelf} />
                    </td>
                    <td className="px-5 py-4">
                      {user.status === "ACTIVE" ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="danger">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {user.lastLoginAt
                        ? formatDateTime(user.lastLoginAt)
                        : "Never"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <StatusForm user={user} disabled={isSelf} />
                        <ResetPasswordForm user={user} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
