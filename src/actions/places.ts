"use server";

// Google Places API (New) — server-only. Autocomplete + place details for
// Lead Gen Business Address (US). Key never reaches the browser.

import { requireAuth } from "@/lib/session";

export interface AddressSuggestion {
  placeId: string;
  label: string;
}

export interface ResolvedAddress {
  business_address: string;
  city: string;
  state: string;
  zip_code: string;
}

type PlacePrediction = {
  placeId?: string;
  text?: { text?: string };
};

type AutocompleteResponse = {
  suggestions?: Array<{ placePrediction?: PlacePrediction }>;
  error?: { message?: string };
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type PlaceDetailsResponse = {
  addressComponents?: AddressComponent[];
  error?: { message?: string };
};

function apiKey(): string | null {
  const k = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return k || null;
}

function componentOf(parts: AddressComponent[], type: string): AddressComponent | undefined {
  return parts.find((c) => c.types?.includes(type));
}

function mapComponents(parts: AddressComponent[]): ResolvedAddress {
  const streetNumber = componentOf(parts, "street_number")?.longText || "";
  const route = componentOf(parts, "route")?.longText || "";
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();

  const city =
    componentOf(parts, "locality")?.longText ||
    componentOf(parts, "postal_town")?.longText ||
    componentOf(parts, "sublocality")?.longText ||
    componentOf(parts, "sublocality_level_1")?.longText ||
    "";

  const state = componentOf(parts, "administrative_area_level_1")?.shortText || "";
  const zip = componentOf(parts, "postal_code")?.longText || "";

  return {
    business_address: street,
    city,
    state,
    zip_code: zip,
  };
}

export async function suggestAddresses(payload: {
  query: string;
}): Promise<{ suggestions: AddressSuggestion[]; error?: string }> {
  try {
    await requireAuth();
    const key = apiKey();
    if (!key) return { suggestions: [] };

    const q = String(payload.query || "").trim();
    if (q.length < 3) return { suggestions: [] };

    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    };
    const baseBody = {
      input: q,
      regionCode: "US",
      includedRegionCodes: ["us"],
      languageCode: "en",
    };

    const parse = (data: AutocompleteResponse): AddressSuggestion[] =>
      (data.suggestions || [])
        .map((s) => s.placePrediction)
        .filter((p): p is PlacePrediction => !!p?.placeId && !!p.text?.text)
        .map((p) => ({ placeId: String(p.placeId), label: String(p.text!.text) }));

    let res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...baseBody,
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      }),
    });
    let data = (await res.json()) as AutocompleteResponse;
    if (!res.ok) {
      return { suggestions: [], error: data.error?.message || "Address lookup failed." };
    }

    let suggestions = parse(data);
    // Broaden if address-type filter returns nothing (common while typing)
    if (!suggestions.length) {
      res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers,
        body: JSON.stringify(baseBody),
      });
      data = (await res.json()) as AutocompleteResponse;
      if (!res.ok) {
        return { suggestions: [], error: data.error?.message || "Address lookup failed." };
      }
      suggestions = parse(data);
    }

    return { suggestions };
  } catch (e) {
    return {
      suggestions: [],
      error: e instanceof Error ? e.message : "Address lookup failed.",
    };
  }
}

export async function resolveAddress(payload: {
  placeId: string;
}): Promise<{ address?: ResolvedAddress; error?: string }> {
  try {
    await requireAuth();
    const key = apiKey();
    if (!key) return { error: "Address autocomplete is not configured." };

    const placeId = String(payload.placeId || "").trim();
    if (!placeId) return { error: "Missing place." };

    const pathId = placeId.startsWith("places/") ? placeId.slice("places/".length) : placeId;
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pathId)}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "addressComponents",
      },
    });

    const data = (await res.json()) as PlaceDetailsResponse;
    if (!res.ok) {
      return { error: data.error?.message || "Could not resolve address." };
    }

    const address = mapComponents(data.addressComponents || []);
    if (!address.business_address && !address.city && !address.zip_code) {
      return { error: "No address details returned." };
    }
    return { address };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not resolve address." };
  }
}
