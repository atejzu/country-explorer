import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CountryApi } from './country-api';
import { DEFAULT_QUERY } from '../models/country-query';
import { detail, summary } from '../models/country.fixture';
describe('CountryApi', () => {
  let http: HttpTestingController;
  let api: CountryApi;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); api = TestBed.inject(CountryApi);
  });
  afterEach(() => http.verify());
  it('requests the relative list endpoint and serializes every query field', () => {
    const received = vi.fn();
    api.getCountries({ search: ' land ', region: 'Europe', sort: 'population', direction: 'desc' }).subscribe(received);
    const request = http.expectOne(r => r.url === '/api/v1/countries');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['direction', 'region', 'search', 'sort']);
    expect(request.request.params.get('search')).toBe('land');
    expect(request.request.params.get('region')).toBe('Europe');
    expect(request.request.params.get('sort')).toBe('population');
    expect(request.request.params.get('direction')).toBe('desc');
    request.flush([summary]); expect(received).toHaveBeenCalledWith([summary]);
  });
  it('omits blank filters and supplies canonical ordering defaults', () => {
    api.getCountries({ ...DEFAULT_QUERY, search: '   ' }).subscribe();
    const request = http.expectOne('/api/v1/countries?sort=name&direction=asc');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('region')).toBe(false); request.flush([]);
  });
  it('requests detail independently and preserves the actual capital array and nullable fields', () => {
    const received = vi.fn(); api.getCountry('SVN').subscribe(received);
    const request = http.expectOne('/api/v1/countries/SVN'); expect(request.request.method).toBe('GET');
    const response = { ...detail, coordinates: null, populationDensity: null };
    request.flush(response); expect(received).toHaveBeenCalledWith(response);
    expect(received.mock.calls[0][0].capital).toEqual(['Ljubljana']);
  });
  it('encodes the country code as one path segment', () => {
    api.getCountry('A/B').subscribe(); http.expectOne('/api/v1/countries/A%2FB').flush(detail);
  });
});
