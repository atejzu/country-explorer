import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, Subject, switchMap } from 'rxjs';
import { CountryApi } from '../data-access/country-api';
import { CountryLoadState, countryFailure } from '../data-access/country-load-state';
import { CountryCurrency, CountryLanguage, CountryDetail as CountryDetailModel } from '../models/country';
import { displayName, drivingSideLabel, regionLabel, subregionLabel } from '../models/country-labels';
import { CountryMap } from '../components/country-map';
@Component({ selector: 'app-country-detail', imports: [DecimalPipe, RouterLink, CountryMap],
  templateUrl: './country-detail.html', styleUrl: './country-detail.scss' })
export class CountryDetail {
  private readonly api = inject(CountryApi);
  protected readonly retry = new Subject<void>();
  protected readonly drivingSideLabel = drivingSideLabel;
  protected readonly regionLabel = regionLabel;
  protected readonly subregionLabel = subregionLabel;
  protected currencyLabels(currencies: CountryCurrency[]): string[] {
    return currencies.map(currency => {
      const name = displayName('currency', currency.code, currency.name);
      return name ? [name, currency.code, currency.symbol].filter(Boolean).join(' · ') : '';
    }).filter(Boolean);
  }
  protected languageLabels(languages: CountryLanguage[]): string[] {
    return languages.map(language => displayName('language', language.code, language.name)).filter(Boolean);
  }
  protected readonly state = toSignal(inject(ActivatedRoute).paramMap.pipe(
    map(params => params.get('code') ?? ''), distinctUntilChanged(),
    switchMap(code => this.retry.pipe(startWith(undefined), switchMap(() => this.api.getCountry(code).pipe(
      map(data => ({ status: 'success', data }) as const),
      catchError(error => of({ status: 'error', failure: countryFailure(error) } as const)),
      startWith({ status: 'loading' } as const),
    )))),
  ), { initialValue: { status: 'loading' } as CountryLoadState<CountryDetailModel> });
  protected validCoordinates(value: CountryDetailModel['coordinates']): value is { latitude: number; longitude: number } {
    return value !== null && value.latitude !== null && value.longitude !== null &&
      Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
      Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
  }
}
