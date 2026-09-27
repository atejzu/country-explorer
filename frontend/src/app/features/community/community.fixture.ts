import { currentUser } from '../../core/auth/auth.fixture';
import { Comment, Discussion, PageResponse } from './community.models';
export const discussion: Discussion = {
  id: 'discussion-1', countryCode: 'SVN', title: 'Obisk Slovenije', body: 'Prva vrstica.\nDruga vrstica <img src=x onerror=alert(1)>',
  author: { id: currentUser.id, username: currentUser.username }, commentCount: 0, locked: false,
  createdAt: '2026-09-26T10:00:00Z', updatedAt: '2026-09-26T10:00:00Z',
};
export const comment: Comment = {
  id: 'comment-1', discussionId: discussion.id, body: 'Obišči Sočo.\nLepa dolina.', author: discussion.author,
  createdAt: discussion.createdAt, updatedAt: discussion.updatedAt,
};
export function page<T>(items: T[], index = 0, size = 20, totalItems = items.length): PageResponse<T> {
  return { items, page: index, size, totalItems, totalPages: Math.ceil(totalItems / size) };
}
let restoreFocus: (() => void) | undefined;
export function mockDialogs(): void {
  // Model native inertness: background focus requests cannot succeed while a
  // connected modal is open. Keep close events asynchronous, as in browsers.
  const focus = HTMLElement.prototype.focus;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')!;
  Object.defineProperty(HTMLElement.prototype, 'focus', { configurable: true, writable: true, value: function(this: HTMLElement, options?: FocusOptions) {
    const modal = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
    if (!modal || modal.contains(this)) focus.call(this, options);
  } });
  restoreFocus = () => Object.defineProperty(HTMLElement.prototype, 'focus', descriptor);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) {
    this.open = true;
    this.querySelector<HTMLElement>('[autofocus], button, a, input, textarea')?.focus();
  } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  } });
}
export function restoreDialogs(): void {
  restoreFocus?.(); restoreFocus = undefined;
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
}
export function fill(root: HTMLElement, selector: string, value: string): void {
  const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  field.value = value; field.dispatchEvent(new Event('input')); field.dispatchEvent(new Event('blur'));
}
export function button(root: HTMLElement, name: string): HTMLButtonElement {
  const result = [...root.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name);
  if (!result) throw new Error(`Missing button ${name}`);
  return result;
}
export function send(root: HTMLElement): void { root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); }
