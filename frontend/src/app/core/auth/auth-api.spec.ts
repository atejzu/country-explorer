import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from './auth-api';
import { authUser, currentUser } from './auth.fixture';

describe('AuthApi', () => {
  let http: HttpTestingController;
  let api: AuthApi;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); api = TestBed.inject(AuthApi);
  });
  afterEach(() => http.verify());

  it('bootstraps CSRF with a relative GET and no application headers', () => {
    const received = vi.fn(); api.getCsrf().subscribe(received);
    const request = http.expectOne('/api/v1/auth/csrf');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.keys()).toEqual([]);
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(received).toHaveBeenCalledOnce();
  });
  it('posts registration with exactly three fields even when the supplied object has confirmPassword', () => {
    const received = vi.fn();
    const form = { username: 'marko92', email: 'marko@example.com', password: 'test-only', confirmPassword: 'test-only' };
    api.register(form).subscribe(received);
    const request = http.expectOne('/api/v1/auth/register');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: form.username, email: form.email, password: form.password });
    expect(request.request.body).not.toHaveProperty('confirmPassword');
    request.flush(currentUser, { status: 201, statusText: 'Created' });
    expect(received).toHaveBeenCalledWith(currentUser);
  });
  it('posts login and returns the identity-only response', () => {
    const received = vi.fn(); const body = { email: currentUser.email, password: 'test-only' };
    api.login(body).subscribe(received);
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(body);
    request.flush({ user: authUser }); expect(received).toHaveBeenCalledWith({ user: authUser });
  });
  it('posts logout without a user identifier', () => {
    api.logout().subscribe(); const request = http.expectOne('/api/v1/auth/logout');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({});
    request.flush(null, { status: 204, statusText: 'No Content' });
  });
  it('gets the current account including its creation timestamp', () => {
    const received = vi.fn(); api.getCurrentUser().subscribe(received);
    const request = http.expectOne('/api/v1/users/me'); expect(request.request.method).toBe('GET');
    request.flush(currentUser); expect(received).toHaveBeenCalledWith(currentUser);
  });
});
