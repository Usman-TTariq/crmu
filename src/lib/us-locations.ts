import { City, State } from "country-state-city";
import zipcodes from "zipcodes";

export type UsState = { code: string; name: string };

/** US states + DC (excludes remote territories for a cleaner Lead Gen list). */
const SKIP_CODES = new Set(["AS", "FM", "GU", "MH", "MP", "PR", "PW", "UM", "VI"]);

let _states: UsState[] | null = null;

export function usStates(): UsState[] {
  if (_states) return _states;
  _states = State.getStatesOfCountry("US")
    .filter((s) => !SKIP_CODES.has(s.isoCode))
    .map((s) => ({ code: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return _states;
}

export function usStateCodes(): string[] {
  return usStates().map((s) => s.code);
}

export function usStateLabel(code: string): string {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return "";
  const hit = usStates().find((s) => s.code === c);
  return hit ? `${hit.name} (${hit.code})` : code;
}

/** Map full name or code → USPS 2-letter code when possible. */
export function normalizeStateCode(raw: unknown): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (t.length === 2) return t.toUpperCase();
  const byName = usStates().find((s) => s.name.toLowerCase() === t.toLowerCase());
  if (byName) return byName.code;
  const bare = t.replace(/\s*\([A-Z]{2}\)\s*$/i, "").trim();
  const byBare = usStates().find((s) => s.name.toLowerCase() === bare.toLowerCase());
  return byBare ? byBare.code : t;
}

const cityCache = new Map<string, string[]>();

export function citiesForState(stateRaw: unknown): string[] {
  const code = normalizeStateCode(stateRaw);
  if (!code || code.length !== 2) return [];
  const cached = cityCache.get(code);
  if (cached) return cached;
  const list = City.getCitiesOfState("US", code)
    .map((c) => c.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  // de-dupe (dataset can repeat names)
  const uniq = Array.from(new Set(list));
  cityCache.set(code, uniq);
  return uniq;
}

/** Ensure current city stays selectable even if not in the package list. */
export function cityOptionsForState(stateRaw: unknown, currentCity?: unknown): string[] {
  const cities = citiesForState(stateRaw);
  const cur = String(currentCity || "").trim();
  if (cur && !cities.includes(cur)) return [cur, ...cities];
  return cities;
}

const zipCache = new Map<string, string[]>();

/** ZIP codes for a US city (+ optional nearest match when the place has no listed ZIPs). */
export function zipCodesForCity(stateRaw: unknown, cityRaw: unknown): string[] {
  const state = normalizeStateCode(stateRaw);
  const city = String(cityRaw || "").trim();
  if (!state || state.length !== 2 || !city) return [];

  const key = `${state}|${city.toLowerCase()}`;
  const cached = zipCache.get(key);
  if (cached) return cached;

  const byName = zipcodes.lookupByName(city, state) || [];
  let zips = Array.from(new Set(byName.map((h) => String(h.zip || "").trim()).filter(Boolean))).sort();

  if (!zips.length) {
    const geo = City.getCitiesOfState("US", state).find(
      (c) => c.name.toLowerCase() === city.toLowerCase()
    );
    if (geo?.latitude && geo?.longitude) {
      const near = zipcodes.lookupByCoords(Number(geo.latitude), Number(geo.longitude));
      if (near?.zip) zips = [String(near.zip)];
    }
  }

  zipCache.set(key, zips);
  return zips;
}

/** Zip dropdown options; keeps a manually entered current zip selectable. */
export function zipOptionsForCity(
  stateRaw: unknown,
  cityRaw: unknown,
  currentZip?: unknown
): string[] {
  const zips = zipCodesForCity(stateRaw, cityRaw);
  const cur = String(currentZip || "").trim();
  if (cur && !zips.includes(cur)) return [cur, ...zips];
  return zips;
}

/** Prefer keeping current zip if still valid; else sole match; else empty. */
export function defaultZipForCity(
  stateRaw: unknown,
  cityRaw: unknown,
  currentZip?: unknown
): string {
  const zips = zipCodesForCity(stateRaw, cityRaw);
  const cur = String(currentZip || "").trim();
  if (cur && zips.includes(cur)) return cur;
  if (zips.length === 1) return zips[0];
  return "";
}
