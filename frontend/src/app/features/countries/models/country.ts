export const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic'] as const;
export type CountryRegion = typeof REGIONS[number];
export type CountrySort = 'name' | 'population';
export type SortDirection = 'asc' | 'desc';
export interface CountryQuery {
  search: string;
  region: CountryRegion | '';
  sort: CountrySort;
  direction: SortDirection;
}
export interface CountryFlag { png: string | null; svg: string | null; alt: string; }
export interface CountrySummary {
  code: string;
  name: string;
  capital: string | null;
  population: number | null;
  region: string | null;
  flag: CountryFlag;
}
export interface CountryCurrency { code: string | null; name: string | null; symbol: string | null; }
export interface CountryLanguage { code: string | null; name: string | null; }
export interface CountryDetail extends Omit<CountrySummary, 'capital'> {
  officialName: string | null;
  // Phase 2A DTO uses singular "capital" for the array.
  capital: string[];
  area: number | null;
  populationDensity: number | null;
  subregion: string | null;
  currencies: CountryCurrency[];
  languages: CountryLanguage[];
  timezones: string[];
  borders: string[];
  callingCodes: string[];
  drivingSide: string | null;
  coordinates: { latitude: number | null; longitude: number | null } | null;
}
