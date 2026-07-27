/** Enrichable fields (also used as source-record field names). */
export type EnrichmentField =
  | "website"
  | "phone"
  | "publicEmail"
  | "contactPageUrl"
  | "facebookUrl"
  | "linkedinUrl"
  | "instagramUrl"
  | "xUrl"
  | "youtubeUrl"
  | "businessCategory"
  | "googlePlace";

/** A structured result from a provider. Providers NEVER write to the database. */
export type ProviderResult = {
  field: EnrichmentField;
  value: string;
  normalizedValue?: string | null;
  source: string;
  sourceUrl?: string | null;
  confidence: number; // 0..100
  matchReason?: string | null;
  metadata?: Record<string, unknown>;
  retrievedAt: Date;
};

/** The operations a job may perform per lead. */
export type EnrichmentOperations = {
  googlePlaces: boolean;
  websiteDiscovery: boolean;
  websiteCrawl: boolean;
  phone: boolean;
  email: boolean;
  social: boolean;
};

export const DEFAULT_OPERATIONS: EnrichmentOperations = {
  googlePlaces: true,
  websiteDiscovery: true,
  websiteCrawl: true,
  phone: true,
  email: true,
  social: true,
};

/** Options captured on a job (stored as JSON). */
export type EnrichmentOptions = {
  operations: EnrichmentOperations;
  skipRecentlyEnriched: boolean;
  cacheDays: number;
  retryFailed: boolean;
  maxLeads: number | null;
  reviewConfidenceThreshold: number;
  forceRefresh: boolean;
};

/** The lead data providers operate on (filing + optional manual signals). */
export type LeadEnrichmentInput = {
  businessRecordId: string;
  businessName: string;
  normalizedBusinessName: string;
  entityType: string | null;
  filingAddress1: string | null;
  filingCity: string | null;
  filingState: string | null;
  filingZip: string | null;
  businessCity: string | null;
  county: string | null;
  manualWebsite: string | null;
  manualPhone: string | null;
};
