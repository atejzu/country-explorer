import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, Subject, switchMap, timeout } from 'rxjs';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { LogoutButton } from '../../../core/auth/logout-button';
import { AUTH_READ_TIMEOUT_MS } from '../../../core/auth/auth-read-timeout';

@Component({
  selector: 'app-account-page', imports: [DatePipe, RouterLink, LogoutButton],
  template: `
    <section class="panel auth-panel" aria-labelledby="account-title">
      <h1 id="account-title">Račun</h1>
      @if (!auth.isAuthenticated()) {
        <p>Za ogled računa se prijavi.</p>
        <a class="button primary" routerLink="/login" [queryParams]="{ returnUrl: '/account' }">Prijava</a>
      } @else {
        @let account = state();
        @switch (account.status) {
          @case ('loading') { <p role="status">Nalaganje računa …</p> }
          @case ('error') {
            <div class="auth-feedback" role="alert">
              <p>Podatkov o računu ni bilo mogoče naložiti.</p>
              <button class="button primary" type="button" (click)="retry.next()">Poskusi znova</button>
            </div>
          }
          @case ('success') {
            <dl>
              <div><dt>Uporabniško ime</dt><dd>{{ account.data.username }}</dd></div>
              <div><dt>E-poštni naslov</dt><dd>{{ account.data.email }}</dd></div>
              <div><dt>Datum ustvarjanja računa</dt><dd>{{ account.createdAt | date:'longDate' }}</dd></div>
            </dl>
          }
        }
        <app-logout-button />
      }
    </section>`,
  styles: `
    dl { display: grid; gap: 24px; margin: 24px 0; }
    dt { color: var(--color-graphite); font-size: 14px; }
    dd { margin: 4px 0 0; }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AuthApi);
  protected readonly retry = new Subject<void>();
  protected readonly state = toSignal(this.retry.pipe(startWith(undefined), switchMap(() =>
    this.api.getCurrentUser().pipe(
      timeout(AUTH_READ_TIMEOUT_MS),
      map(data => {
        const timestamp = typeof data?.createdAt === 'string' ? Date.parse(data.createdAt) : NaN;
        return Number.isFinite(timestamp)
          ? { status: 'success', data, createdAt: new Date(timestamp) } as const
          : { status: 'error' } as const;
      }),
      catchError(() => of({ status: 'error' } as const)),
      startWith({ status: 'loading' } as const),
    ),
  )), { initialValue: { status: 'loading' } as const });
}
