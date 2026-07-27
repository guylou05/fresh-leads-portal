import { EnrichmentError } from "@/lib/enrichment/errors";
import type { GoogleCandidate } from "@/lib/enrichment/matching";
import type { LeadEnrichmentInput } from "@/lib/enrichment/types";

const TEXT_SEARCH = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";
const DETAIL_FIELDS = "place_id,name,website,formatted_phone_number,address_component,business_status,types,url";

type TextSearchResponse = {
  status: string;
  results?: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    business_status?: string;
    types?: string[];
  }>;
  error_message?: string;
};

type AddressComponent = { long_name: string; short_name: string; types: string[] };
type DetailsResponse = {
  status: string;
  result?: {
    place_id: string;
    name: string;
    website?: string;
    formatted_phone_number?: string;
    business_status?: string;
    types?: string[];
    url?: string;
    address_components?: AddressComponent[];
  };
};

function componentValue(
  components: AddressComponent[] | undefined,
  type: string,
  useShort = false,
): string | null {
  const match = components?.find((c) => c.types.includes(type));
  if (!match) return null;
  return useShort ? match.short_name : match.long_name;
}

async function googleFetch<T>(url: string, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new EnrichmentError("PROVIDER_UNAVAILABLE", "Google request timed out.");
    }
    throw new EnrichmentError("PROVIDER_UNAVAILABLE");
  }
  if (res.status === 429) throw new EnrichmentError("RATE_LIMITED");
  if (!res.ok) throw new EnrichmentError("PROVIDER_UNAVAILABLE");
  return (await res.json()) as T;
}

export type GooglePlacesResult = {
  candidates: GoogleCandidate[];
  requestCount: number;
};

/**
 * Look up Google Places candidates for a business. Requires a configured API
 * key (server-side only). Returns scored-ready candidates + the request count
 * for usage/cost tracking. Never auto-selects; matching.ts scores results.
 */
export async function googlePlacesLookup(
  input: LeadEnrichmentInput,
  opts: { apiKey: string | undefined; timeoutMs: number; detailLimit?: number },
): Promise<GooglePlacesResult> {
  if (!opts.apiKey) {
    throw new EnrichmentError("INVALID_API_KEY");
  }
  const queryParts = [
    input.businessName,
    input.businessCity ?? input.filingCity,
    input.filingState,
  ].filter(Boolean);
  const query = encodeURIComponent(queryParts.join(" "));

  const searchUrl = `${TEXT_SEARCH}?query=${query}&key=${opts.apiKey}`;
  const search = await googleFetch<TextSearchResponse>(searchUrl, opts.timeoutMs);
  let requestCount = 1;

  if (search.status === "REQUEST_DENIED") throw new EnrichmentError("INVALID_API_KEY");
  if (search.status === "OVER_QUERY_LIMIT") throw new EnrichmentError("RATE_LIMITED");
  if (search.status === "ZERO_RESULTS" || !search.results?.length) {
    return { candidates: [], requestCount };
  }

  const detailLimit = opts.detailLimit ?? 3;
  const candidates: GoogleCandidate[] = [];
  for (const result of search.results.slice(0, detailLimit)) {
    const detailsUrl = `${DETAILS}?place_id=${encodeURIComponent(result.place_id)}&fields=${DETAIL_FIELDS}&key=${opts.apiKey}`;
    let details: DetailsResponse;
    try {
      details = await googleFetch<DetailsResponse>(detailsUrl, opts.timeoutMs);
      requestCount += 1;
    } catch {
      details = { status: "ERROR" };
    }
    const d = details.result;
    const comps = d?.address_components;
    candidates.push({
      placeId: result.place_id,
      name: d?.name ?? result.name,
      city: componentValue(comps, "locality"),
      state: componentValue(comps, "administrative_area_level_1", true),
      zip: componentValue(comps, "postal_code"),
      address: result.formatted_address ?? null,
      website: d?.website ?? null,
      phone: d?.formatted_phone_number ?? null,
      businessStatus: d?.business_status ?? result.business_status ?? null,
      types: d?.types ?? result.types ?? [],
    });
  }

  return { candidates, requestCount };
}
