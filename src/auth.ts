import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { canSignIn } from "@/lib/auth-helpers";
import { recordAudit } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        // Uniform failure: never reveal whether the email exists.
        if (!user || !canSignIn(user)) return null;

        const passwordValid = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!passwordValid) return null;

        await prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {
            /* non-fatal: login should still succeed */
          });

        await recordAudit({
          userId: user.id,
          action: "auth.login.success",
          entityType: "User",
          entityId: user.id,
        });

        // Only non-sensitive identity fields flow into the session token.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
