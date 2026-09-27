import { formatNumber, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';

describe('Application foundation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
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

  it.each(['/countries/SVN', '/?region=Europe'])('skips to main without changing %s', async url => {
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
});
