/** User-friendly enrichment failure categories (never leak internals). */
export const FAILURE_CODES = [
  "NO_MATCH",
  "MULTIPLE_MATCHES",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INVALID_API_KEY",
  "WEBSITE_TIMEOUT",
  "WEBSITE_BLOCKED",
  "WEBSITE_NOT_FOUND",
  "WEBSITE_UNSAFE",
  "PARSE_FAILED",
  "COST_LIMIT_REACHED",
  "DAILY_LIMIT_REACHED",
  "CANCELLED",
  "UNKNOWN_ERROR",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  NO_MATCH: "No confident match was found.",
  MULTIPLE_MATCHES: "Multiple possible matches require manual review.",
  RATE_LIMITED: "The provider rate-limited the request; will retry later.",
  PROVIDER_UNAVAILABLE: "The provider is temporarily unavailable.",
  INVALID_API_KEY: "The provider is not configured (missing/invalid API key).",
  WEBSITE_TIMEOUT: "The website did not respond in time.",
  WEBSITE_BLOCKED: "The website blocked automated access.",
  WEBSITE_NOT_FOUND: "The website could not be reached.",
  WEBSITE_UNSAFE: "The URL was rejected for safety reasons.",
  PARSE_FAILED: "The page content could not be parsed.",
  COST_LIMIT_REACHED: "The configured cost ceiling was reached.",
  DAILY_LIMIT_REACHED: "The daily enrichment limit was reached.",
  CANCELLED: "The job was cancelled.",
  UNKNOWN_ERROR: "An unexpected error occurred.",
};

/** An enrichment error carrying a safe, categorized failure code. */
export class EnrichmentError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message?: string) {
    super(message ?? FAILURE_MESSAGES[code]);
    this.name = "EnrichmentError";
    this.code = code;
  }
}
