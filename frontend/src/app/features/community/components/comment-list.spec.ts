import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { AuthStore } from '../../../core/auth/auth-store';
import { initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { button, comment, discussion, fill, mockDialogs, page, restoreDialogs, send } from '../community.fixture';
import { COMMENT_FAILURE } from '../community-feedback';
const URL = '/api/v1/discussions/discussion-1';
const COMMENTS = URL + '/comments';
const COMMENT = '/api/v1/comments/comment-1';
describe('Comments and permanent discussion lock', () => {
  let http: HttpTestingController; let harness: RouterTestingHarness;
  const root = () => harness.routeNativeElement!;
  const list = () => root().querySelector<HTMLElement>('app-comment-list')!;
  const item = () => list().querySelector<HTMLElement>('app-comment-item')!;
  const create = () => list().querySelector<HTMLElement>('app-comment-form')!;
  const render = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); harness.detectChanges(); await harness.fixture.whenStable(); };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession(true); mockDialogs();
    harness = await RouterTestingHarness.create('/discussions/discussion-1'); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 1 }); await render();
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); restoreDialogs(); } });
  async function loaded(items = [comment], total = items.length) { http.expectOne(COMMENTS + '?page=0&size=20').flush(page(items, 0, 20, total)); await render(); }
  async function edit() { button(item(), 'Uredi').click(); await render(); }
  async function remove() { button(item(), 'Izbriši').click(); await render(); }
  it('keeps comments independently loading and offers authenticated form', async () => {
    expect(list().textContent).toContain('Nalaganje komentarjev'); expect(root().querySelector('h1')?.textContent).toBe(discussion.title);
    expect(create().textContent).toContain(`Objavljaš kot ${discussion.author.username}`); expect(create().textContent).toContain('Največ 2.000 znakov.'); await loaded();
  });
  it('renders server order, escaped multiline text, owner marker and controls on a locked discussion', async () => {
    await loaded([comment, { ...comment, id: 'comment-2', body: '<script>bad()</script>', author: { id: 'other', username: 'Other user' }, updatedAt: '2026-09-27T10:00:00Z' }]);
    const items = list().querySelectorAll('app-comment-item'); expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain(comment.body); expect(items[0].textContent).toContain('Vi');
    expect(items[0].querySelectorAll('button')).toHaveLength(2); expect(items[1].querySelector('button')).toBeNull();
    expect(items[1].querySelector('script')).toBeNull(); expect(items[1].textContent).toContain('<script>bad()</script>'); expect(items[1].textContent).toContain('Urejeno');
  });
  it('hides owner controls and shows the guest prompt after logout', async () => {
    await loaded(); TestBed.inject(AuthStore).expireSession(); await render();
    expect(item().querySelector('button')).toBeNull(); expect(list().textContent).toContain('Za sodelovanje v razpravi se prijavi.');
    expect(list().textContent).toContain('Postavi vprašanje ali deli svoje mnenje.'); button(list(), 'Dodaj komentar').click(); await render();
    expect(root().querySelector('dialog')?.textContent).toContain('Prijavi se ali ustvari račun, da sodeluješ v razpravi. Po prijavi se vrneš na to stran.');
    http.expectNone(r => r.method === 'POST');
  });
  it('handles empty and section error/retry without reloading discussion', async () => {
    http.expectOne(COMMENTS + '?page=0&size=20').error(new ProgressEvent('error')); await render();
    expect(list().textContent).toContain('Komentarjev ni bilo mogoče naložiti.'); button(list(), 'Poskusi znova').click(); await loaded([]);
    expect(list().textContent).toContain('Komentarjev še ni.'); expect(list().textContent).toContain('Bodi prvi, ki odgovori.'); http.expectNone(URL);
  });
  it('paginates oldest-first without reloading discussion metadata', async () => {
    await loaded([comment], 21); expect(button(list(), 'Prejšnja').disabled).toBe(true); button(list(), 'Naslednja').click(); await render();
    http.expectOne(COMMENTS + '?page=1&size=20').flush(page([{ ...comment, id: 'last' }], 1, 20, 21)); await render();
    expect(list().textContent).toContain('Stran 2 od 2'); expect(button(list(), 'Naslednja').disabled).toBe(true); http.expectNone(URL);
  });
  it.each(['', '   ', 'a'.repeat(2001)])('rejects invalid comment content', async body => {
    await loaded([]); fill(root(), '#comment-body', body); send(create()); await render();
    expect(create().textContent).toContain('Vnesi komentar z največ 2.000 znaki.'); expect(document.activeElement?.id).toBe('comment-body');
    http.expectNone(r => r.method === 'POST');
  });
  it('POSTs once, waits for confirmation, clears the form and refreshes both resources', async () => {
    await loaded([]); fill(root(), '#comment-body', ' Nov komentar '); send(create()); send(create()); await render();
    const request = http.expectOne(COMMENTS); expect(request.request.body).toEqual({ body: 'Nov komentar' }); expect(request.request.method).toBe('POST');
    expect(button(create(), 'Objavljanje komentarja …').disabled).toBe(true); expect(list().querySelector('app-comment-item')).toBeNull();
    request.flush({ ...comment, body: 'Nov komentar' }, { status: 201, statusText: 'Created' }); await render();
    expect(root().querySelector<HTMLTextAreaElement>('#comment-body')?.value).toBe('');
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 1 });
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([{ ...comment, body: 'Nov komentar' }])); await render();
    expect(item().textContent).toContain('Nov komentar'); expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Komentar je objavljen.');
  });
  it('transitions an unlocked discussion after its first server-confirmed comment', async () => {
    await loaded([]);
    // Reload route to establish the genuinely unlocked starting state.
    await harness.navigateByUrl('/discussions/first'); await render();
    http.expectOne('/api/v1/discussions/first').flush({ ...discussion, id: 'first' });
    http.expectOne('/api/v1/discussions/first/comments?page=0&size=20').flush(page([])); await render();
    expect(button(root().querySelector('article')!, 'Uredi')).toBeTruthy(); fill(root(), '#comment-body', 'Prvi komentar'); send(create());
    http.expectOne('/api/v1/discussions/first/comments').flush({ ...comment, discussionId: 'first' }); await render();
    http.expectOne('/api/v1/discussions/first').flush({ ...discussion, id: 'first', locked: true, commentCount: 1 });
    http.expectOne('/api/v1/discussions/first/comments?page=0&size=20').flush(page([{ ...comment, discussionId: 'first' }])); await render();
    expect(root().querySelector('article')?.querySelector('button')).toBeNull(); expect(root().textContent).toContain('Urejanje zaklenjeno');
    expect(root().querySelector('#comment-body')).not.toBeNull(); expect(item().querySelectorAll('button')).toHaveLength(2);
  });
  it.each(['INTERNAL_ERROR', 'VALIDATION_FAILED', 'ACCESS_DENIED'])('preserves failed create draft for %s without a fake comment', async code => {
    await loaded([]); fill(root(), '#comment-body', 'Ohranjen komentar'); send(create());
    http.expectOne(COMMENTS).flush({ ...problem(code, 400), fieldErrors: [{ field: 'body', message: 'Technical detail' }] }, { status: 400, statusText: 'Failure' }); await render();
    expect(root().querySelector<HTMLTextAreaElement>('#comment-body')?.value).toBe('Ohranjen komentar'); expect(create().textContent).toContain(COMMENT_FAILURE);
    expect(list().querySelector('app-comment-item')).toBeNull(); http.expectNone(URL); expect(create().textContent).not.toContain('Technical detail');
    if (code === 'VALIDATION_FAILED') expect(create().textContent).toContain('Vnesi komentar z največ 2.000 znaki.');
  });
  it('edits inline on locked discussions, waits for PATCH and renders server response', async () => {
    await loaded(); await edit(); const editor = item().querySelector('app-comment-form') as HTMLElement;
    expect(document.activeElement?.id).toBe('edit-comment-comment-1');
    expect(editor.querySelector('textarea')?.value).toBe(comment.body); fill(editor, 'textarea', 'Popravljen komentar'); send(editor); send(editor); await render();
    const request = http.expectOne(COMMENT); expect(request.request.method).toBe('PATCH'); expect(request.request.body).toEqual({ body: 'Popravljen komentar' });
    expect(button(editor, 'Shranjevanje …').disabled).toBe(true);
    request.flush({ ...comment, body: 'Odziv strežnika', updatedAt: '2026-09-27T10:00:00Z' }); await render();
    expect(item().textContent).toContain('Odziv strežnika'); expect(item().textContent).toContain('Urejeno'); expect(item().querySelector('textarea')).toBeNull();
    expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Komentar je posodobljen.'); http.expectNone(URL);
  });
  it('validates edit and returns focus on cancellation', async () => {
    await loaded(); await edit(); fill(item(), 'textarea', '  '); send(item()); await render();
    expect(item().textContent).toContain('Vnesi komentar z največ 2.000 znaki.'); http.expectNone(COMMENT);
    button(item(), 'Prekliči').click(); await render(); expect(document.activeElement).toBe(button(item(), 'Uredi'));
  });
  it('preserves edit draft after failure', async () => {
    await loaded(); await edit(); fill(item(), 'textarea', 'Ohranjen popravek'); send(item());
    http.expectOne(COMMENT).error(new ProgressEvent('error')); await render();
    expect(item().querySelector('textarea')?.value).toBe('Ohranjen popravek'); expect(item().textContent).toContain(COMMENT_FAILURE);
  });
  it.each(['cancel', 'escape', 'close'])('closes comment confirmation before restoring focus on %s', async method => {
    await loaded(); await remove(); const dialog = root().querySelector('dialog')!;
    expect(dialog.textContent).toContain('Izbrišem komentar?'); expect(dialog.textContent).toContain('Tvoj komentar bo trajno izbrisan. Tega ni mogoče razveljaviti.');
    expect(document.activeElement).toBe(button(dialog, 'Prekliči'));
    const trigger = button(item(), 'Izbriši'); const nativeFocus = trigger.focus.bind(trigger);
    const focus = vi.spyOn(trigger, 'focus').mockImplementation(options => { expect(dialog.open).toBe(false); nativeFocus(options); });
    const close = vi.spyOn(dialog, 'close');
    if (method === 'cancel') button(dialog, 'Prekliči').click();
    else if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else dialog.querySelector<HTMLButtonElement>('[aria-label="Zapri pogovorno okno"]')!.click();
    await render(); expect(close).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
    expect(document.activeElement).toBe(button(item(), 'Izbriši')); http.expectNone(COMMENT);
  });
  it('waits for deletion, refreshes count and keeps locked=true after the last comment', async () => {
    await loaded(); await remove(); button(root(), 'Izbriši komentar').click(); button(root(), 'Izbriši komentar').click();
    const dialog = root().querySelector('dialog')!; const close = vi.spyOn(dialog, 'close');
    const heading = list().querySelector<HTMLElement>('#comments-heading')!; const nativeFocus = heading.focus.bind(heading);
    const focus = vi.spyOn(heading, 'focus').mockImplementation(options => {
      expect(dialog.open).toBe(false); expect(dialog.isConnected).toBe(false); nativeFocus(options);
    });
    const request = http.expectOne(COMMENT); expect(request.request.method).toBe('DELETE'); expect(item().textContent).toContain(comment.body);
    request.flush(null, { status: 204, statusText: 'No Content' }); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 0 });
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([])); await render();
    expect(root().querySelector('article')?.querySelector('button')).toBeNull(); expect(root().textContent).toContain('Urejanje zaklenjeno');
    expect(list().querySelector('app-comment-item')).toBeNull(); expect(root().querySelector('#comment-body')).not.toBeNull();
    expect(document.activeElement?.id).toBe('comments-heading'); expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Komentar je izbrisan.');
    expect(close).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
  });
  it('moves back from an empty last page after deletion', async () => {
    await loaded([comment], 21); button(list(), 'Naslednja').click(); await render();
    http.expectOne(COMMENTS + '?page=1&size=20').flush(page([comment], 1, 20, 21)); await render();
    await remove(); button(root(), 'Izbriši komentar').click(); http.expectOne(COMMENT).flush(null); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 20 });
    http.expectOne(COMMENTS + '?page=1&size=20').flush(page([], 1, 20, 20)); await render();
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([{ ...comment, id: 'earlier' }], 0, 20, 20)); await render();
    expect(list().textContent).toContain('Stran 1 od 1'); expect(button(list(), 'Prejšnja').disabled).toBe(true);
  });
  it.each(['edit', 'delete'])('stops stale %s for COMMENT_NOT_FOUND', async action => {
    await loaded(); if (action === 'edit') { await edit(); send(item()); } else { await remove(); button(root(), 'Izbriši komentar').click(); }
    http.expectOne(COMMENT).flush(problem('COMMENT_NOT_FOUND', 404), { status: 404, statusText: 'Not Found' }); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true }); http.expectOne(COMMENTS + '?page=0&size=20').flush(page([])); await render();
    expect(list().querySelector('app-comment-item')).toBeNull(); expect(root().querySelector('dialog')).toBeNull();
  });
  it.each(['edit', 'delete'])('removes denied ownership controls after %s and refresh', async action => {
    await loaded(); if (action === 'edit') { await edit(); send(item()); } else { await remove(); button(root(), 'Izbriši komentar').click(); }
    http.expectOne(COMMENT).flush(problem('COMMENT_NOT_OWNED', 403), { status: 403, statusText: 'Forbidden' }); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true }); http.expectOne(COMMENTS + '?page=0&size=20').flush(page([comment])); await render();
    expect(item().querySelector('button')).toBeNull(); expect(item().querySelector('textarea')).toBeNull();
    expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Tega komentarja ne moreš urejati ali izbrisati.');
  });
  it('retains the create draft as read-only after a session-expiry response', async () => {
    await loaded([]); fill(root(), '#comment-body', 'Osnutek ob poteku seje'); send(create());
    http.expectOne(COMMENTS).flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' }); await render();
    const field = root().querySelector<HTMLTextAreaElement>('#comment-body');
    expect(field?.value).toBe('Osnutek ob poteku seje'); expect(field?.readOnly).toBe(true);
    expect(button(create(), 'Objavi komentar').disabled).toBe(true);
    expect(list().textContent).toContain('Za sodelovanje v razpravi se prijavi.');
    send(create()); http.expectNone(COMMENTS);
  });
  it('retains the edit draft without privileged save controls after expiry', async () => {
    await loaded(); await edit(); fill(item(), 'textarea', 'Ohranjen osnutek'); send(item());
    http.expectOne(COMMENT).flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' }); await render();
    expect(item().querySelector('textarea')?.value).toBe('Ohranjen osnutek');
    expect(item().querySelector('textarea')?.readOnly).toBe(true); expect(button(item(), 'Shrani spremembe').disabled).toBe(true);
    send(item()); http.expectNone(COMMENT);
  });

  it('retries the requested comment page after pagination fails', async () => {
    await loaded([comment], 21); button(list(), 'Naslednja').click(); await render();
    http.expectOne(COMMENTS + '?page=1&size=20').error(new ProgressEvent('error')); await render();
    button(list(), 'Poskusi znova').click();
    http.expectOne(COMMENTS + '?page=1&size=20').flush(page([comment], 1, 20, 21)); await render();
    expect(list().textContent).toContain('Stran 2 od 2'); http.expectNone(URL);
  });

  it('keeps an unsaved inline draft and textarea identity through an unrelated publication refresh', async () => {
    const other = { ...comment, id: 'comment-2', body: 'Drugi komentar' };
    await loaded([comment, other]); await edit(); fill(item(), 'textarea', 'Neobjavljen popravek');
    const textarea = item().querySelector('textarea')!; const originalItem = item();
    fill(create(), 'textarea', 'Nov komentar'); send(create());
    textarea.focus(); http.expectOne(COMMENTS).flush({ ...comment, id: 'comment-3' }); await render();
    expect(item()).toBe(originalItem); expect(item().querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('Neobjavljen popravek'); expect(document.activeElement).toBe(textarea);
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 3 });
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([comment, other, { ...comment, id: 'comment-3' }])); await render();
    expect(item()).toBe(originalItem); expect(item().querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('Neobjavljen popravek'); expect(document.activeElement).toBe(textarea);
  });
  it('replaces an older list refresh when the edit completes first', async () => {
    await loaded(); await edit(); fill(item(), 'textarea', 'Potrjen popravek'); send(item());
    const patch = http.expectOne(COMMENT); const originalItem = item();
    fill(create(), 'textarea', 'Drug komentar'); send(create());
    const other = { ...comment, id: 'comment-2' };
    http.expectOne(COMMENTS).flush(other); await render();
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 2 });
    const olderRead = http.expectOne(COMMENTS + '?page=0&size=20');
    const saved = { ...comment, body: 'Potrjen popravek', updatedAt: '2026-09-27T12:00:00Z' };
    patch.flush(saved); await render();
    expect(olderRead.cancelled).toBe(true); expect(item()).toBe(originalItem);
    expect(item().textContent).toContain(saved.body);
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([saved, other])); await render();
    expect(() => olderRead.flush(page([comment, other]))).toThrow(/cancelled/);
    expect(item()).toBe(originalItem); expect(item().textContent).toContain(saved.body); http.expectNone(URL);
  });
  it.each(['success', 'failure'])('keeps a pending edit alive across unrelated deletion and refresh: %s', async outcome => {
    const other = { ...comment, id: 'comment-2', body: 'Drugi komentar' };
    await loaded([comment, other]); await edit(); fill(item(), 'textarea', 'Čakajoči popravek'); send(item());
    const patch = http.expectOne(COMMENT); const originalItem = item(); const textarea = item().querySelector('textarea');
    const second = list().querySelectorAll<HTMLElement>('app-comment-item')[1];
    button(second, 'Izbriši').click(); await render(); button(root(), 'Izbriši komentar').click();
    http.expectOne('/api/v1/comments/comment-2').flush(null, { status: 204, statusText: 'No Content' }); await render();
    expect(patch.cancelled).toBe(false); expect(item()).toBe(originalItem);
    http.expectOne(URL).flush({ ...discussion, locked: true, commentCount: 1 });
    http.expectOne(COMMENTS + '?page=0&size=20').flush(page([comment])); await render();
    expect(patch.cancelled).toBe(false); expect(item().querySelector('textarea')).toBe(textarea);
    expect(button(item(), 'Shranjevanje …').disabled).toBe(true);
    if (outcome === 'success') {
      patch.flush({ ...comment, body: 'Potrjen popravek', updatedAt: '2026-09-27T12:00:00Z' }); await render();
      expect(item().textContent).toContain('Potrjen popravek'); expect(item().querySelector('textarea')).toBeNull();
      expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Komentar je posodobljen.');
    } else {
      patch.error(new ProgressEvent('error')); await render();
      expect(item().querySelector('textarea')?.value).toBe('Čakajoči popravek'); expect(item().textContent).toContain(COMMENT_FAILURE);
    }
    http.expectNone(URL); http.expectNone(COMMENTS + '?page=0&size=20');
  });

});
