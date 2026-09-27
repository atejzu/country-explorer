import { CountryRegion, REGIONS } from './country';
export const REGION_LABELS: Record<CountryRegion, string> = {
  Africa: 'Afrika', Americas: 'Amerike', Asia: 'Azija', Europe: 'Evropa',
  Oceania: 'Oceanija', Antarctic: 'Antarktika',
};
const SUBREGIONS: Record<string, string> = {
  'Northern Africa': 'Severna Afrika', 'Western Africa': 'Zahodna Afrika',
  'Middle Africa': 'Srednja Afrika', 'Eastern Africa': 'Vzhodna Afrika', 'Southern Africa': 'Južna Afrika',
  'North America': 'Severna Amerika', 'Northern America': 'Severna Amerika',
  'Central America': 'Srednja Amerika', Caribbean: 'Karibi', 'South America': 'Južna Amerika',
  'Central Asia': 'Srednja Azija', 'Eastern Asia': 'Vzhodna Azija', 'South-Eastern Asia': 'Jugovzhodna Azija',
  'Southern Asia': 'Južna Azija', 'Western Asia': 'Zahodna Azija',
  'Central Europe': 'Srednja Evropa', 'Eastern Europe': 'Vzhodna Evropa', 'Northern Europe': 'Severna Evropa',
  'Southern Europe': 'Južna Evropa', 'Western Europe': 'Zahodna Evropa',
  'Australia and New Zealand': 'Avstralija in Nova Zelandija', Melanesia: 'Melanezija',
  Micronesia: 'Mikronezija', Polynesia: 'Polinezija', Antarctic: 'Antarktika', Antarctica: 'Antarktika',
};
export function regionLabel(region: string | null): string {
  const knownRegion = REGIONS.find(value => value === region);
  return knownRegion ? REGION_LABELS[knownRegion] : 'Ni podatka';
}
export function drivingSideLabel(side: string | null | undefined): string {
  switch (side) {
    case 'left': return 'levo';
    case 'right': return 'desno';
    default: return 'Ni podatka';
  }
}
export const subregionLabel = (region: string): string => SUBREGIONS[region] ?? 'Ni podatka';
export function displayName(type: 'currency' | 'language', code: string | null, fallback: string | null): string {
  if (code && typeof Intl.DisplayNames === 'function') {
    try {
      const name = new Intl.DisplayNames('sl-SI', { type, fallback: 'none' }).of(code);
      if (name) return name;
    } catch { /* Unsupported or incomplete source code: use the API name. */ }
  }
  return fallback || code || '';
}
