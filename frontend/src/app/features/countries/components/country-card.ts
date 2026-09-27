import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoriteButton } from '../../favorites/favorite-button/favorite-button';
import { FavoritesStore } from '../../favorites/favorites-store';
import { CountrySummary } from '../models/country';
import { regionLabel } from '../models/country-labels';
@Component({
  selector: 'app-country-card', imports: [DecimalPipe, RouterLink, FavoriteButton],
  templateUrl: './country-card.html', styleUrl: './country-card.scss',
})
export class CountryCard {
  protected readonly favorites = inject(FavoritesStore);
  readonly country = input.required<CountrySummary>();
  protected readonly regionLabel = regionLabel;
}
