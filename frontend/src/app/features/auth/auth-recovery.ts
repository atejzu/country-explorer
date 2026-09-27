import { Component, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { safeReturnUrl } from '../../core/auth/safe-return-url';

@Component({
  selector: 'app-auth-recovery',
  template: `
    @if (auth.isChecking()) {
      <p role="status">Preverjanje prijave …</p>
    } @else if (auth.logoutPending()) {
      <p role="status">Odjava …</p>
    } @else if (auth.startupError()) {
      <div class="auth-feedback" role="alert">
        <p>{{ auth.loginUnconfirmed() ? 'Izida prijave ni bilo mogoče potrditi.' : 'Prijave trenutno ni mogoče preveriti. Poskusi znova.' }}</p>
        <button type="button" class="button primary" (click)="retry()">
          {{ auth.loginUnconfirmed() ? 'Preveri prijavo' : 'Poskusi znova' }}
        </button>
      </div>
    } @else if (auth.loginPending()) {
      <p role="status">Prijava …</p>
    }`,
})
export class AuthRecovery {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly returnUrl = input('/');
  constructor() {
    // Also handles a login that completes after a different auth page instance was opened.
    effect(() => {
      if (this.auth.isAuthenticated()) void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    });
  }
  protected retry(): Promise<void> { return this.auth.reconcile(); }
}
