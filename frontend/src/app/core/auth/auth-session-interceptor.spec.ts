import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { authSessionInterceptor } from './auth-session-interceptor';
import { currentUser, initializeTestSession, problem } from './auth.fixture';
import { NotificationStore } from '../notifications/notification-store';

describe('authSessionInterceptor', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authSessionInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function fail(code: string, status = 401) {
    TestBed.inject(HttpClient).get('/api/v1/test').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/test').flush(problem(code, status), { status, statusText: 'Failure' });
  }
  it('expires an authenticated session once, with no navigation', async () => {
    await initializeTestSession(true);
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigateByUrl');
    const notifications = TestBed.inject(NotificationStore); const show = vi.spyOn(notifications, 'show');
    fail('AUTHENTICATION_REQUIRED'); fail('AUTHENTICATION_REQUIRED');
    expect(TestBed.inject(AuthStore).status()).toBe('anonymous'); expect(TestBed.inject(AuthStore).user()).toBeNull();
    expect(notifications.notification()?.message).toBe('Seja je potekla.');
    expect(show).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled(); expect(router.url).toBe('/');
  });
  it.each(['INVALID_CREDENTIALS', 'INTERNAL_ERROR'])('does not expire the session for %s', async code => {
    await initializeTestSession(true); fail(code);
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
  });
  it('ignores an old generation 401 after a new session has been reconciled', async () => {
    await initializeTestSession(true);
    const auth = TestBed.inject(AuthStore);
    const show = vi.spyOn(TestBed.inject(NotificationStore), 'show');
    const client = TestBed.inject(HttpClient);
    client.get('/api/v1/first').subscribe({ error: () => undefined });
    client.get('/api/v1/second').subscribe({ error: () => undefined });
    const first = http.expectOne('/api/v1/first'); const second = http.expectOne('/api/v1/second');
    first.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull(); expect(show).toHaveBeenCalledOnce();
    const recovery = auth.reconcile();
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush({ ...currentUser, username: 'new-session-user' });
    await recovery;
    second.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.username).toBe('new-session-user');
    expect(show).toHaveBeenCalledOnce();
  });
  it('announces expiry once for concurrent requests from the same session', async () => {
    await initializeTestSession(true);
    const show = vi.spyOn(TestBed.inject(NotificationStore), 'show');
    for (let index = 0; index < 5; index++) {
      TestBed.inject(HttpClient).get('/api/v1/concurrent').subscribe({ error: () => undefined });
    }
    for (const request of http.match('/api/v1/concurrent')) {
      request.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    }
    expect(show).toHaveBeenCalledOnce(); expect(TestBed.inject(AuthStore).user()).toBeNull();
  });
  it('ignores business and authorization errors', async () => {
    await initializeTestSession(true); fail('ACCESS_DENIED', 403);
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
  });
  it.each(['checking', 'anonymous'])('does not announce expiry while %s', async state => {
    if (state === 'anonymous') await initializeTestSession();
    fail('AUTHENTICATION_REQUIRED');
    expect(TestBed.inject(NotificationStore).notification()).toBeNull();
  });
});
