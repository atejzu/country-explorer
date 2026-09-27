import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth-store';
import { authSessionInterceptor } from '../../core/auth/auth-session-interceptor';
import { currentUser, initializeTestSession, problem } from '../../core/auth/auth.fixture';
import { NotificationStore } from '../../core/notifications/notification-store';
import { summary } from '../countries/models/country.fixture';
import { FavoritesStore } from './favorites-store';

const URL = '/api/v1/users/me/favorites';
const favorite = { country: summary, favoritedAt: '2026-09-26T11:45:00Z' };
const italy = { ...summary, code: 'ITA', name: 'Italija' };
const fail = (request: TestRequest) => request.flush({}, { status: 503, statusText: 'Unavailable' });

describe('FavoritesStore', () => {
  let http: HttpTestingController; let store: FavoritesStore; let auth: AuthStore; let notices: NotificationStore;
  const load = (items = [favorite]) => { store.ensureLoaded(); http.expectOne(URL).flush(items); };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authSessionInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthStore);
    await initializeTestSession(true);
    store = TestBed.inject(FavoritesStore); notices = TestBed.inject(NotificationStore);
  });
  afterEach(() => http.verify());
  it('starts unloaded without performing a startup request', () => {
    expect(store.favorites()).toEqual([]); expect(store.loaded()).toBe(false);
    expect(store.loading()).toBe(false); expect(store.error()).toBe(false); http.expectNone(URL);
  });
  it('does not load or mutate for a guest', () => {
    auth.expireSession(); store.ensureLoaded(); store.add(summary); store.remove(summary);
    http.expectNone(r => r.url.startsWith(URL)); expect(store.favorites()).toEqual([]);
  });
  it('deduplicates concurrent loads and does not reload successful data', () => {
    store.ensureLoaded(); store.ensureLoaded(); expect(store.loading()).toBe(true);
    http.expectOne(URL).flush([favorite]); store.ensureLoaded(); http.expectNone(URL);
    expect(store.loaded()).toBe(true); expect(store.loading()).toBe(false); expect(store.favorites()).toEqual([favorite]);
  });
  it('treats an empty response as successfully loaded data', () => {
    load([]); expect(store.loaded()).toBe(true); expect(store.favorites()).toEqual([]); expect(store.error()).toBe(false);
  });
  it('distinguishes failed loading from an empty list and retries explicitly', () => {
    store.ensureLoaded(); fail(http.expectOne(URL));
    expect(store.loaded()).toBe(false); expect(store.error()).toBe(true); expect(store.loading()).toBe(false);
    expect(notices.notification()).toBeNull(); store.ensureLoaded();
    expect(store.error()).toBe(false); http.expectOne(URL).flush([favorite]); expect(store.loaded()).toBe(true);
  });
  it.each(['svn', 'SVN', 'SvN'])('normalizes membership for %s', code => {
    load([{ ...favorite, country: { ...summary, code: 'svn' } }]); expect(store.isFavorite(code)).toBe(true);
    expect(store.favorites()[0].country.code).toBe('SVN');
  });
  it('adds optimistically with explicitly absent server metadata and success retains state', () => {
    load([]); store.add(summary); expect(store.isFavorite('SVN')).toBe(true); expect(store.isPending('svn')).toBe(true);
    expect(store.favorites()).toEqual([{ country: summary, favoritedAt: null }]);
    http.expectOne(URL + '/SVN').flush(null); expect(store.isFavorite('SVN')).toBe(true); expect(store.isPending('SVN')).toBe(false);
    expect(notices.notification()).toBeNull();
  });
  it('removes membership immediately, retains its grid position, then removes the row on success', () => {
    load([favorite, { country: italy, favoritedAt: favorite.favoritedAt }]); store.remove(summary);
    expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(true);
    expect(store.visibleFavorites().map(item => item.country.code)).toEqual(['SVN', 'ITA']);
    http.expectOne(URL + '/SVN').flush(null);
    expect(store.visibleFavorites().map(item => item.country.code)).toEqual(['ITA']);
    expect(notices.notification()).toBeNull();
  });
  it('rolls back a failed add exactly and shows approved transient failure copy', () => {
    load([]); store.add(summary); fail(http.expectOne(URL + '/SVN'));
    expect(store.favorites()).toEqual([]); expect(store.isPending('SVN')).toBe(false); expect(store.error()).toBe(false);
    expect(notices.notification()?.message).toBe('Priljubljenih ni bilo mogoče posodobiti. Poskusi znova.');
  });
  it('rolls back a failed remove with the original server timestamp and ordering', () => {
    const items = [favorite, { country: italy, favoritedAt: favorite.favoritedAt }];
    load(items); store.remove(summary); fail(http.expectOne(URL + '/SVN'));
    expect(store.favorites()).toEqual(items); expect(store.isPending('SVN')).toBe(false); expect(store.error()).toBe(false);
  });
  it('deduplicates rapid adds and the opposite mutation while that country is pending', () => {
    load([]); store.add(summary); store.add({ ...summary, code: 'svn' }); store.remove(summary);
    const request = http.expectOne(URL + '/SVN'); expect(request.request.method).toBe('PUT'); request.flush(null);
  });
  it('deduplicates rapid removals and the opposite mutation while pending', () => {
    load(); store.remove(summary); store.remove({ ...summary, code: 'svn' }); store.add(summary);
    const request = http.expectOne(URL + '/SVN'); expect(request.request.method).toBe('DELETE'); request.flush(null);
  });
  it('allows countries to progress independently and only rolls back the failed country', () => {
    load(); store.remove(summary); store.add(italy);
    expect(store.isPending('SVN')).toBe(true); expect(store.isPending('ITA')).toBe(true);
    http.expectOne(URL + '/ITA').flush(null); fail(http.expectOne(URL + '/SVN'));
    expect(store.isFavorite('SVN')).toBe(true); expect(store.isFavorite('ITA')).toBe(true);
  });
  it('ignores a load resolving after logout starts, before effects run', async () => {
    store.ensureLoaded(); const old = http.expectOne(URL); const logout = auth.logout();
    expect(store.loading()).toBe(false); expect(store.loaded()).toBe(false);
    old.flush([favorite]); expect(store.favorites()).toEqual([]);
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); await logout;
  });
  it.each(['success', 'failure'])('ignores stale mutation %s after session expiry', outcome => {
    load(); store.remove(summary); const old = http.expectOne(URL + '/SVN'); auth.expireSession();
    if (outcome === 'success') old.flush(null); else fail(old);
    expect(store.favorites()).toEqual([]); expect(store.visibleFavorites()).toEqual([]); expect(notices.notification()).toBeNull();
  });
  it('does not let a stale mutation roll back a new user or show a stale notification', async () => {
    load(); store.remove(summary); const old = http.expectOne(URL + '/SVN'); auth.expireSession();
    const ready = auth.initialize(); http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush({ ...currentUser, id: 'another-user', username: 'another' }); await ready;
    load([{ country: italy, favoritedAt: favorite.favoritedAt }]); fail(old);
    expect(store.favorites().map(item => item.country.code)).toEqual(['ITA']); expect(notices.notification()).toBeNull();
  });
  it('reloads for a new session of the same user', async () => {
    load(); await initializeTestSession(true); expect(store.loaded()).toBe(false); expect(store.isFavorite('SVN')).toBe(false);
    load([]); expect(store.loaded()).toBe(true);
  });
  it('clears all state and invalidates old operations even inside the same session', () => {
    load(); store.remove(summary); const old = http.expectOne(URL + '/SVN'); store.clear(); fail(old);
    expect(store.favorites()).toEqual([]); expect(store.visibleFavorites()).toEqual([]); expect(store.loaded()).toBe(false);
    expect(store.loading()).toBe(false); expect(store.error()).toBe(false); expect(store.isPending('SVN')).toBe(false);
    expect(notices.notification()).toBeNull();
  });
  it('clears a load error and pending load on explicit clear', () => {
    store.ensureLoaded(); fail(http.expectOne(URL)); store.clear(); expect(store.error()).toBe(false);
    store.ensureLoaded(); const old = http.expectOne(URL); store.clear(); old.flush([favorite]);
    expect(store.loading()).toBe(false); expect(store.loaded()).toBe(false); expect(store.favorites()).toEqual([]);
  });
  it('lets the existing interceptor expire auth without duplicate mutation feedback', () => {
    load(); store.remove(summary);
    http.expectOne(URL + '/SVN').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false); expect(store.favorites()).toEqual([]); expect(store.isPending('SVN')).toBe(false);
    expect(notices.notification()?.message).toBe('Seja je potekla.');
  });
  it('handles load session expiry without a retry loop', () => {
    store.ensureLoaded(); http.expectOne(URL).flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    store.ensureLoaded(); http.expectNone(URL); expect(store.loaded()).toBe(false); expect(store.error()).toBe(false);
  });
  it.each(['pending', 'confirmed'])('preserves a %s optimistic add when the older GET arrives', outcome => {
    store.ensureLoaded(); const get = http.expectOne(URL); store.add(summary); const put = http.expectOne(URL + '/SVN');
    if (outcome === 'confirmed') put.flush(null);
    get.flush([]); expect(store.isFavorite('SVN')).toBe(true);
    if (outcome === 'pending') put.flush(null);
  });
  it('preserves a remove against an older list and can still roll it back', () => {
    store.add(summary); http.expectOne(URL + '/SVN').flush(null);
    store.ensureLoaded(); const get = http.expectOne(URL); store.remove(summary); const remove = http.expectOne(URL + '/SVN');
    get.flush([favorite]); expect(store.isFavorite('SVN')).toBe(false); fail(remove); expect(store.isFavorite('SVN')).toBe(true);
  });
  it.each(['GET first', 'DELETE first'])('does not resurrect a successful removal when %s completes', order => {
    // Establish saved membership before the first list load; no production refresh API is needed.
    store.add(summary); http.expectOne(URL + '/SVN').flush(null);
    expect(store.isFavorite('SVN')).toBe(true);
    store.ensureLoaded(); const get = http.expectOne(URL);
    store.remove(summary); const remove = http.expectOne(URL + '/SVN');
    expect(remove.request.method).toBe('DELETE');
    expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(true);
    expect(store.visibleFavorites().map(item => item.country.code)).toEqual(['SVN']);
    if (order === 'GET first') {
      get.flush([favorite]);
      expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(true);
      expect(store.visibleFavorites().map(item => item.country.code)).toEqual(['SVN']);
      remove.flush(null);
    } else {
      remove.flush(null);
      expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(false);
      expect(store.visibleFavorites()).toEqual([]);
      get.flush([favorite]);
    }
    expect(store.loaded()).toBe(true); expect(store.loading()).toBe(false);
    expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(false);
    expect(store.favorites()).toEqual([]); expect(store.visibleFavorites()).toEqual([]);
  });
  describe.each(['PUT', 'DELETE'])('%s across actual logout', method => {
    it.each([
      ['success', 'anonymous'], ['failure', 'anonymous'],
      ['success', 'user B'], ['failure', 'user B'],
    ])('ignores late %s while %s owns the session', async (outcome, destination) => {
      load(method === 'DELETE' ? [favorite] : []);
      if (method === 'PUT') store.add(summary); else store.remove(summary);
      const old = http.expectOne(URL + '/SVN'); expect(old.request.method).toBe(method);
      expect(store.isFavorite('SVN')).toBe(method === 'PUT'); expect(store.isPending('SVN')).toBe(true);
      expect(store.visibleFavorites().map(item => item.country.code)).toEqual(['SVN']);

      const logout = auth.logout();
      expect(auth.isAuthenticated()).toBe(false); expect(store.isPending('SVN')).toBe(false);
      expect(store.favorites()).toEqual([]); expect(store.visibleFavorites()).toEqual([]);
      http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve();
      http.expectOne('/api/v1/auth/csrf').flush(null); await logout;

      const bFavorites = [{ country: italy, favoritedAt: favorite.favoritedAt }];
      if (destination === 'user B') {
        const ready = auth.initialize(); http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
        http.expectOne('/api/v1/users/me').flush({ ...currentUser, id: 'user-b' }); await ready;
        store.ensureLoaded(); const bLoad = http.expectOne(URL);
        expect(store.loading()).toBe(true); expect(store.isFavorite('SVN')).toBe(false);
        bLoad.flush(bFavorites);
      }
      expect(notices.notification()).toBeNull();
      if (outcome === 'success') old.flush(null); else fail(old);
      const expected = destination === 'user B' ? bFavorites : [];
      expect(store.favorites()).toEqual(expected); expect(store.visibleFavorites()).toEqual(expected);
      expect(store.isFavorite('SVN')).toBe(false); expect(store.isPending('SVN')).toBe(false);
      expect(store.loaded()).toBe(destination === 'user B'); expect(store.loading()).toBe(false);
      expect(store.error()).toBe(false); expect(notices.notification()).toBeNull();
    });
  });
  it('rolls back to server membership if the first GET arrives during an add', () => {
    store.ensureLoaded(); const get = http.expectOne(URL); store.add(summary);
    get.flush([favorite]); fail(http.expectOne(URL + '/SVN')); expect(store.favorites()).toEqual([favorite]);
  });
  it('does not reuse a deleted relationship timestamp when adding the same country again', () => {
    load(); store.remove(summary); http.expectOne(URL + '/SVN').flush(null);
    store.add(summary); expect(store.favorites()[0].favoritedAt).toBeNull();
    http.expectOne(URL + '/SVN').flush(null); expect(store.favorites()[0].favoritedAt).toBeNull();
  });
  it('ignores an old GET after a different user has loaded their own favourites', async () => {
    store.ensureLoaded(); const old = http.expectOne(URL); auth.expireSession();
    const ready = auth.initialize(); http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush({ ...currentUser, id: 'another-user' }); await ready;
    load([{ country: italy, favoritedAt: favorite.favoritedAt }]); old.flush([favorite]);
    expect(store.favorites().map(item => item.country.code)).toEqual(['ITA']);
  });

});
