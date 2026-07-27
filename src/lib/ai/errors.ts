export const AI_ERROR_CODES = [
  "AI_DISABLED",
  "MISSING_API_KEY",
  "MODEL_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "OUTPUT_VALIDATION_FAILED",
  "DAILY_LIMIT_REACHED",
  "COST_LIMIT_REACHED",
  "INPUT_TOO_LARGE",
  "CANCELLED",
  "STALE_INPUT",
  "UNKNOWN_ERROR",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AiError";
    this.code = code;
  }
}
