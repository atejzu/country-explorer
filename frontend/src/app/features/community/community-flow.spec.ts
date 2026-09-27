import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../app.config';
import { AuthStore } from '../../core/auth/auth-store';
import { ProtectedActionIntent } from '../../core/auth/protected-action-intent';
import { authUser, currentUser, initializeTestSession } from '../../core/auth/auth.fixture';
import { CountryDetail } from '../countries/pages/country-detail';
import { CountryMap } from '../countries/components/country-map';
import { detail } from '../countries/models/country.fixture';
import { button, discussion, fill, mockDialogs, page, restoreDialogs, send } from './community.fixture';
@Component({ selector: 'app-country-map', template: '' })
class MapStub { latitude = input.required<number>(); longitude = input.required<number>(); countryName = input.required<string>(); }

describe.each(['newDiscussion', 'comment'] as const)('Community %s auth continuation', kind => {
  let http: HttpTestingController; let harness: RouterTestingHarness; let router: Router;
  const url = kind === 'newDiscussion' ? '/countries/SVN?from=list#discussions' : '/discussions/discussion-1?from=country#comments';
  const root = () => harness.routeNativeElement!;
  const render = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); harness.detectChanges(); await harness.fixture.whenStable(); };
  async function publicData() {
    if (kind === 'newDiscussion') {
      http.expectOne('/api/v1/countries/SVN').flush(detail); await render();
      http.expectOne('/api/v1/countries/SVN/discussions?page=0&size=10').flush(page([], 0, 10));
    } else {
      http.expectOne('/api/v1/discussions/discussion-1').flush(discussion);
      http.expectOne('/api/v1/discussions/discussion-1/comments?page=0&size=20').flush(page([]));
    }
    await render();
  }
  async function open() { button(root(), kind === 'newDiscussion' ? 'Začni razpravo' : 'Dodaj komentar').click(); await render(); return root().querySelector('dialog')!; }
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    TestBed.overrideComponent(CountryDetail, { remove: { imports: [CountryMap] }, add: { imports: [MapStub] } });
    http = TestBed.inject(HttpTestingController); router = TestBed.inject(Router); await initializeTestSession(); mockDialogs();
    harness = await RouterTestingHarness.create(url); await publicData();
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); restoreDialogs(); } });
  async function login() {
    fill(root(), '#login-email', currentUser.email); fill(root(), '#login-password', 'test-only'); send(root());
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); await render();
    if (kind === 'newDiscussion') http.expectOne('/api/v1/users/me/favorites').flush([]);
    await publicData();
  }
  it.each(['login', 'register'])('normal %s returns to the full URL and continues once without auto-submit', async path => {
    const dialog = await open(); dialog.querySelector<HTMLAnchorElement>(`a[href^="/${path}"]`)!.click(); await render();
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(url);
    if (path === 'register') {
      fill(root(), '#register-username', currentUser.username); fill(root(), '#register-email', currentUser.email);
      fill(root(), '#register-password', 'test-only'); fill(root(), '#register-confirmPassword', 'test-only'); send(root());
      http.expectOne('/api/v1/auth/register').flush(currentUser); await render();
      expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false); expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(url);
    }
    await login(); expect(router.url).toBe(url);
    if (kind === 'newDiscussion') {
      expect(root().querySelector('dialog')?.textContent).toContain('Začni razpravo'); expect(document.activeElement?.id).toBe('discussion-title');
      button(root(), 'Prekliči').click(); await render();
    } else {
      expect(document.activeElement?.id).toBe('comment-body');
      const focus = vi.spyOn(root().querySelector<HTMLTextAreaElement>('#comment-body')!, 'focus'); await render(); expect(focus).not.toHaveBeenCalled();
    }
    http.expectNone(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    await harness.navigateByUrl('/account');
    http.expectOne('/api/v1/users/me').flush(currentUser); await render();
    await harness.navigateByUrl(url); await publicData();
    expect(root().querySelector('dialog')).toBeNull(); expect(TestBed.inject(ProtectedActionIntent).continuation()).toBeNull();
  });
  it.each(['escape', 'close', 'native close'])('clears intent on %s and restores focus', async method => {
    const trigger = button(root(), kind === 'newDiscussion' ? 'Začni razpravo' : 'Dodaj komentar'); const dialog = await open();
    TestBed.inject(ProtectedActionIntent).armCommunity(kind, kind === 'newDiscussion' ? 'SVN' : discussion.id, url);
    if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (method === 'native close') { dialog.close(); dialog.dispatchEvent(new Event('close')); }
    else dialog.querySelector('button')!.click();
    await render(); expect(document.activeElement).toBe(trigger); expect(root().querySelector('dialog')).toBeNull();
    await harness.navigateByUrl('/login?returnUrl=' + encodeURIComponent(url)); await login();
    expect(root().querySelector('dialog')).toBeNull(); expect(TestBed.inject(ProtectedActionIntent).continuation()).toBeNull();
  });
  describe.each(['login', 'register'])('%s links', path => {
    it.each([
      ['Ctrl', 'click', { ctrlKey: true }], ['Meta', 'click', { metaKey: true }], ['Shift', 'click', { shiftKey: true }],
      ['Alt', 'click', { altKey: true }], ['middle', 'click', { button: 1 }], ['auxclick', 'auxclick', { button: 1 }], ['target', 'click', {}],
    ] as const)('does not arm original-tab intent for %s', async (name, type, init) => {
      const dialog = await open(); const link = dialog.querySelector<HTMLAnchorElement>(`a[href^="/${path}"]`)!;
      if (name === 'target') {
        const directive = harness.fixture.debugElement.queryAll(By.directive(RouterLink)).find(element => element.nativeElement === link)!.injector.get(RouterLink);
        directive.target = '_blank'; harness.detectChanges();
      }
      const arm = vi.spyOn(TestBed.inject(ProtectedActionIntent), 'armCommunity');
      let prevented = false;
      link.addEventListener(type, event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
      link.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await render();
      expect(arm).not.toHaveBeenCalled(); expect(prevented).toBe(false); expect(router.url).toBe(url);
      // Even unrelated login later cannot replay this new-tab action.
      await harness.navigateByUrl('/login?returnUrl=' + encodeURIComponent(url)); await login();
      expect(root().querySelector('dialog')).toBeNull(); expect(TestBed.inject(ProtectedActionIntent).continuation()).toBeNull();
      http.expectNone(r => ['POST', 'PATCH', 'DELETE'].includes(r.method));
    });
  });
  it('clears a chosen continuation when logout starts', async () => {
    const dialog = await open(); dialog.querySelector<HTMLAnchorElement>('a')!.click(); await render();
    const result = TestBed.inject(AuthStore).login({ email: currentUser.email, password: 'test-only' });
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve(); http.expectOne('/api/v1/auth/csrf').flush(null); await result;
    // Logout invalidates the session before the pending navigation can continue.
    const logout = TestBed.inject(AuthStore).logout(); await render();
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve(); http.expectOne('/api/v1/auth/csrf').flush(null); await logout; await render();
    expect(TestBed.inject(ProtectedActionIntent).continuation()).toBeNull();
  });
});
