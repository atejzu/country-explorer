import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { AuthStore } from '../../../core/auth/auth-store';
import { authUser, currentUser, initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { NotificationStore } from '../../../core/notifications/notification-store';

describe('Registration Signal Form', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const element = () => harness.routeNativeElement!;
  const input = (field: string, value: string) => {
    const control = element().querySelector<HTMLInputElement>('#register-' + field)!;
    control.value = value; control.dispatchEvent(new Event('input')); control.dispatchEvent(new Event('blur'));
  };
  const submit = () => element().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const valid = (password = 'test-only') => {
    input('username', currentUser.username); input('email', currentUser.email);
    input('password', password); input('confirmPassword', password);
  };
  async function render() {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    harness.detectChanges(); await harness.fixture.whenStable();
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession();
    harness = await RouterTestingHarness.create('/register?returnUrl=%2Faccount');
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('includes the shared background hidden from assistive technology', () => {
    expect(element().querySelector('app-globe-background')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not cancel a registration POST on an arbitrary ten-second deadline', async () => {
    vi.useFakeTimers(); valid(); submit();
    const request = http.expectOne('/api/v1/auth/register');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request.cancelled).toBe(false);
    http.expectNone('/api/v1/auth/register');
    request.flush(currentUser, { status: 201, statusText: 'Created' });
    vi.useRealTimers(); await render();
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Faccount');
  });

  it('submits only the API fields, stays anonymous and preserves register → login → account', async () => {
    valid(); submit(); submit(); await render();
    expect(element().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    const request = http.expectOne('/api/v1/auth/register');
    expect(request.request.body).toEqual({ username: currentUser.username, email: currentUser.email, password: 'test-only' });
    expect(request.request.body).not.toHaveProperty('confirmPassword');
    request.flush(currentUser, { status: 201, statusText: 'Created' }); await render();
    expect(TestBed.inject(AuthStore).status()).toBe('anonymous');
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Faccount');
    http.expectNone('/api/v1/auth/login');
    for (const [id, value] of [['email', currentUser.email], ['password', 'test-only']]) {
      const control = element().querySelector<HTMLInputElement>('#login-' + id)!;
      control.value = value; control.dispatchEvent(new Event('input'));
    }
    submit(); http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    expect(TestBed.inject(Router).url).toBe('/account'); http.expectOne('/api/v1/users/me').flush(currentUser);
  });
  it.each(['a'.repeat(8), 'a'.repeat(72), 'ž'.repeat(72), '🔒'.repeat(36)])
    ('accepts password length within the UTF-16 contract (%#)', async password => {
      valid(password); submit();
      http.expectOne('/api/v1/auth/register').flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Failure' });
      await render(); expect(element().textContent).not.toContain('Geslo naj vsebuje');
    });
  it.each(['a'.repeat(7), 'a'.repeat(73), '🔒'.repeat(37), '        '])
    ('blocks invalid password length or blank password (%#)', async password => {
      valid(password); submit(); await render();
      http.expectNone('/api/v1/auth/register');
      expect(element().querySelector('#register-password-errors')?.textContent?.trim()).not.toBe('');
    });
  it('blocks mismatched confirmation and revalidates when the password changes', async () => {
    valid(); input('confirmPassword', 'different'); submit(); await render();
    expect(element().textContent).toContain('Gesli se ne ujemata.'); http.expectNone('/api/v1/auth/register');
    input('password', 'different'); await render();
    expect(element().textContent).not.toContain('Gesli se ne ujemata.');
  });
  it.each(['', 'ab', 'a'.repeat(31), '   '])('blocks invalid username (%#)', async username => {
    valid(); input('username', username); submit(); await render(); http.expectNone('/api/v1/auth/register');
    expect(element().querySelector('#register-username-errors')?.textContent?.trim()).not.toBe('');
  });
  it.each(['abc', 'a'.repeat(30)])('accepts username boundaries (%#)', async username => {
    valid(); input('username', username); submit();
    http.expectOne('/api/v1/auth/register').error(new ProgressEvent('error')); await render();
  });
  it.each(['', 'invalid', 'a'.repeat(245) + '@example.com'])('blocks invalid email (%#)', async email => {
    valid(); input('email', email); submit(); await render(); http.expectNone('/api/v1/auth/register');
    expect(element().querySelector('#register-email-errors')?.textContent?.trim()).not.toBe('');
  });
  it.each([
    ['USERNAME_ALREADY_EXISTS', 'username', 'To uporabniško ime je že zasedeno.'],
    ['EMAIL_ALREADY_EXISTS', 'email', 'Ta e-poštni naslov je že v uporabi.'],
  ])('maps %s onto its field and clears it on edit', async (code, field, message) => {
    valid(); submit();
    http.expectOne('/api/v1/auth/register').flush(problem(code, 409), { status: 409, statusText: 'Conflict' }); await render();
    expect(element().querySelector('#register-' + field + '-errors')?.textContent).toContain(message);
    expect(element().querySelector('#register-' + field)?.getAttribute('aria-invalid')).toBe('true');
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
    input(field, field === 'email' ? 'new@example.com' : 'newname'); await render();
    expect(element().textContent).not.toContain(message);
  });
  it('maps validation field identities, ignoring backend prose and unsupported fields', async () => {
    valid(); submit();
    http.expectOne('/api/v1/auth/register').flush({ ...problem('VALIDATION_FAILED', 400), fieldErrors:
      ['username', 'email', 'password', 'unknown'].map(field => ({ field, message: 'English backend detail' })) },
      { status: 400, statusText: 'Bad Request' }); await render();
    for (const field of ['username', 'email', 'password']) {
      expect(element().querySelector('#register-' + field + '-errors')?.textContent).toContain('Preveri');
    }
    expect(element().textContent).not.toContain('English backend detail');
  });
  it('explains an unknown creation outcome and offers login without automatically retrying', async () => {
    valid(); submit(); http.expectOne('/api/v1/auth/register').error(new ProgressEvent('error')); await render();
    expect(element().textContent).toContain('Ustvaritve računa ni bilo mogoče potrditi.');
    expect(element().textContent).toContain('Če je bil račun ustvarjen, se lahko poskusiš prijaviti.');
    expect(element().querySelector('a[href^="/login"]')).not.toBeNull();
    expect(TestBed.inject(AuthStore).mutationsReady()).toBe(true);
    http.expectNone('/api/v1/auth/register'); http.expectNone('/api/v1/auth/login');
    submit(); http.expectOne('/api/v1/auth/register').error(new ProgressEvent('error')); await render();
  });
});
