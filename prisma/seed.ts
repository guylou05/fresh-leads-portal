import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

/**
 * Seed the first administrator.
 *
 * Behaviour:
 *  - Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from the environment.
 *  - Validates password strength (min 10 chars).
 *  - Creates the admin (role ADMIN, status ACTIVE) if it does not exist.
 *  - Only updates an existing admin's name/password when explicitly requested
 *    via SEED_RESET_ADMIN=true (see `npm run db:seed:reset-admin`).
 *  - NEVER logs the plain-text password.
 */
const prisma = new PrismaClient();

const seedEnvSchema = z.object({
  ADMIN_NAME: z.string().min(1, "ADMIN_NAME is required"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email"),
  ADMIN_PASSWORD: z
    .string()
    .min(10, "ADMIN_PASSWORD must be at least 10 characters long"),
});

async function main(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Cannot seed admin. Fix these variables:\n${issues}`);
  }

  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = parsed.data;
  const email = ADMIN_EMAIL.toLowerCase();
  const resetRequested = process.env.SEED_RESET_ADMIN === "true";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        email,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`✅ Created administrator: ${email}`);
    return;
  }

  if (!resetRequested) {
    console.log(
      `ℹ️  Administrator ${email} already exists. ` +
        "Skipping (run with SEED_RESET_ADMIN=true to update name/password).",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.update({
    where: { email },
    data: {
      name: ADMIN_NAME,
      passwordHash,
      // Reactivate + ensure admin role on an explicit reset.
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log(`♻️  Reset administrator name/password for: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
