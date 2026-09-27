import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../app.config';
import { currentUser, initializeTestSession, problem } from './auth.fixture';

describe('authentication routes and guards', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it.each(['/account', '/account?x=1#section'])('redirects guests with the full returnUrl %s', async url => {
    await initializeTestSession(); const harness = await RouterTestingHarness.create(url);
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(url);
    expect(router.url).toContain('/login?returnUrl=%2Faccount');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Prijava');
  });
  it('allows authenticated account access', async () => {
    await initializeTestSession(true); const harness = await RouterTestingHarness.create('/account');
    http.expectOne('/api/v1/users/me').flush(currentUser); harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/account');
  });
  it('waits for a pending initializer before deciding protected navigation', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/account');
    await Promise.resolve();
    expect(TestBed.inject(Router).url).not.toContain('/login');
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await navigation; expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Faccount');
  });
  it.each(['/login', '/register'])('redirects authenticated users from %s to the safe destination', async url => {
    await initializeTestSession(true);
    const harness = await RouterTestingHarness.create(url + '?returnUrl=%2Faccount');
    http.expectOne('/api/v1/users/me').flush(currentUser); harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/account');
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
  });
  it.each(['/login?returnUrl=https://evil.example', '/register', '/login?returnUrl=%2Flogin'])
    ('redirects safely home without loops from %s', async url => {
      await initializeTestSession(true); await RouterTestingHarness.create(url);
      http.expectOne(r => r.url === '/api/v1/countries').flush([]);
      expect(TestBed.inject(Router).url).toBe('/');
    });
});
