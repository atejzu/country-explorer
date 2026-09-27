import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { routes } from '../../../app.routes';
import { AuthStore } from '../../../core/auth/auth-store';
import { authUser, initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { button, comment, discussion, fill, mockDialogs, page, restoreDialogs, send } from '../community.fixture';
import { LOCK_MESSAGE } from '../community-feedback';
const URL = '/api/v1/discussions/discussion-1';
const COMMENTS = URL + '/comments?page=0&size=20';

describe('Public discussion detail and owner mutations', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const root = () => harness.routeNativeElement!;
  const render = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); harness.detectChanges(); await harness.fixture.whenStable(); };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession(); mockDialogs();
    harness = await RouterTestingHarness.create('/discussions/discussion-1?from=country#comments'); await render();
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); restoreDialogs(); } });
  async function loaded(locked = false, count = 0) {
    http.expectOne(URL).flush({ ...discussion, locked, commentCount: count });
    http.expectOne(COMMENTS).flush(page([])); await render();
  }
  async function owner(locked = false) { await initializeTestSession(true); await loaded(locked); }
  const article = () => root().querySelector('article')!;
  async function editor() { button(article(), 'Uredi').click(); await render(); }
  async function deletion() { button(article(), 'Izbriši').click(); await render(); }
  it('has a public lazy route without a guard', async () => {
    expect(routes.find(route => route.path === 'discussions/:discussionId')?.canActivate).toBeUndefined(); await loaded();
  });
  it('loads directly and displays content before comments finish', async () => {
    expect(root().textContent).toContain('Nalaganje razprave');
    http.expectOne(URL).flush(discussion); await render();
    expect(root().querySelectorAll('h1')).toHaveLength(1); expect(root().querySelector('h1')?.textContent).toBe(discussion.title);
    expect(root().textContent).toContain('Nalaganje komentarjev');
    expect(root().querySelector('a')?.getAttribute('href')).toBe('/countries/SVN');
    expect(article().textContent).toContain(discussion.body); expect(article().querySelector('img')).toBeNull();
    expect(root().textContent).not.toContain('2026-09-26T'); expect(root().textContent).not.toContain(authUser.email);
    http.expectOne(COMMENTS).flush(page([])); await render();
    expect(root().textContent).toContain('Komentarjev še ni.'); expect(root().textContent).toContain('Bodi prvi, ki odgovori.');
    expect(article().querySelector('button')).toBeNull();
  });
  it('gates comment content and actions after initial failure, then retries only metadata', async () => {
    await initializeTestSession(true);
    http.expectOne(URL).flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Error' });
    http.expectOne(COMMENTS).flush(page([comment])); await render();
    expect(root().textContent).not.toContain(comment.body);
    expect(root().querySelector('app-comment-item')).toBeNull(); expect(root().querySelector('#comment-body')).toBeNull();
    button(root(), 'Poskusi znova').click();
    http.expectOne(URL).flush(discussion); await render(); http.expectNone(COMMENTS);
    expect(root().textContent).toContain(comment.body); expect(root().querySelector('#comment-body')).not.toBeNull();
  });
  it('renders the exact 404 state and no stale thread', async () => {
    http.expectOne(COMMENTS).flush(page([]));
    http.expectOne(URL).flush(problem('DISCUSSION_NOT_FOUND', 404), { status: 404, statusText: 'Not Found' }); await render();
    expect(root().querySelector('h1')?.textContent).toBe('Razprave ni bilo mogoče najti.');
    expect(root().textContent).toContain('Morda je bila izbrisana ali pa povezava ni veljavna.');
    expect(root().querySelector('a')?.textContent).toBe('Nazaj na raziskovanje'); expect(root().querySelector('article')).toBeNull();
  });
  it('shows owner controls only while unlocked and follows current identity', async () => {
    await owner(); expect(button(article(), 'Uredi')).toBeTruthy(); expect(button(article(), 'Izbriši')).toBeTruthy();
    TestBed.inject(AuthStore).expireSession(); await render(); expect(article().querySelector('button')).toBeNull();
    const pending = TestBed.inject(AuthStore).initialize(); http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush({ ...authUser, id: 'user-b' }); await pending; await render();
    expect(article().querySelector('button')).toBeNull();
  });
  it('respects locked=true with count zero and leaves comment form usable', async () => {
    await owner(true); expect(article().querySelector('button')).toBeNull();
    expect(article().textContent).toContain('Urejanje zaklenjeno'); expect(article().textContent).toContain('Komentarji ostajajo odprti.');
    expect(root().querySelector('#comment-body')).not.toBeNull();
  });
  it('hides lock status from guests while preserving the locked server state and open comments', async () => {
    await loaded(true);
    expect(article().textContent).not.toContain('Urejanje zaklenjeno');
    expect(article().textContent).not.toContain(LOCK_MESSAGE);
    expect(article().querySelector('button')).toBeNull();
    expect(root().querySelector('app-comment-list')).not.toBeNull();
  });
  it('hides lock status from authenticated non-owners while leaving commenting available', async () => {
    await initializeTestSession(true);
    http.expectOne(URL).flush({ ...discussion, locked: true, author: { id: 'other', username: 'Other user' } });
    http.expectOne(COMMENTS).flush(page([])); await render();
    expect(article().textContent).not.toContain('Urejanje zaklenjeno');
    expect(article().textContent).not.toContain(LOCK_MESSAGE);
    expect(article().querySelector('button')).toBeNull();
    expect(root().querySelector('#comment-body')).not.toBeNull();
  });
  it('does not infer lock from a nonzero count', async () => {
    await initializeTestSession(true); await loaded(false, 7); expect(button(article(), 'Uredi')).toBeTruthy();
    expect(article().textContent).not.toContain('Urejanje zaklenjeno');
    expect(article().textContent).not.toContain(LOCK_MESSAGE);
  });
  it('prefills edit, prevents duplicate PATCH and uses the server response', async () => {
    await owner(); await editor();
    expect(root().querySelector<HTMLInputElement>('#discussion-title')?.value).toBe(discussion.title);
    expect(root().querySelector<HTMLTextAreaElement>('#discussion-body')?.value).toBe(discussion.body);
    fill(root(), '#discussion-title', 'Posodobljen naslov'); fill(root(), '#discussion-body', 'Posodobljena vsebina');
    const dialog = root().querySelector('dialog')!; send(dialog); send(dialog); await render();
    const request = http.expectOne(URL); expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ title: 'Posodobljen naslov', body: 'Posodobljena vsebina' });
    expect(root().querySelector('h1')?.textContent).toBe(discussion.title); expect(button(dialog, 'Shranjevanje …').disabled).toBe(true);
    request.flush({ ...discussion, title: 'Strežniški naslov', body: 'Strežniška vsebina', updatedAt: '2026-09-27T12:00:00Z' }); await render();
    expect(root().querySelector('dialog')).toBeNull(); expect(root().querySelector('h1')?.textContent).toBe('Strežniški naslov');
    expect(article().textContent).toContain('Urejeno'); expect(TestBed.inject(NotificationStore).notification()).toBeNull();
    http.expectOne(URL).flush({ ...discussion, title: 'Strežniški naslov', body: 'Strežniška vsebina', updatedAt: '2026-09-27T12:00:00Z' }); await render();
  });
  it('validates discussion edit without sending PATCH', async () => {
    await owner(); await editor(); fill(root(), '#discussion-title', '  '); send(root().querySelector('dialog')!); await render();
    expect(root().textContent).toContain('Uporabi 5–150 znakov.'); http.expectNone(URL);
  });
  it('preserves failed edit text', async () => {
    await owner(); await editor(); fill(root(), '#discussion-body', 'Neizgubljen osnutek'); send(root().querySelector('dialog')!);
    http.expectOne(URL).error(new ProgressEvent('error')); await render();
    expect(root().querySelector<HTMLTextAreaElement>('#discussion-body')?.value).toBe('Neizgubljen osnutek');
  });
  it('handles 409 without retry, preserves a copyable draft, refreshes and removes owner actions', async () => {
    await owner(); await editor(); fill(root(), '#discussion-body', 'Osnutek pred zaklepom'); send(root().querySelector('dialog')!);
    http.expectOne(URL).flush(problem('DISCUSSION_LOCKED', 409), { status: 409, statusText: 'Conflict' }); await render();
    const refresh = http.expectOne(URL); expect(refresh.request.method).toBe('GET');
    expect(button(root().querySelector('dialog')!, 'Shrani spremembe').disabled).toBe(true);
    refresh.flush({ ...discussion, locked: true, commentCount: 1 }); await render();
    expect(root().querySelector<HTMLTextAreaElement>('#discussion-body')?.value).toBe('Osnutek pred zaklepom');
    expect(root().querySelector<HTMLTextAreaElement>('#discussion-body')?.readOnly).toBe(true);
    expect(article().querySelector('button')).toBeNull(); expect(root().textContent).toContain(LOCK_MESSAGE);
    expect(TestBed.inject(NotificationStore).notification()?.message).toBe(LOCK_MESSAGE);
    send(root().querySelector('dialog')!); http.expectNone(URL);
  });
  it('confirms deletion accessibly and cancel sends nothing', async () => {
    await owner(); await deletion(); const dialog = root().querySelector('dialog')!;
    expect(dialog.textContent).toContain('Izbrišem razpravo?');
    expect(dialog.textContent).toContain(`Razprava “${discussion.title}” bo trajno izbrisana. Tega ni mogoče razveljaviti.`);
    expect(document.activeElement).toBe(button(dialog, 'Prekliči'));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true })); await render();
    expect(root().querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(button(article(), 'Izbriši')); http.expectNone(URL);
  });
  it('waits for one DELETE and only then navigates to country', async () => {
    await owner(); await deletion(); const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button(root(), 'Izbriši razpravo').click(); button(root(), 'Izbriši razpravo').click();
    const request = http.expectOne(URL); expect(request.request.method).toBe('DELETE'); expect(navigate).not.toHaveBeenCalled();
    expect(article().textContent).toContain(discussion.title);
    request.flush(null, { status: 204, statusText: 'No Content' }); await render();
    expect(navigate).toHaveBeenCalledWith(['/countries', 'SVN']); expect(TestBed.inject(NotificationStore).notification()).toBeNull();
  });
  it.each([['DISCUSSION_LOCKED', 409], ['DISCUSSION_NOT_OWNED', 403], ['DISCUSSION_NOT_FOUND', 404]] as const)('handles DELETE %s explicitly', async (code, status) => {
    await owner(); await deletion(); button(root(), 'Izbriši razpravo').click();
    http.expectOne(URL).flush(problem(code, status), { status, statusText: 'Failure' }); await render();
    expect(root().querySelector('dialog')).toBeNull();
    if (status === 404) expect(root().textContent).toContain('Razprave ni bilo mogoče najti.');
    else {
      http.expectOne(URL).flush({ ...discussion, locked: status === 409 }); await render();
      expect(article().querySelector('button')).toBeNull();
      expect(TestBed.inject(NotificationStore).notification()?.message).toBe(status === 409 ? LOCK_MESSAGE : 'Te razprave ne moreš urejati ali izbrisati.');
    }
  });
  it('integrates a community mutation 401 with existing session expiry', async () => {
    await owner(); await editor(); send(root().querySelector('dialog')!);
    http.expectOne(URL).flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' }); await render();
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false); expect(article().querySelector('button')).toBeNull();
    expect(button(root().querySelector('dialog')!, 'Shrani spremembe').disabled).toBe(true);
    expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Seja je potekla.');
  });
  it('ignores a mutation success from an old session', async () => {
    await owner(); await editor(); send(root().querySelector('dialog')!); const request = http.expectOne(URL);
    TestBed.inject(AuthStore).expireSession(); await render(); request.flush({ ...discussion, title: 'Stale response' }); await render();
    expect(root().querySelector('h1')?.textContent).toBe(discussion.title); expect(article().querySelector('button')).toBeNull();
  });
  it('keeps newer lock/count metadata when a same-session PATCH arrives late, then reconciles content', async () => {
    await owner();
    const generation = TestBed.inject(AuthStore).sessionGeneration();
    fill(root(), '#comment-body', 'Prvi komentar'); send(root().querySelector<HTMLElement>('app-comment-form')!);
    const post = http.expectOne(URL + '/comments');
    await editor(); fill(root(), '#discussion-title', 'Potrjen popravek'); send(root().querySelector('dialog')!);
    const patch = http.expectOne(r => r.url === URL && r.method === 'PATCH');
    const edited = { ...discussion, title: 'Potrjen popravek', body: 'Potrjena vsebina', updatedAt: '2026-09-27T12:00:00Z' };
    post.flush(comment); await render();
    http.expectOne(URL).flush({ ...edited, locked: true, commentCount: 1 });
    http.expectOne(COMMENTS).flush(page([comment])); await render();
    expect(article().textContent).toContain('Urejanje zaklenjeno'); expect(article().querySelector('button')).toBeNull();
    patch.flush(edited); await render();
    expect(TestBed.inject(AuthStore).sessionGeneration()).toBe(generation);
    expect(article().textContent).toContain('Urejanje zaklenjeno'); expect(article().textContent).toContain('Komentarji: 1');
    expect(article().querySelector('button')).toBeNull(); expect(root().querySelector('h1')?.textContent).toBe(edited.title);
    http.expectOne(URL).flush({ ...edited, locked: true, commentCount: 2 }); await render();
    expect(article().textContent).toContain('Komentarji: 2'); expect(article().textContent).toContain(edited.body);
    http.expectNone(URL);
    await harness.navigateByUrl('/discussions/other'); await render();
    http.expectOne('/api/v1/discussions/other').flush({ ...discussion, id: 'other', title: 'Druga razprava' });
    http.expectOne('/api/v1/discussions/other/comments?page=0&size=20').flush(page([])); await render();
    expect(article().textContent).not.toContain('Urejanje zaklenjeno'); expect(button(article(), 'Uredi')).toBeTruthy();
  });
  it('cancels pre-PATCH metadata reads and reconciles with one fresh GET', async () => {
    await owner(); fill(root(), '#comment-body', 'Prvi komentar'); send(root().querySelector<HTMLElement>('app-comment-form')!);
    const post = http.expectOne(URL + '/comments'); await editor(); send(root().querySelector('dialog')!);
    const patch = http.expectOne(r => r.url === URL && r.method === 'PATCH');
    post.flush(comment); await render(); const olderRead = http.expectOne(URL);
    http.expectOne(COMMENTS).flush(page([comment]));
    patch.flush({ ...discussion, title: 'Potrjen popravek', updatedAt: '2026-09-27T12:00:00Z' }); await render();
    expect(olderRead.cancelled).toBe(true);
    const fresh = { ...discussion, title: 'Potrjen popravek', locked: true, commentCount: 1, updatedAt: '2026-09-27T12:00:00Z' };
    http.expectOne(URL).flush(fresh); await render();
    expect(() => olderRead.flush(discussion)).toThrow(/cancelled/);
    expect(article().textContent).toContain('Urejanje zaklenjeno'); expect(article().textContent).toContain('Komentarji: 1');
    expect(root().querySelector('h1')?.textContent).toBe(fresh.title);
  });
  it('cancels both old reads when the discussion route changes', async () => {
    const oldDetail = http.expectOne(URL); const oldComments = http.expectOne(COMMENTS);
    await harness.navigateByUrl('/discussions/other'); await render();
    expect(oldDetail.cancelled).toBe(true); expect(oldComments.cancelled).toBe(true);
    http.expectOne('/api/v1/discussions/other').flush({ ...discussion, id: 'other', title: 'Druga razprava' });
    http.expectOne('/api/v1/discussions/other/comments?page=0&size=20').flush(page([])); await render();
    expect(() => oldDetail.flush(discussion)).toThrow(/cancelled/);
    expect(() => oldComments.flush(page([comment]))).toThrow(/cancelled/);
    expect(root().querySelector('h1')?.textContent).toBe('Druga razprava'); expect(root().textContent).not.toContain(comment.body);
  });
  it('renders contextual invalid-link copy for malformed UUID validation failure', async () => {
    await loaded(); await initializeTestSession(true);
    await harness.navigateByUrl('/discussions/not-a-uuid'); await render();
    http.expectOne('/api/v1/discussions/not-a-uuid/comments?page=0&size=20').flush(problem('VALIDATION_FAILED', 400), { status: 400, statusText: 'Bad Request' });
    http.expectOne('/api/v1/discussions/not-a-uuid').flush(problem('VALIDATION_FAILED', 400), { status: 400, statusText: 'Bad Request' }); await render();
    expect(root().querySelector('h1')?.textContent).toBe('Razprave ni bilo mogoče najti.');
    expect(root().textContent).toContain('Morda je bila izbrisana ali pa povezava ni veljavna.');
    expect(root().textContent).not.toContain('Preveri vnesene podatke.'); expect(root().querySelector('app-comment-list')).toBeNull();
  });
  it('preserves established discussion and comments when metadata refresh fails', async () => {
    await owner(); fill(root(), '#comment-body', 'Nov komentar'); send(root().querySelector<HTMLElement>('app-comment-form')!);
    http.expectOne(URL + '/comments').flush(comment); await render();
    http.expectOne(URL).flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Error' });
    http.expectOne(COMMENTS).flush(page([comment])); await render();
    expect(root().querySelector('h1')?.textContent).toBe(discussion.title); expect(root().textContent).toContain(comment.body);
    expect(root().querySelector('#comment-body')).not.toBeNull();
    button(root(), 'Poskusi znova').click(); http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 1 }); await render();
    http.expectNone(COMMENTS); expect(root().querySelector('[role="alert"]')).toBeNull();
  });

  it.each(['cancel', 'escape', 'close'])('closes discussion edit before restoring the owner trigger on %s', async method => {
    await owner(); const trigger = button(article(), 'Uredi'); await editor();
    const dialog = root().querySelector('dialog')!; const close = vi.spyOn(dialog, 'close');
    const nativeFocus = trigger.focus.bind(trigger);
    const focus = vi.spyOn(trigger, 'focus').mockImplementation(options => { expect(dialog.open).toBe(false); nativeFocus(options); });
    if (method === 'cancel') button(dialog, 'Prekliči').click();
    else if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else dialog.querySelector<HTMLButtonElement>('[aria-label="Zapri pogovorno okno"]')!.click();
    await render(); expect(close).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
    expect(document.activeElement).toBe(trigger); http.expectNone(URL);
  });

});
