import { HttpErrorResponse } from '@angular/common/http';
export type CountryFailure = 'not-found' | 'unavailable' | 'invalid-query' | 'unexpected';
export type CountryLoadState<T> = { status: 'loading' } | { status: 'success'; data: T } |
  { status: 'error'; failure: CountryFailure };
export function countryFailure(error: unknown): CountryFailure {
  if (!(error instanceof HttpErrorResponse)) return 'unexpected';
  const body: unknown = error.error;
  const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
  if (code === 'COUNTRY_NOT_FOUND' || error.status === 404) return 'not-found';
  if (code === 'COUNTRY_SERVICE_UNAVAILABLE' || error.status === 503) return 'unavailable';
  if (code === 'INVALID_QUERY_PARAMETER') return 'invalid-query';
  return 'unexpected';
}
