import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountrySummary } from '../models/country';
import { regionLabel } from '../models/country-labels';
@Component({
  selector: 'app-country-card', imports: [DecimalPipe, RouterLink],
  templateUrl: './country-card.html', styleUrl: './country-card.scss',
})
export class CountryCard {
  readonly country = input.required<CountrySummary>();
  protected readonly regionLabel = regionLabel;
}
