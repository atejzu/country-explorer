import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CurrentUser, LoginRequest, LoginResponse, RegisterRequest } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  getCsrf(): Observable<void> { return this.http.get<void>('/api/v1/auth/csrf'); }
  getCurrentUser(): Observable<CurrentUser> { return this.http.get<CurrentUser>('/api/v1/users/me'); }
  register({ username, email, password }: RegisterRequest): Observable<CurrentUser> {
    return this.http.post<CurrentUser>('/api/v1/auth/register', { username, email, password });
  }
  login({ email, password }: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/v1/auth/login', { email, password });
  }
  logout(): Observable<void> { return this.http.post<void>('/api/v1/auth/logout', {}); }
}
