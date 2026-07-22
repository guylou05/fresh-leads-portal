"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, passwordSchema } from "@/lib/password";
import { recordAudit } from "@/lib/audit";
import {
  AuthzError,
  ensureNotLastActiveAdmin,
  ensureNotSelfDisable,
  isAdmin,
} from "@/lib/authz";

export type AdminActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

type Actor = { id: string };

async function requireAdmin(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id || !isAdmin(session.user)) {
    throw new AuthzError("You are not authorized to perform this action.");
  }
  return { id: session.user.id };
}

function activeAdminCount(): Promise<number> {
  return prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
}

function fail(error: unknown): AdminActionState {
  if (error instanceof AuthzError) return { error: error.message };
  console.error(
    "[admin.users] action failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { error: "Something went wrong. Please try again." };
}

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.nativeEnum({ ADMIN: "ADMIN", USER: "USER" } as const),
  password: passwordSchema,
});

export async function createUser(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    const parsed = createUserSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash,
        status: "ACTIVE",
      },
    });

    await recordAudit({
      userId: actor.id,
      action: "admin.user.created",
      entityType: "User",
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
    });

    revalidatePath("/settings/users");
    return { ok: true, message: `Created ${created.email}.` };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "A user with that email already exists." };
    }
    return fail(error);
  }
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum({ ADMIN: "ADMIN", USER: "USER" } as const),
});

export async function changeUserRole(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    const parsed = roleSchema.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role"),
    });
    if (!parsed.success) return { error: "Invalid input." };

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
    });
    if (!target) return { error: "User not found." };

    // Demoting an admin removes them from the admin pool.
    if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
      ensureNotLastActiveAdmin(target, await activeAdminCount());
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: parsed.data.role },
    });

    await recordAudit({
      userId: actor.id,
      action: "admin.user.role_changed",
      entityType: "User",
      entityId: target.id,
      metadata: { from: target.role, to: parsed.data.role },
    });

    revalidatePath("/settings/users");
    return { ok: true, message: "Role updated." };
  } catch (error) {
    return fail(error);
  }
}

const statusSchema = z.object({
  userId: z.string().min(1),
  status: z.nativeEnum({ ACTIVE: "ACTIVE", DISABLED: "DISABLED" } as const),
});

export async function setUserStatus(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    const parsed = statusSchema.safeParse({
      userId: formData.get("userId"),
      status: formData.get("status"),
    });
    if (!parsed.success) return { error: "Invalid input." };

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
    });
    if (!target) return { error: "User not found." };

    if (parsed.data.status === "DISABLED") {
      ensureNotSelfDisable(actor.id, target);
      ensureNotLastActiveAdmin(target, await activeAdminCount());
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { status: parsed.data.status },
    });

    await recordAudit({
      userId: actor.id,
      action: "admin.user.status_changed",
      entityType: "User",
      entityId: target.id,
      metadata: { from: target.status, to: parsed.data.status },
    });

    revalidatePath("/settings/users");
    return {
      ok: true,
      message:
        parsed.data.status === "DISABLED"
          ? "User disabled."
          : "User reactivated.",
    };
  } catch (error) {
    return fail(error);
  }
}

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordSchema,
});

export async function resetUserPassword(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    const parsed = resetPasswordSchema.safeParse({
      userId: formData.get("userId"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
    });
    if (!target) return { error: "User not found." };

    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash },
    });

    await recordAudit({
      userId: actor.id,
      action: "admin.user.password_reset",
      entityType: "User",
      entityId: target.id,
    });

    revalidatePath("/settings/users");
    return { ok: true, message: "Password reset." };
  } catch (error) {
    return fail(error);
  }
}
