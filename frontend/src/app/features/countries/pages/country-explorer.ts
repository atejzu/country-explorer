import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, Subject, switchMap, takeUntil, tap, timer } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { FavoritesStore } from '../../favorites/favorites-store';
import { CountryApi } from '../data-access/country-api';
import { CountryLoadState, countryFailure } from '../data-access/country-load-state';
import { CountryQuery, CountrySummary, REGIONS } from '../models/country';
import { DEFAULT_QUERY, queryParams, readCountryQuery, sameQuery } from '../models/country-query';
import { REGION_LABELS } from '../models/country-labels';
import { CountryCard } from '../components/country-card';
import { CountrySkeleton } from '../components/country-skeleton';
@Component({ selector: 'app-country-explorer', imports: [CountryCard, CountrySkeleton, DecimalPipe],
  templateUrl: './country-explorer.html', styleUrl: './country-explorer.scss' })
export class CountryExplorer {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CountryApi);
  private readonly searches = new Subject<string>();
  private readonly cancelSearch = new Subject<void>();
  protected readonly retry = new Subject<void>();
  protected readonly query = signal(DEFAULT_QUERY);
  protected readonly searchDraft = signal('');
  protected readonly changed = computed(() => !sameQuery(this.query(), DEFAULT_QUERY));
  protected readonly regions = REGIONS;
  protected readonly labels = REGION_LABELS;
  protected readonly skeletons = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly state = toSignal(this.route.queryParamMap.pipe(
    map(readCountryQuery),
    tap(query => {
      // Navigation (including history) cancels uncommitted typing.
      this.cancelSearch.next();
      this.query.set(query);
      this.searchDraft.set(query.search);
    }),
    distinctUntilChanged(sameQuery),
    switchMap(query => this.retry.pipe(startWith(undefined), switchMap(() => this.api.getCountries(query).pipe(
      map(data => ({ status: 'success', data }) as const),
      catchError(error => of({ status: 'error', failure: countryFailure(error) } as const)),
      startWith({ status: 'loading' } as const),
    )))),
  ), { initialValue: { status: 'loading' } as CountryLoadState<CountrySummary[]> });
  constructor() {
    const auth = inject(AuthStore);
    const favorites = inject(FavoritesStore);
    effect(() => {
      const user = auth.user();
      if (auth.isAuthenticated() && user) untracked(() => favorites.ensureLoaded());
    });
    this.searches.pipe(
      switchMap(value => timer(300).pipe(map(() => value.trim()), takeUntil(this.cancelSearch))),
      takeUntilDestroyed(),
    ).subscribe(search => {
      if (search !== this.query().search) this.navigate({ ...this.query(), search });
    });
  }
  protected search(value: string): void { this.searchDraft.set(value); this.searches.next(value); }
  protected filter(region: string): void {
    this.navigate({ ...this.query(), search: this.searchDraft().trim(), region: REGIONS.find(r => r === region) ?? '' });
  }
  protected sort(value: string): void {
    this.navigate({ ...this.query(), search: this.searchDraft().trim(),
      sort: value.startsWith('population-') ? 'population' : 'name', direction: value.endsWith('-desc') ? 'desc' : 'asc' });
  }
  protected clear(): void { this.cancelSearch.next(); this.searchDraft.set(''); this.navigate(DEFAULT_QUERY); }
  private navigate(query: CountryQuery): void {
    this.cancelSearch.next();
    void this.router.navigate([], { relativeTo: this.route, queryParams: queryParams(query) });
  }
}
