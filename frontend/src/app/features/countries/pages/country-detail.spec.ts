import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { CountryDetail } from './country-detail';
import { CountryMap } from '../components/country-map';
import { detail } from '../models/country.fixture';
@Component({ selector: 'app-country-map', template: '' })
class MapStub { latitude = input.required<number>(); longitude = input.required<number>(); countryName = input.required<string>(); }
describe('Country detail', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  async function render() { harness.detectChanges(); await harness.fixture.whenStable(); }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    TestBed.overrideComponent(CountryDetail, { remove: { imports: [CountryMap] }, add: { imports: [MapStub] } });
    http = TestBed.inject(HttpTestingController); harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/countries/SVN');
  });
  afterEach(() => http.verify());
  it('loads from route code, renders full localized facts and uses a 72 × 48 flag', async () => {
    expect(element().textContent).toContain('Nalaganje države');
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render();
    for (const text of ['Slovenija', 'Republika Slovenija', 'Ljubljana', '2.100.000', '20.273', '103,59', 'Evropa', 'Srednja Evropa', 'slovenščina', 'EUR', 'UTC+01:00', '+386', 'desno']) expect(element().textContent).toContain(text);
    const flag = element().querySelector('img')!; expect(flag.width).toBe(72); expect(flag.height).toBe(48);
    expect(element().querySelectorAll('h1')).toHaveLength(1);
    expect(element().querySelector('a[href="/countries/AUT"]')).not.toBeNull();
    expect(element().querySelector('app-country-map')).not.toBeNull();
    await harness.navigateByUrl('/countries/AUT'); http.expectOne('/api/v1/countries/AUT').flush({ ...detail, code: 'AUT', name: 'Avstrija' });
    await render(); expect(element().querySelector('h1')?.textContent).toBe('Avstrija');
  });
  it('omits unavailable optional facts and gives neutral geographic context', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ ...detail, officialName: null, capital: [], population: null, area: null,
      populationDensity: null, region: null, subregion: null, currencies: [], languages: [], timezones: [], borders: [],
      callingCodes: [], drivingSide: null, coordinates: { latitude: null, longitude: null }, flag: { png: null, svg: null, alt: '' } });
    await render(); expect(element().textContent).not.toMatch(/undefined|null/);
    expect(element().textContent).not.toContain('Gostota prebivalstva');
    expect(element().textContent).not.toContain('Stran vožnje');
    expect(element().textContent).not.toContain('Ni kopenskih meja.');
    expect(element().textContent).toContain('Podatki o mejnih državah niso na voljo.');
    expect(element().textContent).toContain('Koordinate za prikaz zemljevida niso na voljo.');
    expect(element().querySelector('app-country-map')).toBeNull();
  });
  it.each([
    ['left', 'levo'], ['right', 'desno'], ['unexpected', 'Ni podatka'],
    [null, undefined], [undefined, undefined],
  ])('renders driving side %s safely', async (drivingSide, expected) => {
    http.expectOne('/api/v1/countries/SVN').flush({ ...detail, drivingSide }); await render();
    const label = [...element().querySelectorAll('dt')].find(dt => dt.textContent === 'Stran vožnje');
    expect(label?.nextElementSibling?.textContent).toBe(expected);
  });
  it('renders country-specific 404 with a real explorer link', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ code: 'COUNTRY_NOT_FOUND' }, { status: 404, statusText: 'Not found' });
    await render(); expect(element().querySelector('h1')?.textContent).toBe('Države ni bilo mogoče najti.');
    expect(element().querySelector('a[href="/"]')).not.toBeNull(); expect(element().querySelector('button')).toBeNull();
  });
  it('retries service failure without exposing technical details', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ code: 'COUNTRY_SERVICE_UNAVAILABLE', detail: 'technical data' }, { status: 503, statusText: 'Unavailable' });
    await render(); expect(element().textContent).toContain('Podatki o državi trenutno niso na voljo.');
    expect(element().textContent).not.toContain('technical data'); element().querySelector('button')!.click(); await render();
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render(); expect(element().querySelector('h1')?.textContent).toBe('Slovenija');
  });
  it('renders safe generic copy for unexpected errors', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ code: 'INTERNAL_ERROR', detail: 'stacktrace' }, { status: 500, statusText: 'Error' });
    await render(); expect(element().textContent).not.toContain('stacktrace'); expect(element().textContent).toContain('Poskusi znova');
  });
});
