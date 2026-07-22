"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateProfile, type ActionState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

const initial: ActionState = {};

export function ProfileForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const { toast } = useToast();
  const lastHandled = useRef<ActionState>({});

  useEffect(() => {
    if (state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok && state.message) toast(state.message, "success");
    if (state.error) toast(state.error, "error");
  }, [state, toast]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          required
          maxLength={120}
          autoComplete="name"
        />
      </div>
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" value={email} disabled readOnly />
        <p className="mt-1 text-xs text-slate-400">
          Your email is managed by an administrator and cannot be changed here.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
