import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FavoriteCountry, normalizeCountryCode } from './favorite.models';

const FAVORITES_URL = '/api/v1/users/me/favorites';

@Injectable({ providedIn: 'root' })
export class FavoritesApi {
  private readonly http = inject(HttpClient);
  getFavorites(): Observable<FavoriteCountry[]> { return this.http.get<FavoriteCountry[]>(FAVORITES_URL); }
  addFavorite(code: string): Observable<void> { return this.http.put<void>(this.url(code), null); }
  removeFavorite(code: string): Observable<void> { return this.http.delete<void>(this.url(code)); }
  private url(code: string): string { return `${FAVORITES_URL}/${encodeURIComponent(normalizeCountryCode(code))}`; }
}
