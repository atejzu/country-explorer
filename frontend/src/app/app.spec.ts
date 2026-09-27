import { formatNumber, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { currentUser, initializeTestSession, problem } from './core/auth/auth.fixture';
import { AuthStore } from './core/auth/auth-store';
import { NotificationStore } from './core/notifications/notification-store';

describe('Application foundation', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    await initializeTestSession();
  });

  it('renders routed content inside the shell and navigates back home', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectOne(r => r.url === '/api/v1/countries').flush([]);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('main h1')?.textContent).toBe('Razišči države');
    await router.navigateByUrl('/unknown-route');
    await fixture.whenStable();
    expect(element.querySelector('main h1')?.textContent).toBe('Strani ni bilo mogoče najti.');
    element.querySelector<HTMLAnchorElement>('header a')!.click();
    await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectOne(r => r.url === '/api/v1/countries').flush([]);
    expect(router.url).toBe('/');
    expect(element.querySelector('main h1')?.textContent).toBe('Razišči države');
  });

  it('keeps exploration navigation current when filters are in the URL', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/?region=Europe');
    await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectOne(r => r.url === '/api/v1/countries').flush([]);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('nav a')?.getAttribute('aria-current')).toBe('page');
  });

  it.each(['/countries/SVN', '/?region=Europe', '/countries/SVN#section', '/?region=Europe#section'])('skips to main without changing %s', async url => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.startsWith('/api/v1/countries')).flush(
      { code: 'COUNTRY_SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const main = element.querySelector<HTMLElement>('#main')!;
    const skip = element.querySelector<HTMLButtonElement>('button.skip')!;
    expect(main.tagName).toBe('MAIN');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(skip.textContent).toBe('Preskoči na vsebino');
    expect(skip.type).toBe('button');
    expect(skip.tabIndex).toBe(0);
    expect(skip.disabled).toBe(false);
    main.scrollIntoView = vi.fn();
    const location = TestBed.inject(Location);
    const originalLocation = location.path(true);
    const originalHref = window.location.href;
    skip.focus();
    expect(document.activeElement).toBe(skip);
    skip.click();
    await fixture.whenStable();
    expect(router.url).toBe(url);
    expect(location.path(true)).toBe(originalLocation);
    expect(window.location.href).toBe(originalHref);
    expect(document.activeElement).toBe(main);
    expect(main.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    http.verify();
  });

  it('formats numbers using the registered Slovenian locale', () => {
    const locale = TestBed.inject(LOCALE_ID);
    expect(locale).toBe('sl-SI');
    expect(formatNumber(1234.5, locale)).toBe('1.234,5');
  });

  it('provides HttpClient for relative same-origin API requests', () => {
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);
    let completed = false;
    // A mocked infrastructure request only; this does not define an application endpoint.
    http.get('/api/foundation-test').subscribe(() => (completed = true));
    const request = controller.expectOne('/api/foundation-test');
    expect(request.request.method).toBe('GET');
    request.flush({});
    expect(completed).toBe(true);
    controller.verify();
  });

  it('renders anonymous navigation without dead favourites links', async () => {
    const fixture = TestBed.createComponent(App); await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('nav')?.textContent).toContain('Razišči');
    expect(element.querySelector('nav')?.textContent).toContain('Prijava');
    expect(element.querySelector('details')).toBeNull();
    expect(element.querySelector('a[href="/favorites"]')).toBeNull();
  });

  it('renders a keyboard-accessible account disclosure and closes it on navigation', async () => {
    await initializeTestSession(true);
    const fixture = TestBed.createComponent(App); await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const menu = element.querySelector('details')!; const summary = menu.querySelector('summary')!;
    expect(summary.textContent).toBe(currentUser.username);
    expect(menu.textContent).toContain('Račun'); expect(menu.textContent).toContain('Odjava');
    summary.click(); expect(menu.open).toBe(true);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.open).toBe(false); expect(document.activeElement).toBe(summary);
    summary.click(); menu.querySelector<HTMLAnchorElement>('a')!.click(); await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/users/me').flush(currentUser);
    expect(TestBed.inject(Router).url).toBe('/account'); expect(menu.open).toBe(false);
  });

  it('does not show authenticated navigation while checking', async () => {
    await initializeTestSession(true);
    const fixture = TestBed.createComponent(App); await fixture.whenStable();
    const ready = TestBed.inject(AuthStore).initialize(); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('details')).toBeNull();
    expect(element.querySelector('nav')?.textContent).not.toContain(currentUser.username);
    const http = TestBed.inject(HttpTestingController); http.expectOne('/api/v1/auth/csrf').flush(null);
    await Promise.resolve(); http.expectOne('/api/v1/users/me').flush(currentUser); await ready;
  });

  it.each(['Račun je ustvarjen. Za nadaljevanje se prijavi.', 'Seja je potekla.'])
    ('announces transient feedback without stealing focus: %s', async message => {
      const fixture = TestBed.createComponent(App); await fixture.whenStable();
      const element: HTMLElement = fixture.nativeElement;
      element.querySelector<HTMLAnchorElement>('header a')!.focus(); const focused = document.activeElement;
      TestBed.inject(NotificationStore).show(message); await fixture.whenStable();
      const region = element.querySelector('app-notification-region [role="status"]');
      expect(region?.getAttribute('aria-live')).toBe('polite'); expect(region?.textContent).toContain(message);
      expect(document.activeElement).toBe(focused);
    });

  it('removes username navigation on logout and returns home only after CSRF refresh', async () => {
    await initializeTestSession(true);
    const fixture = TestBed.createComponent(App); await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector('summary')!.click();
    element.querySelector<HTMLButtonElement>('app-logout-button button')!.click();
    const http = TestBed.inject(HttpTestingController); http.expectOne('/api/v1/auth/logout').flush(null);
    await Promise.resolve(); fixture.detectChanges();
    expect(element.querySelector('details')).toBeNull();
    expect(element.querySelector('nav')?.textContent).not.toContain(currentUser.username);
    http.expectOne('/api/v1/auth/csrf').flush(null);
    await new Promise<void>(resolve => setTimeout(resolve, 0)); await fixture.whenStable();
    http.expectOne(r => r.url === '/api/v1/countries').flush([]);
    expect(element.querySelector('nav')?.textContent).toContain('Prijava');
  });

  it('lets Angular built-in XSRF attach the configured header only to unsafe requests', () => {
    // Synthetic test cookie only; application code never reads or copies tokens.
    document.cookie = 'XSRF-TOKEN=synthetic-test-value; path=/';
    try {
      const client = TestBed.inject(HttpClient); const http = TestBed.inject(HttpTestingController);
      client.post('/api/v1/auth/logout', {}).subscribe({ error: () => undefined });
      const post = http.expectOne('/api/v1/auth/logout');
      expect(post.request.headers.has('X-XSRF-TOKEN')).toBe(true);
      post.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
      client.get('/api/v1/auth/csrf').subscribe(); const get = http.expectOne('/api/v1/auth/csrf');
      expect(get.request.headers.has('X-XSRF-TOKEN')).toBe(false); get.flush(null);
    } finally { document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'; }
  });
});
