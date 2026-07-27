import { env } from "@/env";
import { AiError } from "@/lib/ai/errors";
import { buildAnalysisPrompt, buildDraftPrompt } from "@/lib/ai/prompts";
import {
  aiStructuredOutputSchema,
  draftSchema,
  type AiStructuredOutput,
  type DraftOutput,
} from "@/lib/ai/schemas";
import type { AiContext, ContextField } from "@/lib/ai/context-builder";
import { estimateTokens } from "@/lib/ai/cost";

export const STUB_MODEL = "stub-v1";

export type ModelUsage = { inputTokens: number; outputTokens: number };
export type AnalysisResult = {
  output: AiStructuredOutput;
  usage: ModelUsage;
  model: string;
  stub: boolean;
};
export type DraftResult = {
  output: DraftOutput;
  usage: ModelUsage;
  model: string;
  stub: boolean;
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s"')]+/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

/**
 * Guard against invented contact info: any email/URL/phone appearing in AI text
 * must also appear in the provided (known) context values. Returns offending
 * tokens so callers can reject/scrub. Pure + testable.
 */
export function findInventedContact(
  text: string,
  allowedValues: string[],
): string[] {
  const haystack = allowedValues.join(" \n ").toLowerCase();
  const offending: string[] = [];
  const check = (matches: RegExpMatchArray | null) => {
    for (const m of matches ?? []) {
      const token = m.trim().toLowerCase();
      const digits = token.replace(/\D/g, "");
      const inContext =
        haystack.includes(token) ||
        (digits.length >= 7 && haystack.replace(/\D/g, "").includes(digits));
      if (!inContext) offending.push(m.trim());
    }
  };
  check(text.match(EMAIL_RE));
  check(text.match(URL_RE));
  check(text.match(PHONE_RE));
  return offending;
}

function fieldMap(fields: ContextField[]): Map<string, string> {
  return new Map(fields.map((f) => [f.field, f.value]));
}

/** Deterministic, evidence-only stub analysis used when no API key is set. */
export function deriveStubAnalysis(context: AiContext): AiStructuredOutput {
  const m = fieldMap(context.fields);
  const category = (m.get("googlePrimaryCategory") ?? "").toLowerCase();
  const entity = (m.get("entityType") ?? "").toLowerCase();
  const txn = (m.get("transactionDescription") ?? "").toLowerCase();
  const hasWebsite = m.has("website");
  const hasCategory = category.length > 0;
  const nonprofit = /nonprofit|non-profit/.test(entity) || /nonprofit/.test(txn);

  let industry: AiStructuredOutput["industry"] = "Unknown";
  let industryConfidence = 20;
  if (/dentist|dental/.test(category)) { industry = "Dental"; industryConfidence = 55; }
  else if (/restaurant|food|cafe|coffee/.test(category)) { industry = "Food and Beverage"; industryConfidence = 55; }
  else if (/law|attorney|legal/.test(category)) { industry = "Legal"; industryConfidence = 55; }
  else if (/salon|barber|spa|beauty/.test(category)) { industry = "Beauty and Personal Care"; industryConfidence = 55; }
  else if (/contractor|construction|roofing|plumb|hvac/.test(category)) { industry = "Construction"; industryConfidence = 55; }
  else if (nonprofit) { industry = "Nonprofit"; industryConfidence = 45; }
  else if (entity.includes("llc") || entity.includes("liability")) { industry = "Professional Services"; industryConfidence = 30; }

  const businessType: AiStructuredOutput["businessType"] =
    nonprofit ? "Nonprofit organization" :
    /store|retail|shop/.test(category) ? "Retail storefront" :
    /office|dentist|law|attorney/.test(category) ? "Professional office" :
    "Unknown";

  const segment: AiStructuredOutput["segment"] =
    nonprofit ? "Nonprofit Technology Prospect" :
    !hasWebsite ? "Website Setup Prospect" :
    hasCategory ? "Managed IT Prospect" :
    "Needs Manual Review";

  const businessFitScore = Math.min(20, 6 + (hasCategory ? 6 : 0) + (nonprofit ? 2 : 4));
  const technologyOpportunityScore = Math.min(20, 6 + (hasWebsite ? 4 : 8));

  const services: AiStructuredOutput["recommendedServices"] = [
    { service: "Managed IT Support", priority: "NORMAL", confidence: 50, rationale: "New businesses commonly need ongoing IT support." },
    { service: "Microsoft 365 Setup", priority: "NORMAL", confidence: 45, rationale: "Email and productivity setup is a common first need." },
  ];
  if (!hasWebsite) services.push({ service: "Website Design", priority: "HIGH", confidence: 55, rationale: "No verified website was found." });
  if (nonprofit) services.push({ service: "Nonprofit Technology Support", priority: "NORMAL", confidence: 50, rationale: "Entity appears to be a nonprofit." });

  const closed = (m.get("googleBusinessStatus") ?? "") !== "" && (m.get("googleBusinessStatus") ?? "OPERATIONAL") !== "OPERATIONAL";
  const qualificationRecommendation: AiStructuredOutput["qualificationRecommendation"] =
    closed ? "DISQUALIFY" : hasCategory || hasWebsite ? "REVIEW" : "INSUFFICIENT_DATA";

  const evidence: AiStructuredOutput["evidence"] = context.fields
    .slice(0, 12)
    .map((f) => ({ field: f.field, value: f.value, sourceType: f.sourceType, relevance: "Used for classification" }));

  return {
    industry,
    industryConfidence,
    secondaryIndustries: [],
    businessType,
    businessTypeConfidence: businessType === "Unknown" ? 25 : 45,
    segment,
    secondarySegments: [],
    segmentConfidence: 40,
    businessFitScore,
    technologyOpportunityScore,
    recommendedServices: services.slice(0, 6),
    qualificationRecommendation,
    qualificationConfidence: 40,
    qualificationReason: closed
      ? "Listing appears not operational."
      : "Limited verified data; manual review recommended.",
    qualificationRisks: hasCategory ? [] : ["Limited source data"],
    qualificationNextStep: "Review enrichment and confirm the business is a fit.",
    outreachAngles: [
      { angle: "New-business technology setup", why: "Recently registered businesses often need IT setup.", confidence: 45, cta: "Offer a brief intro call to discuss setup needs." },
      { angle: !hasWebsite ? "Website and domain setup" : "Ongoing local IT support", why: !hasWebsite ? "No verified website found." : "Local businesses value nearby IT support.", confidence: 40, cta: "Ask if they'd like help getting online." },
    ],
    evidence,
    warnings: [
      "Generated by the deterministic stub model (no OpenAI key configured).",
      ...(hasCategory ? [] : ["Limited source data"]),
      ...(hasWebsite ? [] : ["Website not verified"]),
    ],
  };
}

async function callOpenAiJson(
  system: string,
  user: string,
  model: string,
  temperature: number,
): Promise<{ content: string; usage: ModelUsage }> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.AI_REQUEST_TIMEOUT_MS });
  try {
    const res = await client.chat.completions.create({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = res.choices[0]?.message?.content ?? "";
    return {
      content,
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "APIConnectionTimeoutError" || name === "TimeoutError") {
      throw new AiError("TIMEOUT");
    }
    const status = (error as { status?: number })?.status;
    if (status === 401) throw new AiError("MISSING_API_KEY", "Invalid OpenAI API key.");
    if (status === 429) throw new AiError("RATE_LIMITED");
    if (status === 404) throw new AiError("MODEL_UNAVAILABLE");
    throw new AiError("MODEL_UNAVAILABLE");
  }
}

/** Run the structured analysis (OpenAI when configured, else the labeled stub). */
export async function generateAnalysis(
  context: AiContext,
  opts: { model: string; temperature: number },
): Promise<AnalysisResult> {
  if (env.AI_ENABLED !== "true") throw new AiError("AI_DISABLED");

  if (!env.OPENAI_API_KEY) {
    const output = deriveStubAnalysis(context);
    return {
      output,
      usage: { inputTokens: estimateTokens(context.text), outputTokens: 300 },
      model: STUB_MODEL,
      stub: true,
    };
  }

  const { system, user } = buildAnalysisPrompt(context.text);
  let attempt = await callOpenAiJson(system, user, opts.model, opts.temperature);
  let parsed = safeParseJson(attempt.content);
  let validated = parsed ? aiStructuredOutputSchema.safeParse(parsed) : null;

  if (!validated?.success) {
    // One repair attempt.
    const repair = await callOpenAiJson(
      system,
      `${user}\n\nYour previous response was invalid JSON or failed schema validation. Return ONLY corrected JSON matching the schema.`,
      opts.model,
      0,
    );
    attempt = { content: repair.content, usage: {
      inputTokens: attempt.usage.inputTokens + repair.usage.inputTokens,
      outputTokens: attempt.usage.outputTokens + repair.usage.outputTokens,
    } };
    parsed = safeParseJson(repair.content);
    validated = parsed ? aiStructuredOutputSchema.safeParse(parsed) : null;
    if (!validated?.success) throw new AiError("OUTPUT_VALIDATION_FAILED");
  }

  return { output: validated.data, usage: attempt.usage, model: opts.model, stub: false };
}

/** Generate one outreach draft (OpenAI when configured, else the labeled stub). */
export async function generateDraft(
  context: AiContext,
  opts: { draftType: string; tone: string; angle?: string | null; model: string; temperature: number },
): Promise<DraftResult> {
  if (env.AI_ENABLED !== "true") throw new AiError("AI_DISABLED");
  const allowedValues = context.fields.map((f) => f.value);

  if (!env.OPENAI_API_KEY) {
    const name = fieldMap(context.fields).get("businessName") ?? "your business";
    const city = fieldMap(context.fields).get("businessCity") ?? "your area";
    const body =
      `Hi there,\n\nI came across ${name} in the ${city} area and wanted to introduce ` +
      `VirtuoTech Services — we help local businesses with IT setup, business email, ` +
      `Wi-Fi/networking, and websites.\n\nWould you be open to a short call to see if we can help?`;
    return {
      output: { draftType: opts.draftType as DraftOutput["draftType"], tone: opts.tone as DraftOutput["tone"], subject: `Quick intro from VirtuoTech Services`, body, callToAction: "Reply to schedule a brief call." },
      usage: { inputTokens: estimateTokens(context.text), outputTokens: 120 },
      model: STUB_MODEL,
      stub: true,
    };
  }

  const { system, user } = buildDraftPrompt({ contextText: context.text, draftType: opts.draftType, tone: opts.tone, angle: opts.angle });
  const attempt = await callOpenAiJson(system, user, opts.model, opts.temperature);
  const parsed = safeParseJson(attempt.content);
  const validated = parsed ? draftSchema.safeParse(parsed) : null;
  if (!validated?.success) throw new AiError("OUTPUT_VALIDATION_FAILED");

  // Reject fabricated contact info in the draft.
  const invented = findInventedContact(
    `${validated.data.subject ?? ""} ${validated.data.body} ${validated.data.callToAction ?? ""}`,
    allowedValues,
  );
  if (invented.length > 0) throw new AiError("INVALID_RESPONSE", "Draft contained unverified contact info.");

  return { output: validated.data, usage: attempt.usage, model: opts.model, stub: false };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Tolerate code fences / stray text around the object.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
