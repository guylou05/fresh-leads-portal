// Ensure required environment variables exist before any module that validates
// them (e.g. `src/env.ts`) is imported during tests.
const defaults: Record<string, string> = {
  DATABASE_URL:
    "postgresql://postgres:postgres@localhost:5432/freshbiz_leads?schema=public",
  AUTH_SECRET: "test-secret-value-at-least-16-chars",
  AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
};

const target = process.env as Record<string, string | undefined>;
for (const [key, value] of Object.entries(defaults)) {
  target[key] ??= value;
}
