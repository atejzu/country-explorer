import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthApi } from './auth-api';
import { AuthUser, LoginRequest } from './auth.models';
import { apiProblem, isAuthenticationRequired } from '../http/api-problem';
import { AUTH_READ_TIMEOUT_MS } from './auth-read-timeout';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly state = signal<'checking' | 'authenticated' | 'anonymous'>('checking');
  private readonly identity = signal<AuthUser | null>(null);
  private readonly initializationError = signal(false);
  private readonly loggingIn = signal(false);
  private readonly unconfirmedLogin = signal(false);
  private readonly loggingOut = signal(false);
  private readonly logoutFailure = signal(false);
  private initialization: Promise<void> | undefined;
  private mutation: Promise<boolean> | undefined;
  private generation = 0;

  readonly status = this.state.asReadonly();
  readonly user = this.identity.asReadonly();
  readonly startupError = this.initializationError.asReadonly();
  readonly loginPending = this.loggingIn.asReadonly();
  readonly loginUnconfirmed = this.unconfirmedLogin.asReadonly();
  readonly logoutPending = this.loggingOut.asReadonly();
  readonly logoutError = this.logoutFailure.asReadonly();
  readonly isAuthenticated = computed(() => this.status() === 'authenticated');
  readonly isChecking = computed(() => this.status() === 'checking');
  readonly mutationsReady = computed(() => !this.isChecking() && !this.startupError()
    && !this.loginPending() && !this.logoutPending());

  sessionGeneration(): number { return this.generation; }

  initialize(): Promise<void> { return this.reconcile(); }

  reconcile(): Promise<void> {
    if (this.initialization) return this.initialization;
    // Starting an authoritative probe invalidates earlier writers and request generations.
    const operation = ++this.generation;
    const pendingMutation = this.mutation;
    this.clear();
    this.state.set('checking');
    const initialization = this.restore(operation, pendingMutation).finally(() => {
      if (this.initialization === initialization) this.initialization = undefined;
    });
    this.initialization = initialization;
    return initialization;
  }

  private async restore(operation: number, pendingMutation?: Promise<boolean>): Promise<void> {
    // Do not probe before an older POST has settled: its response may still set session cookies.
    if (pendingMutation) await pendingMutation.catch(() => undefined);
    if (operation !== this.generation) return;
    try {
      await this.csrf();
      if (operation !== this.generation) return;
      try {
        const user = await firstValueFrom(this.api.getCurrentUser().pipe(timeout(AUTH_READ_TIMEOUT_MS)));
        if (operation !== this.generation) return;
        this.authenticate(user);
      } catch (error: unknown) {
        if (operation !== this.generation) return;
        this.clear();
        if (!isAuthenticationRequired(error)) this.initializationError.set(true);
        else this.recovered();
      }
    } catch {
      if (operation !== this.generation) return;
      this.clear();
      this.initializationError.set(true);
    }
  }

  login(request: LoginRequest): Promise<boolean> {
    if (!this.mutationsReady()) return Promise.reject(new Error('Auth initialization required'));
    const operation = ++this.generation;
    this.loggingIn.set(true);
    const mutation = this.performLogin(request, operation).finally(() => {
      this.loggingIn.set(false);
      if (this.mutation === mutation) this.mutation = undefined;
    });
    this.mutation = mutation;
    return mutation;
  }

  private async performLogin(request: LoginRequest, operation: number): Promise<boolean> {
    let loginConfirmed = false;
    try {
      const response = await firstValueFrom(this.api.login(request));
      if (operation !== this.generation) return false;
      loginConfirmed = true;
      await this.csrf();
      if (operation !== this.generation) return false;
      this.authenticate(response.user);
      return true;
    } catch (error: unknown) {
      if (operation !== this.generation) return false;
      const invalidCredentials = !loginConfirmed && error instanceof HttpErrorResponse
        && error.status === 401 && apiProblem(error)?.code === 'INVALID_CREDENTIALS';
      if (!invalidCredentials) {
        // A lost response (including the CSRF refresh) cannot disprove server-side login.
        ++this.generation;
        this.clear();
        this.initializationError.set(true);
        this.unconfirmedLogin.set(true);
      }
      throw error;
    }
  }

  logout(): Promise<boolean> {
    if (this.loggingOut() || this.isChecking()) return Promise.resolve(false);
    const pendingMutation = this.mutation;
    const refreshFirst = this.startupError() || !!pendingMutation;
    // Invalidate older login writes immediately, before waiting for their transport to settle.
    const operation = ++this.generation;
    this.clear();
    this.loggingOut.set(true);
    this.unconfirmedLogin.set(false);
    this.logoutFailure.set(false);
    const mutation = this.performLogout(operation, refreshFirst, pendingMutation).finally(() => {
      this.loggingOut.set(false);
      if (this.mutation === mutation) this.mutation = undefined;
    });
    this.mutation = mutation;
    return mutation;
  }

  private async performLogout(operation: number, refreshFirst: boolean,
    pendingMutation?: Promise<boolean>): Promise<boolean> {
    if (pendingMutation) await pendingMutation.catch(() => undefined);
    if (operation !== this.generation) return false;
    let logoutAttempted = false;
    try {
      // An earlier login or lost logout response may have rotated CSRF on the server.
      if (refreshFirst) {
        await this.csrf();
        if (operation !== this.generation) return false;
      }
      logoutAttempted = true;
      await firstValueFrom(this.api.logout());
    } catch (error: unknown) {
      if (operation !== this.generation) return false;
      if (!logoutAttempted || !isAuthenticationRequired(error)) {
        this.initializationError.set(true);
        this.logoutFailure.set(true);
        return false;
      }
    }
    if (operation !== this.generation) return false;
    try {
      await this.csrf();
      if (operation !== this.generation) return false;
      this.recovered();
    } catch {
      if (operation !== this.generation) return false;
      this.initializationError.set(true);
    }
    return true;
  }

  expireSession(): void {
    ++this.generation;
    this.clear();
    this.initializationError.set(true);
  }

  private csrf(): Promise<void> {
    return firstValueFrom(this.api.getCsrf().pipe(timeout(AUTH_READ_TIMEOUT_MS)));
  }

  private authenticate(user: AuthUser): void {
    this.identity.set({ id: user.id, username: user.username, email: user.email });
    this.state.set('authenticated');
    this.recovered();
  }

  private recovered(): void {
    // Completed probes/auth transitions establish a new generation, including anonymous state.
    ++this.generation;
    this.initializationError.set(false);
    this.unconfirmedLogin.set(false);
    this.logoutFailure.set(false);
  }

  private clear(): void { this.identity.set(null); this.state.set('anonymous'); }
}
