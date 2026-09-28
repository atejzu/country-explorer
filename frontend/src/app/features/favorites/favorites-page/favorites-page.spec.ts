import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { initializeTestSession } from '../../../core/auth/auth.fixture';
import { summary } from '../../countries/models/country.fixture';
import { routes } from '../../../app.routes';
import { authGuard } from '../../../core/auth/auth-guard';

const URL = '/api/v1/users/me/favorites';
const favorite = { country: summary, favoritedAt: '2026-09-26T11:45:00Z' };
const italy = { country: { ...summary, code: 'ITA', name: 'Italija' }, favoritedAt: favorite.favoritedAt };

describe('FavoritesPage', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  const cards = () => [...element().querySelectorAll<HTMLElement>('app-country-card')];
  const button = (index = 0) => cards()[index].querySelector('button')!;
  const render = async () => { harness.detectChanges(); await harness.fixture.whenStable(); };
  const load = async (items = [favorite, italy]) => { http.expectOne(URL).flush(items); await render(); };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession(true);
    harness = await RouterTestingHarness.create('/favorites'); await render();
  });
  afterEach(() => http.verify());
  it('does not include the page-level globe background', async () => {
    expect(element().querySelector('app-globe-background')).toBeNull();
    await load();
    expect(element().querySelector('app-globe-background')).toBeNull();
  });
  it('uses the existing authGuard and a lazy route with the approved title', async () => {
    const route = routes.find(route => route.path === 'favorites')!;
    expect(route.canActivate).toEqual([authGuard]); expect(route.loadComponent).toBeDefined();
    expect(route.title).toBe('Priljubljene · Country Explorer'); await load();
  });
  it('shows structured card skeletons and accessible loading context', async () => {
    expect(element().querySelector('app-globe-card-pattern')).toBeNull();
    expect(element().textContent).toContain('Nalaganje priljubljenih držav …');
    expect(element().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(element().querySelectorAll('app-country-skeleton')).toHaveLength(4); await load();
  });
  it('renders the shared CountryCard grid, heading, support copy and count', async () => {
    await load(); expect(cards()).toHaveLength(2); expect(element().querySelectorAll('h1')).toHaveLength(1);
    expect(element().querySelector('app-globe-card-pattern')).toBeNull();
    expect(element().textContent).toContain('Priljubljene države'); expect(element().textContent).toContain('Tvoje shranjene države na enem mestu.');
    expect(element().textContent).toContain('Število priljubljenih držav: 2'); expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(element().querySelector('input, select')).toBeNull();
  });
  it('shows the exact empty copy and explorer link', async () => {
    await load([]); expect(element().textContent).toContain('Nimaš še shranjenih priljubljenih držav.');
    expect(element().querySelector('.globe-card > app-globe-card-pattern')?.getAttribute('aria-hidden')).toBe('true');
    expect(element().querySelector('app-globe-background')).toBeNull();
    expect(element().textContent).toContain('Uporabi srček pri državi, da jo shraniš sem.');
    const link = element().querySelector<HTMLAnchorElement>('.explore')!;
    expect(link.textContent).toBe('Razišči države'); expect(link.getAttribute('href')).toBe('/');
    link.click(); await render(); http.expectOne(r => r.url === '/api/v1/countries').flush([]);
    expect(TestBed.inject(Router).url).toBe('/');
  });
  it('shows an inline load failure and retries instead of displaying an empty list', async () => {
    http.expectOne(URL).flush({}, { status: 503, statusText: 'Unavailable' }); await render();
    expect(element().querySelector('app-globe-card-pattern')).toBeNull();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('Priljubljenih držav ni bilo mogoče naložiti.');
    expect(element().textContent).not.toContain('Nimaš še');
    element().querySelector('button')!.click(); await render(); expect(element().textContent).toContain('Nalaganje priljubljenih');
    expect(element().querySelector('app-globe-card-pattern')).toBeNull();
    await load(); expect(cards()).toHaveLength(2);
  });
  it('retains the same card node and position while removing, with optimistic heart and outline', async () => {
    await load(); const first = cards()[0]; const control = button(); control.click(); await render();
    expect(cards()[0]).toBe(first); expect(cards()).toHaveLength(2); expect(control.getAttribute('aria-pressed')).toBe('false');
    expect(first.querySelector('article')?.classList.contains('saved')).toBe(false);
    expect(element().textContent).toContain('Število priljubljenih držav: 2');
    http.expectOne(URL + '/SVN').flush(null); await render();
    expect(cards()).toHaveLength(1); expect(element().textContent).not.toContain('Slovenija');
    expect(element().textContent).toContain('Število priljubljenih držav: 1');
  });
  it('restores the same card, saved heart and border when removal fails', async () => {
    await load(); const first = cards()[0]; button().click();
    http.expectOne(URL + '/SVN').flush({}, { status: 503, statusText: 'Unavailable' }); await render();
    expect(cards()[0]).toBe(first); expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(first.querySelector('article')?.classList.contains('saved')).toBe(true);
    expect(element().querySelector('[role="alert"]')).toBeNull();
  });
  it('shows the empty state only after the final DELETE succeeds', async () => {
    await load([favorite]); button().click(); await render();
    expect(cards()).toHaveLength(1); expect(element().textContent).not.toContain('Nimaš še');
    http.expectOne(URL + '/SVN').flush(null); await render();
    expect(cards()).toHaveLength(0); expect(element().textContent).toContain('Nimaš še shranjenih priljubljenih držav.');
  });
  it.each([0, 1])('moves keyboard focus to a surviving card when removing index %s', async index => {
    await load(); const control = button(index); control.focus(); control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    control.click(); await render(); expect(document.activeElement).toBe(control);
    http.expectOne(URL + (index === 0 ? '/SVN' : '/ITA')).flush(null); await render();
    expect(document.activeElement).toBe(button());
  });
  it('focuses Explore after the final focused card disappears', async () => {
    await load([favorite]); button().focus(); button().click(); await render();
    http.expectOne(URL + '/SVN').flush(null); await render();
    expect(document.activeElement).toBe(element().querySelector('.explore'));
  });
  it('focuses the next original neighbor when two removals complete together', async () => {
    await load([favorite, italy, { ...favorite, country: { ...summary, code: 'AUT' } },
      { ...favorite, country: { ...summary, code: 'HRV' } }]);
    button().click(); button(1).focus(); button(1).click(); await render();
    http.expectOne(URL + '/SVN').flush(null); http.expectOne(URL + '/ITA').flush(null); await render();
    expect(cards()[0].dataset['code']).toBe('AUT'); expect(document.activeElement).toBe(button());
  });
  it('does not move focus for pointer removal', async () => {
    await load(); const other = button(1); other.focus(); const control = button();
    control.dispatchEvent(new Event('pointerdown', { bubbles: true })); control.click(); await render();
    http.expectOne(URL + '/SVN').flush(null); await render(); expect(document.activeElement).toBe(other);
  });
  it('does not steal focus that moved outside the card while DELETE was pending', async () => {
    await load(); button().focus(); button().click(); await render(); const other = button(1); other.focus();
    http.expectOne(URL + '/SVN').flush(null); await render(); expect(document.activeElement).toBe(other);
  });
});

describe('Guest favourites navigation', () => {
  it('redirects a direct guest visit to the existing login returnUrl flow', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    await initializeTestSession(); await RouterTestingHarness.create('/favorites');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Ffavorites');
    TestBed.inject(HttpTestingController).verify();
  });
});
