import { ParamMap, Params } from '@angular/router';
import { CountryQuery, REGIONS } from './country';
export const DEFAULT_QUERY: CountryQuery = { search: '', region: '', sort: 'name', direction: 'asc' };
export function readCountryQuery(params: ParamMap): CountryQuery {
  const region = params.get('region')?.trim().toLowerCase();
  return {
    search: params.get('search')?.trim() ?? '',
    region: REGIONS.find(value => value.toLowerCase() === region) ?? '',
    sort: params.get('sort') === 'population' ? 'population' : 'name',
    direction: params.get('direction') === 'desc' ? 'desc' : 'asc',
  };
}
export function sameQuery(a: CountryQuery, b: CountryQuery): boolean {
  return a.search === b.search && a.region === b.region && a.sort === b.sort && a.direction === b.direction;
}
export function queryParams(query: CountryQuery): Params {
  return { search: query.search.trim() || null, region: query.region || null,
    sort: query.sort === 'name' ? null : query.sort,
    direction: query.direction === 'asc' ? null : query.direction };
}
