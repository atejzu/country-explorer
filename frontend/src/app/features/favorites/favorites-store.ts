import { computed, inject, Injectable, linkedSignal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth-store';
import { NotificationStore } from '../../core/notifications/notification-store';
import { CountrySummary } from '../countries/models/country';
import { FavoriteEntry, normalizeCountryCode } from './favorite.models';
import { FavoritesApi } from './favorites-api';

interface Change { entry: FavoriteEntry; saved: boolean; pending: boolean; }
interface FavoritesState {
  baseline: FavoriteEntry[];
  changes: Map<string, Change>;
  loaded: boolean;
  loading: boolean;
  error: boolean;
}
const emptyState = (): FavoritesState => ({ baseline: [], changes: new Map(), loaded: false, loading: false, error: false });

@Injectable({ providedIn: 'root' })
export class FavoritesStore {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(FavoritesApi);
  private readonly notifications = inject(NotificationStore);
  // Auth signals invalidate this key. linkedSignal resets synchronously on the next read,
  // including reads before Angular effects have run after logout/identity replacement.
  private readonly session = computed(() => {
    const user = this.auth.user();
    return this.auth.isAuthenticated() && !this.auth.logoutPending() && user
      ? `${user.id}:${this.auth.sessionGeneration()}` : null;
  });
  private readonly state = linkedSignal(() => { this.session(); return emptyState(); });
  private epoch = 0;
  readonly loaded = computed(() => this.state().loaded);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  private readonly rows = computed(() => {
    const { baseline, changes } = this.state();
    const rows = new Map(baseline.map(entry => [entry.country.code, { entry, saved: true, pending: false }]));
    for (const [code, change] of changes) rows.set(code, change);
    return rows;
  });
  readonly favorites = computed(() => [...this.rows().values()].filter(row => row.saved).map(row => row.entry));
  /** Pending removals retain their original Map/grid position until server confirmation. */
  readonly visibleFavorites = computed(() => [...this.rows().values()]
    .filter(row => row.saved || row.pending).map(row => row.entry));

  isFavorite(code: string): boolean { return this.rows().get(normalizeCountryCode(code))?.saved ?? false; }
  isPending(code: string): boolean { return this.rows().get(normalizeCountryCode(code))?.pending ?? false; }

  ensureLoaded(): void {
    const session = this.session();
    if (!session || this.loaded() || this.loading()) return;
    const epoch = this.epoch;
    const generation = this.auth.sessionGeneration();
    this.state.update(state => ({ ...state, loading: true, error: false }));
    this.api.getFavorites().subscribe({
      next: favorites => {
        if (!this.current(session, generation, epoch)) return;
        this.state.update(state => ({ ...state, loading: false, loaded: true, error: false,
          baseline: favorites.map(item => ({ ...item, country: { ...item.country, code: normalizeCountryCode(item.country.code) } })) }));
      },
      error: () => {
        if (this.current(session, generation, epoch)) this.state.update(state => ({ ...state, loading: false, error: true }));
      },
    });
  }

  add(country: CountrySummary): void { this.mutate(country, true); }
  remove(country: CountrySummary): void { this.mutate(country, false); }
  clear(): void { ++this.epoch; this.state.set(emptyState()); }

  private mutate(country: CountrySummary, saved: boolean): void {
    const session = this.session();
    const code = normalizeCountryCode(country.code);
    if (!session || this.isPending(code) || this.isFavorite(code) === saved) return;
    const generation = this.auth.sessionGeneration();
    const epoch = this.epoch;
    const previous = this.state().changes.get(code);
    const entry = !saved ? this.rows().get(code)!.entry
      : { country: { ...country, code }, favoritedAt: null };
    const change: Change = { entry, saved, pending: true };
    this.setChange(code, change);
    (saved ? this.api.addFavorite(code) : this.api.removeFavorite(code)).subscribe({
      next: () => {
        if (!this.current(session, generation, epoch)) return;
        this.setChange(code, { ...change, pending: false });
      },
      error: () => {
        if (!this.current(session, generation, epoch)) return;
        this.setChange(code, previous);
        this.notifications.show('Priljubljenih ni bilo mogoče posodobiti. Poskusi znova.');
      },
    });
  }

  private setChange(code: string, change: Change | undefined): void {
    this.state.update(state => {
      const changes = new Map(state.changes);
      if (change) changes.set(code, change); else changes.delete(code);
      return { ...state, changes };
    });
  }
  private current(session: string, generation: number, epoch: number): boolean {
    return this.session() === session && this.auth.sessionGeneration() === generation && this.epoch === epoch;
  }
}
