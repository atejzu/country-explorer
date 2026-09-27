import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth-store';
import { authSessionInterceptor } from './auth-session-interceptor';
import { authUser, currentUser, initializeTestSession, problem } from './auth.fixture';
import { NotificationStore } from '../notifications/notification-store';

describe('AuthStore lifecycle', () => {
  let http: HttpTestingController;
  let auth: AuthStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authSessionInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthStore);
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('starts checking and restores identity only after CSRF then current-user response', async () => {
    expect(auth.status()).toBe('checking'); expect(auth.user()).toBeNull();
    const ready = auth.initialize();
    expect(auth.initialize()).toBe(ready);
    http.expectNone('/api/v1/users/me');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    await Promise.resolve();
    expect(auth.status()).toBe('checking');
    http.expectOne('/api/v1/users/me').flush(currentUser);
    await ready;
    expect(auth.status()).toBe('authenticated'); expect(auth.user()).toEqual(authUser);
    expect(auth.user()).not.toHaveProperty('createdAt'); expect(auth.startupError()).toBe(false);
  });
  it('treats anonymous startup as normal, with no expired-session notification', async () => {
    await initializeTestSession();
    expect(auth.status()).toBe('anonymous'); expect(auth.startupError()).toBe(false);
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
  });
  it('resolves a failed CSRF bootstrap and can recover on an explicit retry', async () => {
    const ready = auth.initialize();
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error'));
    await ready; http.expectNone('/api/v1/users/me');
    expect(auth.isAuthenticated()).toBe(false); expect(auth.startupError()).toBe(true);
    expect(auth.mutationsReady()).toBe(false);
    await initializeTestSession(true);
    expect(auth.isAuthenticated()).toBe(true); expect(auth.startupError()).toBe(false);
  });
  it.each([500, 401])('keeps unexpected current-user failure %s recoverable', async status => {
    const ready = auth.initialize(); http.expectOne('/api/v1/auth/csrf').flush(null);
    await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(problem('INTERNAL_ERROR', status), { status, statusText: 'Failure' });
    await ready;
    expect(auth.status()).toBe('anonymous'); expect(auth.user()).toBeNull(); expect(auth.startupError()).toBe(true);
  });
  it('bounds startup when a request never responds', async () => {
    vi.useFakeTimers(); const ready = auth.initialize();
    const request = http.expectOne('/api/v1/auth/csrf');
    await vi.advanceTimersByTimeAsync(10_000); await ready;
    expect(request.cancelled).toBe(true); expect(auth.startupError()).toBe(true);
  });
  it('blocks login until initialization has recovered', async () => {
    await expect(auth.login({ email: currentUser.email, password: 'test-only' })).rejects.toThrow();
    http.expectNone('/api/v1/auth/login');
  });
  it('authenticates login only after its fresh CSRF request succeeds', async () => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    http.expectNone('/api/v1/auth/csrf');
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    expect(auth.status()).toBe('anonymous');
    http.expectOne('/api/v1/auth/csrf').flush(null); await login;
    expect(auth.user()).toEqual(authUser); expect(auth.status()).toBe('authenticated');
  });
  it('requires reconciliation when post-login CSRF refresh fails', async () => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    const failed = expect(login).rejects.toBeDefined();
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error')); await failed;
    expect(auth.status()).toBe('anonymous'); expect(auth.startupError()).toBe(true);
    await initializeTestSession(true); expect(auth.status()).toBe('authenticated');
  });
  it.each([204, 401])('clears logout state after %s and refreshes CSRF without calling /users/me', async status => {
    await initializeTestSession(true);
    const logout = auth.logout();
    expect(auth.logoutPending()).toBe(true); expect(await auth.logout()).toBe(false);
    const request = http.expectOne('/api/v1/auth/logout');
    if (status === 204) request.flush(null, { status, statusText: 'No Content' });
    else request.flush(problem('AUTHENTICATION_REQUIRED'), { status, statusText: 'Unauthorized' });
    await Promise.resolve();
    expect(auth.user()).toBeNull(); expect(auth.status()).toBe('anonymous');
    http.expectOne('/api/v1/auth/csrf').flush(null);
    expect(await logout).toBe(true); expect(auth.mutationsReady()).toBe(true);
    http.expectNone('/api/v1/users/me');
  });
  it('keeps mutations blocked if anonymous CSRF refresh after logout fails', async () => {
    await initializeTestSession(true); const logout = auth.logout();
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error'));
    expect(await logout).toBe(true); expect(auth.startupError()).toBe(true); expect(auth.user()).toBeNull();
  });
  it('reports unconfirmed logout locally and supports retry', async () => {
    await initializeTestSession(true); const logout = auth.logout();
    http.expectOne('/api/v1/auth/logout').error(new ProgressEvent('error'));
    expect(await logout).toBe(false); expect(auth.logoutError()).toBe(true); expect(auth.user()).toBeNull();
    const retry = auth.logout();
    http.expectNone('/api/v1/auth/logout');
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null);
    expect(await retry).toBe(true); expect(auth.logoutError()).toBe(false);
  });
  it('does not repeat an unconfirmed logout until fresh CSRF can be obtained', async () => {
    await initializeTestSession(true); const logout = auth.logout();
    http.expectOne('/api/v1/auth/logout').error(new ProgressEvent('error')); await logout;
    const retry = auth.logout();
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error')); await retry;
    http.expectNone('/api/v1/auth/logout');
    expect(auth.logoutError()).toBe(true); expect(auth.mutationsReady()).toBe(false);
  });

  it.each([true, false])('reconciles an unknown login outcome to authenticated=%s without replaying login', async authenticated => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    const failed = expect(login).rejects.toBeDefined();
    http.expectOne('/api/v1/auth/login').error(new ProgressEvent('error')); await failed;
    expect(auth.user()).toBeNull(); expect(auth.loginUnconfirmed()).toBe(true);
    expect(auth.mutationsReady()).toBe(false); expect(auth.loginPending()).toBe(false);
    await expect(auth.login({ email: currentUser.email, password: 'test-only' })).rejects.toThrow();
    http.expectNone('/api/v1/auth/login');
    const recovery = auth.reconcile();
    expect(auth.reconcile()).toBe(recovery);
    http.expectNone('/api/v1/users/me');
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    const me = http.expectOne('/api/v1/users/me');
    if (authenticated) me.flush(currentUser);
    else me.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await recovery;
    expect(auth.isAuthenticated()).toBe(authenticated); expect(auth.mutationsReady()).toBe(true);
    expect(auth.loginUnconfirmed()).toBe(false);
    http.expectNone('/api/v1/auth/login');
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
    if (!authenticated) {
      const retry = auth.login({ email: currentUser.email, password: 'test-only' });
      const rejected = expect(retry).rejects.toBeDefined();
      http.expectOne('/api/v1/auth/login').flush(problem('INVALID_CREDENTIALS'), { status: 401, statusText: 'Unauthorized' });
      await rejected; expect(auth.mutationsReady()).toBe(true); expect(auth.loginUnconfirmed()).toBe(false);
    }
  });
  it('keeps failed reconciliation blocked and allows another explicit probe', async () => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    const failed = expect(login).rejects.toBeDefined();
    http.expectOne('/api/v1/auth/login').flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Failure' });
    await failed;
    const recovery = auth.reconcile();
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').error(new ProgressEvent('error')); await recovery;
    expect(auth.mutationsReady()).toBe(false); expect(auth.loginUnconfirmed()).toBe(true);
    await initializeTestSession(true);
    expect(auth.user()).toEqual(authUser); expect(auth.mutationsReady()).toBe(true);
    http.expectNone('/api/v1/auth/login');
  });
  it.each(['login response', 'CSRF response'])('invalidates a late %s and orders logout after the old operation settles', async stage => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    const post = http.expectOne('/api/v1/auth/login');
    if (stage === 'CSRF response') { post.flush({ user: authUser }); await Promise.resolve(); }
    const late = stage === 'CSRF response' ? http.expectOne('/api/v1/auth/csrf') : post;
    const logout = auth.logout();
    expect(auth.user()).toBeNull(); expect(auth.mutationsReady()).toBe(false);
    http.expectNone('/api/v1/auth/logout');
    await expect(auth.login({ email: currentUser.email, password: 'test-only' })).rejects.toThrow();
    late.flush(stage === 'CSRF response' ? null : { user: authUser });
    expect(await login).toBe(false);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(auth.isAuthenticated()).toBe(false);
    // Fresh CSRF after the old mutation, then the newer logout, then anonymous CSRF.
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); expect(await logout).toBe(true);
    expect(auth.status()).toBe('anonymous'); expect(auth.user()).toBeNull(); expect(auth.mutationsReady()).toBe(true);
  });
  it.each(['login response', 'CSRF response'])('reconciliation invalidates a late %s before establishing a new identity', async stage => {
    await initializeTestSession();
    const login = auth.login({ email: currentUser.email, password: 'test-only' });
    const post = http.expectOne('/api/v1/auth/login');
    if (stage === 'CSRF response') { post.flush({ user: authUser }); await Promise.resolve(); }
    const late = stage === 'CSRF response' ? http.expectOne('/api/v1/auth/csrf') : post;
    const recovery = auth.reconcile();
    http.expectNone('/api/v1/auth/csrf'); http.expectNone('/api/v1/users/me');
    late.flush(stage === 'CSRF response' ? null : { user: authUser });
    expect(await login).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush({ ...currentUser, username: 'reconciled-user' }); await recovery;
    expect(auth.user()?.username).toBe('reconciled-user'); expect(auth.mutationsReady()).toBe(true);
  });
  it('does not allow an invalidated initialization result to write authentication', async () => {
    const ready = auth.initialize();
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    const me = http.expectOne('/api/v1/users/me');
    auth.expireSession();
    me.flush(currentUser); await ready;
    expect(auth.status()).toBe('anonymous'); expect(auth.user()).toBeNull(); expect(auth.mutationsReady()).toBe(false);
    await initializeTestSession(); expect(auth.mutationsReady()).toBe(true);
  });
  it('does not let a superseded logout completion overwrite reconciliation', async () => {
    await initializeTestSession(true);
    const logout = auth.logout();
    const post = http.expectOne('/api/v1/auth/logout');
    const recovery = auth.reconcile();
    post.flush(null); expect(await logout).toBe(false);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await recovery;
    expect(auth.status()).toBe('anonymous'); expect(auth.mutationsReady()).toBe(true);
  });
  it.each(['login', 'logout'])('does not impose a ten-second deadline on POST %s', async kind => {
    await initializeTestSession(kind === 'logout');
    vi.useFakeTimers();
    const pending = kind === 'login'
      ? auth.login({ email: currentUser.email, password: 'test-only' }) : auth.logout();
    const request = http.expectOne('/api/v1/auth/' + kind);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request.cancelled).toBe(false); expect(auth.mutationsReady()).toBe(false);
    request.flush(kind === 'login' ? { user: authUser } : null); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); expect(await pending).toBe(true);
  });
});
