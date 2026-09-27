import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../app.config';
import { AuthStore } from '../../core/auth/auth-store';
import { authUser, currentUser, initializeTestSession } from '../../core/auth/auth.fixture';
import { summary } from '../countries/models/country.fixture';

const URL = '/api/v1/users/me/favorites';

describe('Favourite action through real auth routes', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  const render = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); harness.detectChanges(); await harness.fixture.whenStable(); };
  const fill = (id: string, value: string) => {
    const input = element().querySelector<HTMLInputElement>('#' + id)!;
    input.value = value; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
  };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    harness = await RouterTestingHarness.create('/?search=slov&region=Europe#results');
    http.expectOne(r => r.url === '/api/v1/countries').flush([summary]); await render();
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    try { http.verify(); } finally { TestBed.resetTestingModule(); }
  });
  it.each(['login', 'register'])('completes a guest %s journey exactly once after CSRF refresh and return', async path => {
    element().querySelector<HTMLButtonElement>('app-favorite-button button')!.click(); await render();
    element().querySelector<HTMLAnchorElement>(`dialog a[href^="/${path}"]`)!.click(); await render();
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe('/?search=slov&region=Europe#results');
    if (path === 'register') {
      fill('register-username', 'example-user'); fill('register-email', currentUser.email);
      fill('register-password', 'test-only'); fill('register-confirmPassword', 'test-only');
      element().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      http.expectOne('/api/v1/auth/register').flush(currentUser); await render();
      expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false); http.expectNone(URL + '/SVN');
    }
    fill('login-email', currentUser.email); fill('login-password', 'test-only');
    element().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectNone(URL + '/SVN'); http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    expect(router.url).toBe('/?search=slov&region=Europe#results');
    const put = http.expectOne(URL + '/SVN');
    http.expectOne(r => r.url === '/api/v1/countries').flush([summary]);
    // The GET can reflect the state before PUT without overwriting the newer intent.
    http.expectOne(URL).flush([]); await render();
    expect(element().querySelector('app-favorite-button button')?.getAttribute('aria-pressed')).toBe('true');
    put.flush(null); await harness.navigateByUrl('/favorites'); await render();
    expect(element().querySelectorAll('app-country-card')).toHaveLength(1); http.expectNone(URL + '/SVN');
  });
});
