import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import { initializeTestSession } from '../../../core/auth/auth.fixture';
import { FavoritesStore } from '../../favorites/favorites-store';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { appConfig } from '../../../app.config';
import { CountryCard } from './country-card';
import { summary } from '../models/country.fixture';
const favorite = { country: summary, favoritedAt: '2026-09-26T11:45:00Z' };
describe('CountryCard', () => {
  it('renders localized facts, a named real detail link and the 48 × 32 flag', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideRouter([])] });
    const fixture = TestBed.createComponent(CountryCard); fixture.componentRef.setInput('country', summary);
    await fixture.whenStable(); const el: HTMLElement = fixture.nativeElement;
    for (const text of ['Slovenija', 'Ljubljana', '2.100.000', 'Evropa']) expect(el.textContent).toContain(text);
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/countries/SVN');
    expect(link.getAttribute('aria-label')).toBe('Ogled države: Slovenija');
    const flag = el.querySelector('img')!;
    expect(flag.alt).toBe(summary.flag.alt); expect(flag.width).toBe(48); expect(flag.height).toBe(32);
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('CountryCard favourites', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    await initializeTestSession(true);
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  async function card(saved = false) {
    const store = TestBed.inject(FavoritesStore); store.ensureLoaded();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/users/me/favorites').flush(saved ? [favorite] : []);
    const fixture = TestBed.createComponent(CountryCard); fixture.componentRef.setInput('country', summary);
    await fixture.whenStable(); return fixture;
  }
  it('shows unsaved state and a separate working detail link', async () => {
    const fixture = await card(); const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Dodaj Slovenija med priljubljene');
    expect(el.querySelector('article')?.classList.contains('saved')).toBe(false);
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('none');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    el.querySelector('a')!.click(); await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/countries/SVN');
  });
  it('renders loaded saved state with pressed heart, action label and indigo border class', async () => {
    const fixture = await card(true); const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Odstrani Slovenija iz priljubljenih');
    expect(el.querySelector('article')?.classList.contains('saved')).toBe(true);
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  });
  it('toggles every visual immediately without navigating and prevents repeated clicks', async () => {
    const fixture = await card(); const el: HTMLElement = fixture.nativeElement; const button = el.querySelector('button')!;
    const router = TestBed.inject(Router); const url = router.url;
    button.focus(); button.click(); button.click(); await fixture.whenStable();
    expect(router.url).toBe(url); expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true'); expect(button.getAttribute('aria-label')).toBe('Odstrani Slovenija iz priljubljenih');
    expect(el.querySelector('article')?.classList.contains('saved')).toBe(true);
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    expect(document.activeElement).toBe(button);
    TestBed.inject(HttpTestingController).expectOne('/api/v1/users/me/favorites/SVN').flush(null);
    await fixture.whenStable(); expect(button.getAttribute('aria-disabled')).toBe('false');
  });
  it('synchronizes two rendered representations through the same store', async () => {
    const first = await card();
    const second = TestBed.createComponent(CountryCard); second.componentRef.setInput('country', summary); await second.whenStable();
    first.nativeElement.querySelector('button').click(); await second.whenStable();
    expect(second.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe('true');
    TestBed.inject(HttpTestingController).expectOne('/api/v1/users/me/favorites/SVN').flush(null);
  });
  it('clears saved state immediately when logout starts', async () => {
    const fixture = await card(true); const logout = TestBed.inject(AuthStore).logout(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.querySelector('article').classList.contains('saved')).toBe(false);
    const http = TestBed.inject(HttpTestingController); http.expectOne('/api/v1/auth/logout').flush(null);
    await Promise.resolve(); http.expectOne('/api/v1/auth/csrf').flush(null); await logout;
  });
});
