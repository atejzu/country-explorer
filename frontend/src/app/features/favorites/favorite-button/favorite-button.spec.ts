import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { appConfig } from '../../../app.config';
import { AuthStore } from '../../../core/auth/auth-store';
import { authUser, currentUser, initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { summary } from '../../countries/models/country.fixture';
import { FavoriteButton } from './favorite-button';
import { FavoriteIntent } from '../favorite-intent';

@Component({ template: '' })
class Destination {}
const URL = '/api/v1/users/me/favorites';

describe('Guest favourite authentication prompt and intent', () => {
  let http: HttpTestingController; let router: Router;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Destination }])] });
    http = TestBed.inject(HttpTestingController); router = TestBed.inject(Router);
    await initializeTestSession();
    // jsdom does not implement native modal top-layer/focus behavior. Browser acceptance
    // checks that behavior; these shims only let us verify calls and explicit close focus.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  });
  afterEach(() => {
    vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    try { http.verify(); } finally { TestBed.resetTestingModule(); }
  });
  async function open(url = '/') {
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(FavoriteButton); fixture.componentRef.setInput('country', summary);
    await fixture.whenStable(); const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-pressed')).toBe('false'); trigger.focus(); trigger.click(); await fixture.whenStable();
    return { fixture, trigger, dialog: fixture.nativeElement.querySelector('dialog') as HTMLDialogElement };
  }
  async function login() {
    const result = TestBed.inject(AuthStore).login({ email: currentUser.email, password: 'test-only' });
    http.expectOne('/api/v1/auth/login').flush({ user: authUser }); await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null); await result; TestBed.tick();
  }
  it.each(['/', '/?search=slov&region=Europe', '/countries/SVN', '/?search=slov&region=Europe#results', '/countries/SVN#facts'])
    ('offers login and registration with the entire current URL %s', async url => {
      const { dialog } = await open(url);
      expect(dialog.open).toBe(true); expect(dialog.getAttribute('aria-labelledby')).toBe('auth-required-title');
      expect(dialog.textContent).toContain('Za nadaljevanje se prijavi.');
      expect(dialog.textContent).toContain('Prijavi se ali ustvari račun, da shraniš državo med priljubljene. Po prijavi se vrneš na to stran.');
      for (const [index, path, text] of [[0, '/login', 'Prijava'], [1, '/register', 'Ustvari račun']] as const) {
        const link = dialog.querySelectorAll('a')[index]; const parsed = router.parseUrl(link.getAttribute('href')!);
        expect(link.textContent).toBe(text); expect(parsed.root.children['primary'].segments[0].path).toBe(path.slice(1));
        expect(parsed.queryParams['returnUrl']).toBe(url);
      }
      http.expectNone(r => r.url.startsWith(URL));
    });
  it.each(['https://evil.example', '//evil.example', '/%2fevil.example', '/login', '/\\evil.example'])
    ('cannot create an external or looping return URL from %s', async value => {
      const { fixture } = await open();
      vi.spyOn(router, 'url', 'get').mockReturnValue(value);
      fixture.nativeElement.querySelector('dialog button').click(); await fixture.whenStable();
      fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
      const href = fixture.nativeElement.querySelector('dialog a').getAttribute('href');
      expect(router.parseUrl(href).queryParams['returnUrl']).toBe('/');
    });
  it.each(['escape', 'close'])('closes on %s, restores trigger focus and cancels the action', async method => {
    const { fixture, trigger, dialog } = await open(); dialog.querySelector('a')!.focus();
    if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else dialog.querySelector('button')!.click();
    await fixture.whenStable(); expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await router.navigateByUrl('/login?returnUrl=%2F');
    await login(); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
  it.each(['escape', 'close', 'native close'])('clears an already armed action on explicit %s', async method => {
    const { fixture, trigger, dialog } = await open();
    TestBed.inject(FavoriteIntent).arm(summary, '/');
    dialog.querySelector('a')!.focus();
    if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (method === 'native close') { dialog.close(); dialog.dispatchEvent(new Event('close')); }
    else dialog.querySelector('button')!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await router.navigateByUrl('/login?returnUrl=%2F'); await login(); await router.navigateByUrl('/');
    http.expectNone(URL + '/SVN');
  });
  describe.each(['/login', '/register'])('new-context activation of %s', path => {
    it.each([
      ['Ctrl', 'click', { ctrlKey: true }], ['Meta', 'click', { metaKey: true }],
      ['Shift', 'click', { shiftKey: true }], ['Alt', 'click', { altKey: true }],
      ['middle click', 'click', { button: 1 }], ['middle auxclick', 'auxclick', { button: 1 }],
      ['target=_blank', 'click', {}],
    ] as const)('does not arm the original tab on %s', async (kind, type, init) => {
      const { fixture, dialog } = await open();
      const link = dialog.querySelector<HTMLAnchorElement>(`a[href^="${path}"]`)!;
      if (kind === 'target=_blank') {
        const directive = fixture.debugElement.queryAll(By.directive(RouterLink))
          .find(element => element.nativeElement === link)!.injector.get(RouterLink);
        directive.target = '_blank'; fixture.detectChanges();
      }
      const arm = vi.spyOn(TestBed.inject(FavoriteIntent), 'arm');
      let applicationPreventedDefault = false;
      link.addEventListener(type, event => {
        applicationPreventedDefault = event.defaultPrevented;
        // Suppress only jsdom's unimplemented browser navigation, after Angular handlers.
        event.preventDefault();
      }, { once: true });
      link.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
      await fixture.whenStable();
      expect(applicationPreventedDefault).toBe(false); expect(arm).not.toHaveBeenCalled();
      expect(router.url).toBe('/'); expect(dialog.open).toBe(true);
      dialog.querySelector('button')!.click(); await fixture.whenStable();
      await router.navigateByUrl('/login?returnUrl=%2F'); await login(); await router.navigateByUrl('/');
      http.expectNone(URL + '/SVN');
    });
  });
  it('closes on route navigation without retaining an unchosen action', async () => {
    const { fixture } = await open(); await router.navigateByUrl('/account'); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull(); await login(); await router.navigateByUrl('/');
    http.expectNone(URL + '/SVN');
  });
  it.each(['/login', '/register'])('retains the chosen %s flow and consumes it exactly once after confirmed authentication and return', async path => {
    const url = '/?search=slov&region=Europe#results'; const { fixture, trigger, dialog } = await open(url);
    const restoreFocus = vi.spyOn(trigger, 'focus');
    dialog.querySelector<HTMLAnchorElement>(`a[href^="${path}"]`)!.click(); await fixture.whenStable();
    expect(restoreFocus).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull(); http.expectNone(URL + '/SVN');
    if (path === '/register') await router.navigateByUrl('/login?returnUrl=' + encodeURIComponent(url));
    await login(); http.expectNone(URL + '/SVN');
    await router.navigateByUrl(url); const request = http.expectOne(URL + '/SVN'); expect(request.request.method).toBe('PUT');
    request.flush(null); await router.navigateByUrl('/countries/SVN'); await router.navigateByUrl(url); http.expectNone(URL + '/SVN');
  });
  it.each(['Enter', ' '])('accepts %s keyboard activation and consumes the intent once', async key => {
    const { fixture, dialog } = await open();
    const link = dialog.querySelector('a')!; link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    // jsdom does not synthesize the native Enter-generated click for anchors.
    if (key === 'Enter') link.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true, cancelable: true }));
    await fixture.whenStable(); expect(router.url).toBe('/login?returnUrl=%2F');
    await login(); await router.navigateByUrl('/'); http.expectOne(URL + '/SVN').flush(null);
    await router.navigateByUrl('/countries/SVN'); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
  it('does not replay a failed favourite mutation on later navigation', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/'); await router.navigateByUrl('/login?returnUrl=%2F');
    await login(); await router.navigateByUrl('/');
    http.expectOne(URL + '/SVN').error(new ProgressEvent('error'));
    await router.navigateByUrl('/countries/SVN'); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
  it('discards intent on an unconfirmed login instead of replaying after network recovery', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/'); await router.navigateByUrl('/login?returnUrl=%2F');
    const auth = TestBed.inject(AuthStore);
    const result = auth.login({ email: currentUser.email, password: 'test-only' }).catch(() => undefined);
    http.expectOne('/api/v1/auth/login').error(new ProgressEvent('error')); await result; TestBed.tick();
    await initializeTestSession(true); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
  it('keeps intent across expected invalid credentials without executing early', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/'); await router.navigateByUrl('/login?returnUrl=%2F');
    const result = TestBed.inject(AuthStore).login({ email: currentUser.email, password: 'test-only' }).catch(() => undefined);
    http.expectOne('/api/v1/auth/login').flush(problem('INVALID_CREDENTIALS'), { status: 401, statusText: 'Unauthorized' });
    await result; TestBed.tick(); http.expectNone(URL + '/SVN');
    await login(); await router.navigateByUrl('/'); http.expectOne(URL + '/SVN').flush(null);
  });
  it('cancels an intent when the user leaves or changes the returnUrl flow', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/countries/SVN');
    await router.navigateByUrl('/login?returnUrl=%2Fcountries%2FITA'); await login();
    await router.navigateByUrl('/countries/SVN'); http.expectNone(URL + '/SVN');
  });
  it('clears the pending intent on session expiry', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/'); await router.navigateByUrl('/login?returnUrl=%2F');
    await login(); TestBed.inject(AuthStore).expireSession(); TestBed.tick();
    await initializeTestSession(true); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
  it('clears the pending intent when logout begins', async () => {
    TestBed.inject(FavoriteIntent).arm(summary, '/'); await router.navigateByUrl('/login?returnUrl=%2F'); await login();
    const logout = TestBed.inject(AuthStore).logout(); TestBed.tick();
    http.expectOne('/api/v1/auth/logout').flush(null); await Promise.resolve(); http.expectOne('/api/v1/auth/csrf').flush(null); await logout;
    await initializeTestSession(true); await router.navigateByUrl('/'); http.expectNone(URL + '/SVN');
  });
});
