import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CountryDetail, CountryQuery, CountrySummary } from '../models/country';
@Injectable({ providedIn: 'root' })
export class CountryApi {
  private readonly http = inject(HttpClient);
  getCountries(query: CountryQuery): Observable<CountrySummary[]> {
    let params = new HttpParams().set('sort', query.sort).set('direction', query.direction);
    if (query.search.trim()) params = params.set('search', query.search.trim());
    if (query.region) params = params.set('region', query.region);
    return this.http.get<CountrySummary[]>('/api/v1/countries', { params });
  }
  getCountry(code: string): Observable<CountryDetail> {
    return this.http.get<CountryDetail>(`/api/v1/countries/${encodeURIComponent(code)}`);
  }
}
