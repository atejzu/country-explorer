import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { AuthStore } from '../../../core/auth/auth-store';
import { authUser, currentUser, initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { NotificationStore } from '../../../core/notifications/notification-store';

describe('Login Signal Form', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  const input = (id: string, value: string) => {
    const control = element().querySelector<HTMLInputElement>('#login-' + id)!;
    control.value = value; control.dispatchEvent(new Event('input')); control.dispatchEvent(new Event('blur'));
  };
  const submit = () => element().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  async function render() {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    harness.detectChanges(); await harness.fixture.whenStable();
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession();
    harness = await RouterTestingHarness.create('/login');
  });
  afterEach(() => http.verify());

  it('validates required fields and email using Signal Forms', async () => {
    submit(); await render();
    expect(element().textContent).toContain('Vnesi e-poštni naslov.');
    expect(element().textContent).toContain('Vnesi geslo.');
    input('email', 'invalid'); await render();
    expect(element().textContent).toContain('Vnesi veljaven e-poštni naslov.');
    http.expectNone('/api/v1/auth/login');
  });
  it.each([
    ['/login?returnUrl=%2Faccount%3Fx%3D1%23section', '/account?x=1#section'],
    ['/login', '/'],
    ['/login?returnUrl=https://evil.example', '/'],
  ])('completes login → CSRF → state → navigation for %s', async (url, destination) => {
    await harness.navigateByUrl(url);
    input('email', currentUser.email); input('password', 'test-only'); submit(); submit();
    await render();
    expect(element().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({ email: currentUser.email, password: 'test-only' });
    http.expectNone('/api/v1/auth/csrf'); request.flush({ user: authUser }); await Promise.resolve();
    expect(TestBed.inject(AuthStore).status()).toBe('anonymous');
    expect(TestBed.inject(Router).url).toBe(TestBed.inject(Router).serializeUrl(TestBed.inject(Router).parseUrl(url)));
    http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    expect(TestBed.inject(AuthStore).user()).toEqual(authUser);
    expect(TestBed.inject(Router).url).toBe(destination);
    if (destination.startsWith('/account')) http.expectOne('/api/v1/users/me').flush(currentUser);
    else {
      http.expectOne(r => r.url === '/api/v1/countries').flush([]);
      http.expectOne('/api/v1/users/me/favorites').flush([]);
    }
  });
  it('keeps email and shows exact generic credentials copy without an expiry notification', async () => {
    input('email', currentUser.email); input('password', 'test-only'); submit();
    http.expectOne('/api/v1/auth/login').flush(problem('INVALID_CREDENTIALS'), { status: 401, statusText: 'Unauthorized' });
    await render();
    expect(element().querySelector('[role=alert]')?.textContent).toBe('E-poštni naslov ali geslo ni pravilno.');
    expect(element().querySelector<HTMLInputElement>('#login-email')!.value).toBe(currentUser.email);
    expect(element().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(element().textContent).not.toContain('English backend');
  });
  it('requires explicit reconciliation after a network failure before another login', async () => {
    input('email', currentUser.email); input('password', 'test-only'); submit();
    http.expectOne('/api/v1/auth/login').error(new ProgressEvent('error')); await render();
    expect(element().textContent).toContain('Izida prijave ni bilo mogoče potrditi.');
    expect(element().querySelector('form')).toBeNull();
    expect(element().textContent).toContain('Preveri prijavo');
    http.expectNone('/api/v1/auth/login');
    element().querySelector<HTMLButtonElement>('app-auth-recovery button')!.click();
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await render();
    submit(); http.expectOne('/api/v1/auth/login').flush(problem('INVALID_CREDENTIALS'), { status: 401, statusText: 'Unauthorized' });
    await render();
  });
  it('offers bootstrap recovery after login succeeded but CSRF refresh failed', async () => {
    input('email', currentUser.email); input('password', 'test-only'); submit();
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error')); await render();
    expect(element().querySelector('form')).toBeNull();
    expect(element().textContent).toContain('Izida prijave ni bilo mogoče potrditi.');
    expect(element().textContent).toContain('Preveri prijavo');
    element().querySelector<HTMLButtonElement>('app-auth-recovery button')!.click();
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    expect(TestBed.inject(Router).url).toBe('/');
    http.expectOne(r => r.url === '/api/v1/countries').flush([]);
    http.expectOne('/api/v1/users/me/favorites').flush([]);
  });
  it('keeps pending login global across navigation and a new login page instance', async () => {
    input('email', currentUser.email); input('password', 'test-only'); submit();
    const request = http.expectOne('/api/v1/auth/login');
    const originalPage = harness.routeDebugElement!.componentInstance;
    await harness.navigateByUrl('/register');
    expect(element().querySelector('form')).toBeNull();
    expect(element().textContent).toContain('Prijava …');
    await harness.navigateByUrl('/login?returnUrl=%2Faccount');
    expect(harness.routeDebugElement!.componentInstance).not.toBe(originalPage);
    expect(TestBed.inject(AuthStore).loginPending()).toBe(true);
    expect(element().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    input('email', 'another@example.test'); input('password', 'another-test'); submit();
    http.expectNone('/api/v1/auth/login');
    request.flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    expect(TestBed.inject(AuthStore).user()).toEqual(authUser);
    expect(TestBed.inject(Router).url).toBe('/account');
    http.expectOne('/api/v1/users/me').flush(currentUser);
  });
  it('preserves a safe return URL in the registration link', async () => {
    await harness.navigateByUrl('/register');
    await harness.navigateByUrl('/login?returnUrl=%2Faccount');
    element().querySelector<HTMLAnchorElement>('a[href^="/register"]')!.click(); await render();
    expect(TestBed.inject(Router).url).toBe('/register?returnUrl=%2Faccount');
  });
});
