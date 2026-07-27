import { env } from "@/env";

/** Rough token estimate (~4 chars/token). Good enough for pre-run estimates. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost in integer cents from token counts. Model pricing is NOT
 * hard-coded — it comes from env (cents per 1M tokens). Returns null when
 * pricing is unknown (UI then shows token counts instead of a fake price).
 */
export function estimateCostCents(
  inputTokens: number,
  outputTokens: number,
): number | null {
  const inRate = env.AI_INPUT_COST_PER_MTOK_CENTS;
  const outRate = env.AI_OUTPUT_COST_PER_MTOK_CENTS;
  if (inRate <= 0 && outRate <= 0) return null;
  const cents = (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return Math.round(cents);
}

export function formatCentsUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
