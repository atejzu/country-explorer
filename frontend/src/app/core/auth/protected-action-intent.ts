import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { safeReturnUrl } from './safe-return-url';
import { CountrySummary } from '../../features/countries/models/country';
import { FavoritesStore } from '../../features/favorites/favorites-store';
import { normalizeCountryCode } from '../../features/favorites/favorite.models';

export type ProtectedAction =
  | { kind: 'favorite'; country: CountrySummary }
  | { kind: 'newDiscussion'; id: string }
  | { kind: 'comment'; id: string };

/** One memory-only intent, armed only when the guest chooses an authentication link. */
@Injectable({ providedIn: 'root' })
export class ProtectedActionIntent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesStore);
  private readonly intent = signal<{ action: ProtectedAction; returnUrl: string } | null>(null);
  private readonly ready = signal<{ action: ProtectedAction; returnUrl: string } | null>(null);
  readonly continuation = this.ready.asReadonly();
  private confirmedSession: number | undefined;

  constructor() {
    effect(() => {
      const intent = this.intent() ?? this.continuation();
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
      const intent = this.intent() ?? this.continuation();
      if (!intent) return;
      const url = event.urlAfterRedirects;
      if (this.auth.logoutPending() || this.auth.startupError() || this.auth.loginUnconfirmed()) { this.clear(); return; }
      if (this.intent() && this.auth.isAuthenticated() && url === intent.returnUrl &&
        (this.confirmedSession === undefined || this.confirmedSession === this.auth.sessionGeneration())) {
        // Consume before sending. Neither failure nor a later navigation can replay it.
        this.clear();
        if (intent.action.kind === 'favorite') this.favorites.add(intent.action.country);
        else { this.confirmedSession = this.auth.sessionGeneration(); this.ready.set(intent); }
        return;
      }
      if (this.continuation() && url === intent.returnUrl) return;
      const tree = this.router.parseUrl(url);
      const path = tree.root.children['primary']?.segments.map(segment => segment.path).join('/');
      if ((path !== 'login' && path !== 'register') || tree.queryParams['returnUrl'] !== intent.returnUrl) this.clear();
    });
  }
  arm(country: CountrySummary, returnUrl: string): void {
    this.clear();
    if (!this.auth.isAuthenticated() && !this.auth.logoutPending()) {
      this.intent.set({ action: { kind: 'favorite', country: { ...country, code: normalizeCountryCode(country.code) } }, returnUrl: safeReturnUrl(returnUrl) });
    }
  }
  armCommunity(kind: 'newDiscussion' | 'comment', id: string, returnUrl: string): void {
    this.clear();
    if (!this.auth.isAuthenticated() && !this.auth.logoutPending()) {
      this.intent.set({ action: { kind, id }, returnUrl: safeReturnUrl(returnUrl) });
    }
  }
  consume(kind: 'newDiscussion' | 'comment', id: string): boolean {
    const ready = this.continuation();
    if (!ready || !this.auth.isAuthenticated() || this.auth.logoutPending() || this.auth.startupError()
      || this.confirmedSession !== this.auth.sessionGeneration() || ready.returnUrl !== this.router.url
      || ready.action.kind !== kind || ready.action.id !== id) return false;
    this.clear();
    return true;
  }
  clear(): void { this.intent.set(null); this.ready.set(null); this.confirmedSession = undefined; }
}
