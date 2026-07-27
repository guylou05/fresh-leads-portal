import { z } from "zod";

/**
 * Centralized, typed environment-variable validation.
 *
 * Runtime-critical variables (DATABASE_URL, AUTH_SECRET, AUTH_URL) are required
 * for the application to boot. The ADMIN_* variables are only consumed by the
 * seed script, so they are optional here and validated strictly inside the seed
 * (see `prisma/seed.ts`). This keeps a running production container from
 * crashing merely because the one-off seed credentials are absent.
 */
export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid connection URL"),
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.string().url("AUTH_URL must be a valid URL"),
  AUTH_TRUST_HOST: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email").optional(),
  ADMIN_PASSWORD: z
    .string()
    .min(10, "ADMIN_PASSWORD must be at least 10 characters")
    .optional(),
  // Maximum allowed size for an uploaded import file, in megabytes.
  MAX_IMPORT_FILE_SIZE_MB: z.coerce
    .number()
    .int("MAX_IMPORT_FILE_SIZE_MB must be an integer")
    .positive("MAX_IMPORT_FILE_SIZE_MB must be positive")
    .default(20),

  // Phase 4 — enrichment engine. REDIS_URL and GOOGLE_MAPS_API_KEY are optional
  // so the web app still boots without them; features degrade gracefully.
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  ENRICHMENT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  ENRICHMENT_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  ENRICHMENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  ENRICHMENT_DAILY_LEAD_LIMIT: z.coerce.number().int().positive().default(500),
  ENRICHMENT_DEFAULT_CACHE_DAYS: z.coerce.number().int().positive().default(30),
  ENRICHMENT_COST_CEILING_CENTS: z.coerce.number().int().nonnegative().default(0),
  GOOGLE_PLACES_COST_PER_CALL_CENTS: z.coerce.number().nonnegative().default(0),
  WEBSITE_CRAWL_USER_AGENT: z
    .string()
    .default("FreshBizLeadsBot/1.0 (+https://freshbiz.example)"),
  WEBSITE_CRAWL_MAX_PAGES: z.coerce.number().int().positive().default(5),
  WEBSITE_CRAWL_MAX_BYTES: z.coerce.number().int().positive().default(2_000_000),
  WEBSITE_CRAWL_DELAY_MS: z.coerce.number().int().nonnegative().default(750),
  WEBSITE_CRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  WEBSITE_CRAWL_ENABLED: z.enum(["true", "false"]).default("true"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment source. Pure and testable.
 * Throws a single, human-readable error listing every problem.
 */
export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables. Please check your .env configuration:\n${issues}`,
    );
  }

  return parsed.data;
}

/**
 * Validated environment, resolved once at module load.
 * Import this everywhere instead of reading `process.env` directly.
 */
export const env: Env = parseEnv();
