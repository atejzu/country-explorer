import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { currentUser, initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { AuthStore } from '../../../core/auth/auth-store';

describe('Account page', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  async function render() {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    harness.detectChanges(); await harness.fixture.whenStable();
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession(true);
    harness = await RouterTestingHarness.create('/account');
  });
  afterEach(() => http.verify());
  it('shows loading then own account, a Slovenian date and no internal UUID', async () => {
    expect(element().textContent).toContain('Nalaganje računa');
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    expect(element().textContent).toContain(currentUser.username);
    expect(element().textContent).toContain(currentUser.email);
    expect(element().textContent).toContain('26. september 2026');
    expect(element().textContent).not.toContain(currentUser.id);
    expect(element().querySelector('app-logout-button')?.textContent).toContain('Odjava');
  });
  it('offers a local retry after a failure', async () => {
    http.expectOne('/api/v1/users/me').flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Failure' });
    await render(); expect(element().textContent).toContain('Podatkov o računu ni bilo mogoče naložiti.');
    expect(element().textContent).not.toContain('English backend');
    element().querySelector<HTMLButtonElement>('.auth-feedback button')!.click(); await render();
    expect(element().textContent).toContain('Nalaganje računa');
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    expect(element().textContent).toContain(currentUser.username);
  });
  it.each(['not-a-date', '', null, undefined])('handles malformed createdAt %s without a DatePipe exception', async createdAt => {
    http.expectOne('/api/v1/users/me').flush({ ...currentUser, createdAt }); await render();
    expect(element().textContent).toContain('Podatkov o računu ni bilo mogoče naložiti.');
    expect(element().querySelector('dl')).toBeNull();
    element().querySelector<HTMLButtonElement>('.auth-feedback button')!.click();
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    expect(element().textContent).toContain('26. september 2026');
  });
  it('offers login after session expiry instead of showing stale account data', async () => {
    http.expectOne('/api/v1/users/me').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await render();
    expect(element().textContent).toContain('Za ogled računa se prijavi.');
    expect(element().querySelector('a')?.getAttribute('href')).toBe('/login?returnUrl=%2Faccount');
    expect(element().textContent).not.toContain(currentUser.email);
  });
  it.each([204, 401])('logs out safely after %s, refreshes CSRF, then navigates home', async status => {
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    element().querySelector<HTMLButtonElement>('app-logout-button button')!.click();
    const request = http.expectOne('/api/v1/auth/logout');
    if (status === 204) request.flush(null, { status, statusText: 'No Content' });
    else request.flush(problem('AUTHENTICATION_REQUIRED'), { status, statusText: 'Unauthorized' });
    await Promise.resolve();
    expect(TestBed.inject(AuthStore).user()).toBeNull(); expect(TestBed.inject(Router).url).toBe('/account');
    http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    expect(TestBed.inject(Router).url).toBe('/');
    http.expectNone('/api/v1/users/me'); http.expectOne(r => r.url === '/api/v1/countries').flush([]);
  });
});
