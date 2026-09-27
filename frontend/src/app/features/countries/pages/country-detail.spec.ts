import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { initializeTestSession } from '../../../core/auth/auth.fixture';
import { CountryDetail } from './country-detail';
import { CountryMap } from '../components/country-map';
import { detail } from '../models/country.fixture';
import { discussion, page } from '../../community/community.fixture';
@Component({ selector: 'app-country-map', template: '' })
class MapStub { latitude = input.required<number>(); longitude = input.required<number>(); countryName = input.required<string>(); }
describe('Country detail', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  async function render() { harness.detectChanges(); await harness.fixture.whenStable(); }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    TestBed.overrideComponent(CountryDetail, { remove: { imports: [CountryMap] }, add: { imports: [MapStub] } });
    http = TestBed.inject(HttpTestingController);
    await initializeTestSession();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/countries/SVN');
  });
  afterEach(() => http.verify());
  function discussions(code = 'SVN'): void {
    http.expectOne(`/api/v1/countries/${code}/discussions?page=0&size=10`).flush(page([], 0, 10));
  }
  it('loads from route code, renders full localized facts and uses a 72 × 48 flag', async () => {
    expect(element().textContent).toContain('Nalaganje države');
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render(); discussions();
    for (const text of ['Slovenija', 'Republika Slovenija', 'Ljubljana', '2.100.000', '20.273', '103,59', 'Evropa', 'Srednja Evropa', 'slovenščina', 'EUR', 'UTC+01:00', '+386', 'desno']) expect(element().textContent).toContain(text);
    const flag = element().querySelector('img')!; expect(flag.width).toBe(72); expect(flag.height).toBe(48);
    expect(element().querySelectorAll('h1')).toHaveLength(1);
    expect(element().querySelector('a[href="/countries/AUT"]')).not.toBeNull();
    expect(element().querySelector('app-country-map')).not.toBeNull();
    await harness.navigateByUrl('/countries/AUT'); http.expectOne('/api/v1/countries/AUT').flush({ ...detail, code: 'AUT', name: 'Avstrija' });
    await render(); discussions('AUT'); expect(element().querySelector('h1')?.textContent).toBe('Avstrija');
  });
  it('omits unavailable optional facts and gives neutral geographic context', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ ...detail, officialName: null, capital: [], population: null, area: null,
      populationDensity: null, region: null, subregion: null, currencies: [], languages: [], timezones: [], borders: [],
      callingCodes: [], drivingSide: null, coordinates: { latitude: null, longitude: null }, flag: { png: null, svg: null, alt: '' } });
    await render(); discussions(); expect(element().textContent).not.toMatch(/undefined|null/);
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
    http.expectOne('/api/v1/countries/SVN').flush({ ...detail, drivingSide }); await render(); discussions();
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
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render(); discussions(); expect(element().querySelector('h1')?.textContent).toBe('Slovenija');
  });
  it('renders safe generic copy for unexpected errors', async () => {
    http.expectOne('/api/v1/countries/SVN').flush({ code: 'INTERNAL_ERROR', detail: 'stacktrace' }, { status: 500, statusText: 'Error' });
    await render(); expect(element().textContent).not.toContain('stacktrace'); expect(element().textContent).toContain('Poskusi znova');
  });
  it('loads authenticated favourites independently, renders public details on favourite failure and permits saving', async () => {
    await initializeTestSession(true); await render();
    http.expectOne('/api/v1/users/me/favorites').flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render(); discussions();
    expect(element().querySelector('h1')?.textContent).toBe('Slovenija');
    expect(element().querySelector('app-country-map')).not.toBeNull();
    const button = element().querySelector<HTMLButtonElement>('app-favorite-button button')!;
    expect(button.textContent).toContain('Shrani državo'); button.click(); await render();
    expect(button.textContent).toContain('Shranjeno'); expect(button.getAttribute('aria-pressed')).toBe('true');
    http.expectOne('/api/v1/users/me/favorites/SVN').flush(null);
    await harness.navigateByUrl('/countries/AUT'); http.expectOne('/api/v1/countries/AUT').flush({ ...detail, code: 'AUT' }); await render(); discussions('AUT');
    // A failed list can retry at a later view, but a reused detail view does not loop.
    http.expectNone('/api/v1/users/me/favorites');
  });
  it('reflects the existing shared favourite state on detail', async () => {
    await initializeTestSession(true); await render();
    http.expectOne('/api/v1/users/me/favorites').flush([{ country: { ...detail, capital: 'Ljubljana' }, favoritedAt: '2026-09-26T11:45:00Z' }]);
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render(); discussions();
    const button = element().querySelector<HTMLButtonElement>('app-favorite-button button')!;
    expect(button.textContent).toContain('Shranjeno'); button.click(); await render();
    expect(button.textContent).toContain('Shrani državo'); http.expectOne('/api/v1/users/me/favorites/SVN').flush(null);
  });
  it('keeps facts and map visible during discussion loading, failure and pagination', async () => {
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render();
    expect(element().querySelector('h1')?.textContent).toBe('Slovenija');
    expect(element().textContent).toContain('Nalaganje razprav');
    http.expectOne('/api/v1/countries/SVN/discussions?page=0&size=10').error(new ProgressEvent('error')); await render();
    expect(element().querySelector('app-country-map')).not.toBeNull();
    const section = element().querySelector('app-discussion-list')!;
    const retry = [...section.querySelectorAll('button')].find(b => b.textContent === 'Poskusi znova')!;
    retry.click(); await render();
    http.expectOne('/api/v1/countries/SVN/discussions?page=0&size=10').flush(page([discussion], 0, 10, 11)); await render();
    [...section.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Naslednja stran')!.click(); await render();
    expect(element().querySelector('h1')?.textContent).toBe('Slovenija'); expect(element().querySelector('app-country-map')).not.toBeNull();
    http.expectNone('/api/v1/countries/SVN');
    http.expectOne('/api/v1/countries/SVN/discussions?page=1&size=10').flush(page([discussion], 1, 10, 11));
  });

  it('cancels a held country request when the country route changes', async () => {
    const oldCountry = http.expectOne('/api/v1/countries/SVN');
    await harness.navigateByUrl('/countries/ITA'); await render();
    expect(oldCountry.cancelled).toBe(true);
    http.expectOne('/api/v1/countries/ITA').flush({ ...detail, code: 'ITA', name: 'Italija' }); await render(); discussions('ITA');
    expect(() => oldCountry.flush(detail)).toThrow(/cancelled/);
    expect(element().querySelector('h1')?.textContent).toBe('Italija');
    http.expectNone('/api/v1/countries/SVN/discussions?page=0&size=10');
  });
  it('cancels held SVN discussions before loading ITA discussions on route reuse', async () => {
    http.expectOne('/api/v1/countries/SVN').flush(detail); await render();
    const oldDiscussions = http.expectOne('/api/v1/countries/SVN/discussions?page=0&size=10');
    await harness.navigateByUrl('/countries/ITA'); await render(); expect(oldDiscussions.cancelled).toBe(true);
    http.expectOne('/api/v1/countries/ITA').flush({ ...detail, code: 'ITA', name: 'Italija' }); await render();
    http.expectOne('/api/v1/countries/ITA/discussions?page=0&size=10').flush(page([{ ...discussion, countryCode: 'ITA', title: 'Pogovor o Italiji' }], 0, 10)); await render();
    expect(() => oldDiscussions.flush(page([discussion], 0, 10))).toThrow(/cancelled/);
    expect(element().querySelector('h1')?.textContent).toBe('Italija');
    expect(element().textContent).toContain('Pogovor o Italiji'); expect(element().textContent).not.toContain(discussion.title);
  });

});
