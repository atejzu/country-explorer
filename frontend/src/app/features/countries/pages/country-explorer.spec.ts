import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { appConfig } from '../../../app.config';
import { initializeTestSession } from '../../../core/auth/auth.fixture';
import { summary } from '../models/country.fixture';
describe('Country explorer', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  const element = () => harness.routeNativeElement!;
  const input = () => element().querySelector<HTMLInputElement>('#search')!;
  const request = () => http.expectOne(r => r.url === '/api/v1/countries');
  async function render() { harness.detectChanges(); await harness.fixture.whenStable(); }
  async function start(url = '/') { await harness.navigateByUrl(url); await render(); }
  async function select(id: string, value: string) {
    const field = element().querySelector<HTMLSelectElement>('#' + id)!;
    field.value = value; field.dispatchEvent(new Event('change')); await render();
  }
  function type(value: string) { input().value = value; input().dispatchEvent(new Event('input')); }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting(), provideLocationMocks()] });
    http = TestBed.inject(HttpTestingController);
    await initializeTestSession();
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => { vi.useRealTimers(); try { http.verify(); } finally { TestBed.resetTestingModule(); } });
  it('initializes all controls from the URL and renders returned results without sorting them', async () => {
    await start('/?search=land&region=Europe&sort=population&direction=desc');
    expect(input().value).toBe('land');
    expect(element().querySelector<HTMLSelectElement>('#region')!.value).toBe('Europe');
    expect(element().querySelector<HTMLSelectElement>('#sort')!.value).toBe('population-desc');
    request().flush([summary, { ...summary, code: 'AUT', name: 'Avstrija' }]); await render();
    expect([...element().querySelectorAll('article h2')].map(h => h.textContent)).toEqual(['Slovenija', 'Avstrija']);
    expect(element().querySelectorAll('h1')).toHaveLength(1);
    for (const id of ['search', 'region', 'sort']) expect(element().querySelector(`label[for="${id}"]`)).not.toBeNull();
  });
  it('uses defaults and keeps labeled controls visible alongside loading skeletons', async () => {
    await start(); const req = request();
    expect(req.request.params.get('sort')).toBe('name'); expect(req.request.params.get('direction')).toBe('asc');
    expect(input().value).toBe(''); expect(element().querySelectorAll('app-country-skeleton')).toHaveLength(8);
    expect(element().textContent).toContain('Nalaganje držav');
    expect(element().textContent).not.toContain('Počisti filtre'); req.flush([]);
  });
  it('safely falls back from invalid URL values and normalizes region case', async () => {
    await start('/?region=europe&sort=bad&direction=bad');
    const req = request(); expect(req.request.params.get('region')).toBe('Europe');
    expect(element().querySelector<HTMLSelectElement>('#sort')!.value).toBe('name-asc'); req.flush([]);
    await start('/?region=bad'); expect(request().request.params.has('region')).toBe(false);
  });
  it('debounces search at 300 ms and cancels older HTTP requests', async () => {
    await start(); const initial = request();
    vi.useFakeTimers(); type('sl'); await vi.advanceTimersByTimeAsync(299);
    expect(router.url).toBe('/');
    await vi.advanceTimersByTimeAsync(1); vi.useRealTimers(); await render();
    const old = request(); expect(initial.cancelled).toBe(true); expect(router.url).toBe('/?search=sl');
    vi.useFakeTimers(); type('slov'); await vi.advanceTimersByTimeAsync(300); vi.useRealTimers(); await render();
    const latest = request(); expect(old.cancelled).toBe(true);
    latest.flush([summary]); await render(); expect(element().textContent).toContain('Slovenija');
    expect(() => old.flush([])).toThrow();
  });
  it('does not repeat requests for equivalent trimmed searches', async () => {
    await start('/?search=land'); request().flush([]);
    vi.useFakeTimers(); type(' land '); await vi.advanceTimersByTimeAsync(300); vi.useRealTimers(); await render();
    http.expectNone(r => r.url === '/api/v1/countries');
  });
  it('updates canonical region and both sort/direction query parameters', async () => {
    await start(); request().flush([]);
    await select('region', 'Europe'); expect(router.url).toBe('/?region=Europe'); request().flush([]);
    await select('sort', 'population-desc'); expect(router.url).toContain('sort=population&direction=desc'); request().flush([]);
    await select('sort', 'population-asc'); expect(router.url).toContain('sort=population'); expect(router.url).not.toContain('direction'); request().flush([]);
    await select('sort', 'name-desc'); expect(router.url).toBe('/?region=Europe&direction=desc'); request().flush([]);
  });
  it('restores controls and results on browser back and forward', async () => {
    // The harness does not bootstrap the application location listener.
    router.setUpLocationChangeListener();
    const restored = { ...summary, code: 'ISL', name: 'Island' };
    const names = () => [...element().querySelectorAll('article h2')].map(h => h.textContent);
    await start('/?search=land'); request().flush([restored]); await render();
    expect(names()).toEqual(['Island']);
    await select('region', 'Europe'); request().flush([summary]); await render();
    expect(names()).toEqual(['Slovenija']);
    const location = TestBed.inject(Location);
    const back = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.back(); await back; await render();
    expect(input().value).toBe('land'); expect(element().querySelector<HTMLSelectElement>('#region')!.value).toBe('');
    request().flush([restored]); await render(); expect(names()).toEqual(['Island']);
    const forward = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.forward(); await forward; await render(); expect(element().querySelector<HTMLSelectElement>('#region')!.value).toBe('Europe');
    request().flush([summary]); await render(); expect(names()).toEqual(['Slovenija']);
  });
  it('cancels pending typing when query navigation restores a different state', async () => {
    await start(); request().flush([]); vi.useFakeTimers(); type('stale');
    await harness.navigateByUrl('/?search=restored'); request().flush([]);
    await vi.advanceTimersByTimeAsync(300); vi.useRealTimers(); await render();
    expect(input().value).toBe('restored'); expect(router.url).toBe('/?search=restored');
    http.expectNone(r => r.url === '/api/v1/countries');
  });
  it('shows the empty state and clears only when non-default filters are active', async () => {
    await start('/?search=missing'); request().flush([]); await render();
    expect(element().textContent).toContain('Nobena država ne ustreza filtrom.');
    [...element().querySelectorAll('button')].find(b => b.textContent?.includes('Počisti'))!.click(); await render();
    expect(router.url).toBe('/'); request().flush([]);
  });
  it('shows safe failure copy and retries the current query without changing the URL', async () => {
    await start('/?region=Europe');
    request().flush({ code: 'COUNTRY_SERVICE_UNAVAILABLE', detail: 'secret technical error' }, { status: 503, statusText: 'Unavailable' }); await render();
    expect(element().textContent).not.toContain('secret technical error'); expect(input()).not.toBeNull();
    [...element().querySelectorAll('button')].find(b => b.textContent?.includes('Poskusi znova'))!.click(); await render();
    const retried = request(); expect(retried.request.params.get('region')).toBe('Europe');
    expect(router.url).toBe('/?region=Europe'); retried.flush([summary]); await render();
    expect(element().textContent).toContain('Slovenija');
  });
});
