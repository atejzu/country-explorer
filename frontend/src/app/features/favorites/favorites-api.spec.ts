import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { summary } from '../countries/models/country.fixture';
import { FavoriteCountry } from './favorite.models';
import { FavoritesApi } from './favorites-api';

describe('FavoritesApi', () => {
  let http: HttpTestingController;
  let api: FavoritesApi;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); api = TestBed.inject(FavoritesApi);
  });
  afterEach(() => http.verify());
  it('gets the typed country summary and server timestamp from the relative endpoint', () => {
    const favorites: FavoriteCountry[] = [{ country: summary, favoritedAt: '2026-09-26T11:45:00Z' }];
    const received = vi.fn(); api.getFavorites().subscribe(received);
    const request = http.expectOne('/api/v1/users/me/favorites');
    expect(request.request.method).toBe('GET'); expect(request.request.params.keys()).toEqual([]);
    request.flush(favorites); expect(received).toHaveBeenCalledWith(favorites);
  });
  it('PUTs no body or user id and completes on 204', () => {
    const complete = vi.fn(); api.addFavorite('svn').subscribe({ complete });
    const request = http.expectOne('/api/v1/users/me/favorites/SVN');
    expect(request.request.method).toBe('PUT'); expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' }); expect(complete).toHaveBeenCalledOnce();
  });
  it('DELETEs the relative country endpoint and completes on 204', () => {
    const complete = vi.fn(); api.removeFavorite('SvN').subscribe({ complete });
    const request = http.expectOne('/api/v1/users/me/favorites/SVN');
    expect(request.request.method).toBe('DELETE'); expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' }); expect(complete).toHaveBeenCalledOnce();
  });
  it('encodes country input as a single path segment without validating existence', () => {
    api.addFavorite('a/b').subscribe(); http.expectOne('/api/v1/users/me/favorites/A%2FB').flush(null);
  });
});
