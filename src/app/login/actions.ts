"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";

import { signIn } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export type LoginState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please enter a valid email and password." };
  }

  const email = parsed.data.email.toLowerCase();
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Basic brute-force protection: 5 attempts per email+IP per 15 minutes.
  const rate = checkRateLimit(`login:${ip}:${email}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return {
      error: "Too many login attempts. Please try again in a few minutes.",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      await recordAudit({
        action: "auth.login.failed",
        entityType: "User",
        metadata: { email },
        ipAddress: ip,
        userAgent: headerList.get("user-agent"),
      });
      return { error: "Invalid email or password." };
    }
    // Re-throw redirect and other framework control-flow errors.
    throw error;
  }
}
