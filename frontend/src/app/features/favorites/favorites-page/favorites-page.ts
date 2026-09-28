import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, effect, ElementRef, inject, Injector, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { CountryCard } from '../../countries/components/country-card';
import { CountrySkeleton } from '../../countries/components/country-skeleton';
import { FavoritesStore } from '../favorites-store';
import { GlobeCardPattern } from '../../../shared/ui/globe-card-pattern/globe-card-pattern';

@Component({
  selector: 'app-favorites-page', imports: [RouterLink, CountryCard, CountrySkeleton, GlobeCardPattern],
  templateUrl: './favorites-page.html', styleUrl: './favorites-page.scss',
  host: { '(keydown)': 'keyboard = true', '(pointerdown)': 'keyboard = false' },
})
export class FavoritesPage {
  protected readonly store = inject(FavoritesStore);
  protected readonly auth = inject(AuthStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected keyboard = true;
  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (this.auth.isAuthenticated() && user) untracked(() => this.store.ensureLoaded());
    });
    effect(() => {
      const codes = this.store.visibleFavorites().map(item => item.country.code);
      const cards = [...this.host.nativeElement.querySelectorAll<HTMLElement>('app-country-card')];
      const focused = this.document.activeElement;
      const index = cards.findIndex(card => card.contains(focused) && !codes.includes(card.dataset['code'] ?? ''));
      if (index < 0 || !this.keyboard || !this.auth.isAuthenticated()) return;
      const candidates = [...cards.slice(index + 1), ...cards.slice(0, index).reverse()]
        .map(card => card.dataset['code']);
      afterNextRender(() => {
        // Respect focus moved elsewhere while rendering the response.
        if (this.document.activeElement !== this.document.body && this.document.activeElement !== focused) return;
        const remaining = [...this.host.nativeElement.querySelectorAll<HTMLElement>('app-country-card')];
        const neighbor = candidates.map(code => remaining.find(card => card.dataset['code'] === code)).find(Boolean);
        const target = neighbor?.querySelector<HTMLElement>('button, a')
          ?? this.host.nativeElement.querySelector<HTMLElement>('.explore')
          ?? this.host.nativeElement.querySelector<HTMLElement>('h1');
        target?.focus({ preventScroll: true });
      }, { injector: this.injector });
    });
  }
}
