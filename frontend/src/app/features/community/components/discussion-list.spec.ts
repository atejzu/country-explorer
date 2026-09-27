import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from '../../../app.config';
import { initializeTestSession, problem } from '../../../core/auth/auth.fixture';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { button, discussion, fill, mockDialogs, page, restoreDialogs, send } from '../community.fixture';
import { DiscussionList } from './discussion-list';
const URL = '/api/v1/countries/SVN/discussions';
describe('Country discussion section and creation', () => {
  let http: HttpTestingController; let fixture: ComponentFixture<DiscussionList>;
  const root = (): HTMLElement => fixture.nativeElement;
  const render = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); fixture.detectChanges(); await fixture.whenStable(); };
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); await initializeTestSession(); mockDialogs();
    fixture = TestBed.createComponent(DiscussionList); fixture.componentRef.setInput('countryCode', 'SVN'); fixture.componentRef.setInput('countryName', 'Slovenija');
    await render();
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); restoreDialogs(); } });
  async function loaded() { http.expectOne(URL + '?page=0&size=10').flush(page([], 0, 10)); await render(); }
  async function openEditor() {
    await loaded(); await initializeTestSession(true); await render(); button(root(), 'Začni razpravo').click(); await render();
  }
  it('shows a local skeleton, section heading and guest create capability', async () => {
    expect(root().textContent).toContain('Razprave'); expect(root().textContent).toContain('Nalaganje razprav');
    expect(button(root(), 'Začni razpravo').disabled).toBe(false); await loaded();
    expect(root().textContent).toContain('Ta država še nima razprav.'); expect(root().textContent).toContain('Začni prvi pogovor.');
  });
  it('renders cards, locked state, routes and independent pagination', async () => {
    http.expectOne(URL + '?page=0&size=10').flush(page([{ ...discussion, locked: true }], 0, 10, 11)); await render();
    expect(root().querySelector('a')?.getAttribute('href')).toBe('/discussions/discussion-1');
    expect(root().textContent).toContain('Urejanje zaklenjeno'); expect(root().textContent).toContain(discussion.author.username);
    expect(button(root(), 'Prejšnja').disabled).toBe(true); button(root(), 'Naslednja').click(); await render();
    http.expectOne(URL + '?page=1&size=10').flush(page([discussion], 1, 10, 11)); await render();
    expect(root().textContent).toContain('Stran 2 od 2'); expect(button(root(), 'Naslednja').disabled).toBe(true);
    http.expectNone('/api/v1/countries/SVN');
  });
  it('retries only the failed section', async () => {
    http.expectOne(URL + '?page=0&size=10').flush(problem('INTERNAL_ERROR', 500), { status: 500, statusText: 'Error' }); await render();
    expect(root().textContent).toContain('Razprav ni bilo mogoče naložiti.'); button(root(), 'Poskusi znova').click(); await loaded();
    http.expectNone('/api/v1/countries/SVN');
  });
  it('opens the shared guest prompt with the exact purpose, without a POST', async () => {
    await loaded(); button(root(), 'Začni razpravo').click(); await render();
    expect(root().querySelector('dialog')?.textContent).toContain('Prijavi se ali ustvari račun, da začneš razpravo. Po prijavi se vrneš na to stran.');
    http.expectNone(r => r.method === 'POST');
  });
  it.each(['cancel', 'escape', 'close'])('closes the creation dialog before restoring focus on %s', async method => {
    await openEditor(); expect(document.activeElement?.id).toBe('discussion-title');
    const dialog = root().querySelector('dialog')!;
    const trigger = button(root(), 'Začni razpravo'); const nativeFocus = trigger.focus.bind(trigger);
    const focus = vi.spyOn(trigger, 'focus').mockImplementation(options => { expect(dialog.open).toBe(false); nativeFocus(options); });
    const close = vi.spyOn(dialog, 'close');
    if (method === 'cancel') button(dialog, 'Prekliči').click();
    else if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else dialog.querySelector<HTMLButtonElement>('[aria-label="Zapri pogovorno okno"]')!.click();
    await render(); expect(close).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]); expect(document.activeElement).toBe(trigger);
  });
  it.each([['abcd', 'vsebina'], [' '.repeat(6), 'vsebina'], ['a'.repeat(151), 'vsebina'], ['Naslov', '  '], ['Naslov', 'a'.repeat(5001)]])('validates title/body constraints', async (title, body) => {
    await openEditor(); fill(root(), '#discussion-title', title); fill(root(), '#discussion-body', body); send(root()); await render();
    expect(root().querySelector('[aria-invalid="true"]')).not.toBeNull(); expect(root().querySelector('.field-error')).not.toBeNull();
    http.expectNone(r => r.method === 'POST');
  });
  it('waits for 201, prevents duplicate submits and navigates to the server ID', async () => {
    await openEditor(); const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(root(), '#discussion-title', ' Nov naslov '); fill(root(), '#discussion-body', ' Nova vsebina '); send(root()); send(root()); await render();
    const request = http.expectOne(URL); expect(request.request.body).toEqual({ title: 'Nov naslov', body: 'Nova vsebina' });
    expect(navigate).not.toHaveBeenCalled(); expect(button(root(), 'Ustvarjanje razprave …').disabled).toBe(true);
    request.flush(discussion, { status: 201, statusText: 'Created' }); await render();
    expect(navigate).toHaveBeenCalledWith(['/discussions', discussion.id]); expect(root().querySelector('dialog')).toBeNull();
    expect(TestBed.inject(NotificationStore).notification()?.message).toBe('Razprava je ustvarjena.');
  });
  it.each(['VALIDATION_FAILED', 'ACCESS_DENIED', 'COUNTRY_NOT_FOUND', 'COUNTRY_SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'])('preserves drafts and handles %s safely', async code => {
    await openEditor(); fill(root(), '#discussion-title', 'Nov naslov'); fill(root(), '#discussion-body', 'Moja vsebina'); send(root());
    http.expectOne(URL).flush({ ...problem(code, 400), fieldErrors: [{ field: 'title', message: 'Technical text' }, { field: 'body', message: 'Technical text' }] }, { status: 400, statusText: 'Failure' }); await render();
    expect(root().querySelector<HTMLInputElement>('#discussion-title')?.value).toBe('Nov naslov');
    expect(root().querySelector<HTMLTextAreaElement>('#discussion-body')?.value).toBe('Moja vsebina'); expect(root().textContent).not.toContain('Technical text');
    if (code === 'VALIDATION_FAILED') { expect(root().textContent).toContain('Uporabi 5–150 znakov.'); expect(root().textContent).toContain('Vnesi vsebino z največ 5.000 znaki.'); }
  });
  it('retries the requested discussion page after pagination fails', async () => {
    http.expectOne(URL + '?page=0&size=10').flush(page([discussion], 0, 10, 11)); await render();
    button(root(), 'Naslednja').click(); await render();
    http.expectOne(URL + '?page=1&size=10').error(new ProgressEvent('error')); await render();
    button(root(), 'Poskusi znova').click();
    http.expectOne(URL + '?page=1&size=10').flush(page([discussion], 1, 10, 11)); await render();
    expect(root().textContent).toContain('Stran 2 od 2');
  });

  it('refetches the last valid discussion page exactly once after concurrent deletion', async () => {
    http.expectOne(URL + '?page=0&size=10').flush(page([discussion], 0, 10, 11)); await render();
    button(root(), 'Naslednja').click(); await render();
    http.expectOne(URL + '?page=1&size=10').flush(page([], 1, 10, 10)); await render();
    expect(root().textContent).not.toContain('Ta država še nima razprav.');
    http.expectOne(URL + '?page=0&size=10').flush(page([discussion], 0, 10, 10)); await render();
    expect(root().textContent).toContain(discussion.title); expect(root().textContent).toContain('Stran 1 od 1');
    expect(button(root(), 'Prejšnja').disabled).toBe(true); expect(button(root(), 'Naslednja').disabled).toBe(true);
    http.expectNone(r => r.url === URL);
  });

});
