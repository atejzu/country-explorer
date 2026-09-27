import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { safeReturnUrl } from '../../core/auth/safe-return-url';
import { CountrySummary } from '../countries/models/country';
import { FavoritesStore } from './favorites-store';
import { normalizeCountryCode } from './favorite.models';

/** One memory-only intent, armed only when the guest chooses an authentication link. */
@Injectable({ providedIn: 'root' })
export class FavoriteIntent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesStore);
  private readonly intent = signal<{ country: CountrySummary; returnUrl: string } | null>(null);
  private confirmedSession: number | undefined;

  constructor() {
    effect(() => {
      const intent = this.intent();
      const authenticated = this.auth.isAuthenticated();
      const invalid = this.auth.logoutPending() || this.auth.startupError() || this.auth.loginUnconfirmed();
      this.auth.user();
      untracked(() => {
        if (!intent) return;
        if (invalid || (this.confirmedSession !== undefined &&
          (!authenticated || this.confirmedSession !== this.auth.sessionGeneration()))) this.clear();
        else if (authenticated) this.confirmedSession = this.auth.sessionGeneration();
      });
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (!(event instanceof NavigationEnd)) return;
      const intent = this.intent();
      if (!intent) return;
      const url = event.urlAfterRedirects;
      if (this.auth.logoutPending() || this.auth.startupError() || this.auth.loginUnconfirmed()) { this.clear(); return; }
      if (this.auth.isAuthenticated() && url === intent.returnUrl &&
        (this.confirmedSession === undefined || this.confirmedSession === this.auth.sessionGeneration())) {
        // Consume before sending. Neither failure nor a later navigation can replay it.
        this.clear();
        this.favorites.add(intent.country);
        return;
      }
      const tree = this.router.parseUrl(url);
      const path = tree.root.children['primary']?.segments.map(segment => segment.path).join('/');
      if ((path !== 'login' && path !== 'register') || tree.queryParams['returnUrl'] !== intent.returnUrl) this.clear();
    });
  }
  arm(country: CountrySummary, returnUrl: string): void {
    this.clear();
    if (!this.auth.isAuthenticated() && !this.auth.logoutPending()) {
      this.intent.set({ country: { ...country, code: normalizeCountryCode(country.code) }, returnUrl: safeReturnUrl(returnUrl) });
    }
  }
  clear(): void { this.intent.set(null); this.confirmedSession = undefined; }
}
