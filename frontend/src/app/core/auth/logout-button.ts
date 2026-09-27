import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';

@Component({
  selector: 'app-logout-button',
  template: `<button type="button" class="button ghost" [disabled]="auth.logoutPending()" (click)="logout()">
    {{ auth.logoutPending() ? 'Odjava …' : 'Odjava' }}
  </button>`,
})
export class LogoutButton {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected async logout(): Promise<void> {
    if (await this.auth.logout()) await this.router.navigateByUrl('/');
  }
}
