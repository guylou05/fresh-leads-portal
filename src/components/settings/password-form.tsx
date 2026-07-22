"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePassword, type ActionState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

const initial: ActionState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<ActionState>({});
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok && state.message) {
      toast(state.message, "success");
      formRef.current?.reset();
    }
    if (state.error) toast(state.error, "error");
  }, [state, toast]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={10}
        />
        <p className="mt-1 text-xs text-slate-400">
          Must be at least 10 characters long.
        </p>
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="showPasswords"
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <Label htmlFor="showPasswords" className="mb-0 font-normal text-slate-600">
          Show passwords
        </Label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Update password
        </Button>
      </div>
    </form>
  );
}
