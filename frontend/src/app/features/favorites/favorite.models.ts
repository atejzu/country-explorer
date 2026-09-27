import { CountrySummary } from '../countries/models/country';

export interface FavoriteCountry {
  country: CountrySummary;
  favoritedAt: string;
}

/** A locally added country has no server timestamp until a subsequent list load. */
export interface FavoriteEntry {
  country: CountrySummary;
  favoritedAt: string | null;
}

export function normalizeCountryCode(code: string): string { return code.trim().toUpperCase(); }
