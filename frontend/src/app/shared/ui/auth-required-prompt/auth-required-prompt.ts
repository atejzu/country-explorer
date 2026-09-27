import { afterNextRender, Component, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';

@Component({
  selector: 'app-auth-required-prompt', imports: [RouterLink],
  template: `
    <dialog #dialog aria-labelledby="auth-required-title" aria-describedby="auth-required-body"
      (cancel)="cancel($event)" (close)="close()">
      <header><h2 id="auth-required-title">Za nadaljevanje se prijavi.</h2>
        <button type="button" class="button ghost" aria-label="Zapri pogovorno okno" (click)="close()">×</button></header>
      <p id="auth-required-body" class="muted">{{ message() }} Po prijavi se vrneš na to stran.</p>
      <div class="actions">
        <a #login class="button primary" routerLink="/login" [queryParams]="{ returnUrl: safeUrl() }"
          (click)="accept($event, login)" (keydown)="activateWithSpace($event, login)">Prijava</a>
        <a #register class="button secondary" routerLink="/register" [queryParams]="{ returnUrl: safeUrl() }"
          (click)="accept($event, register)" (keydown)="activateWithSpace($event, register)">Ustvari račun</a>
      </div>
    </dialog>`,
  styles: `
    dialog { width: min(480px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow: auto; margin: auto; padding: var(--spacing-24); color: var(--color-carbon); background: var(--color-paper-white); border: 1px solid var(--color-fog); border-radius: var(--radius-xl); }
    dialog::backdrop { background: #18192566; }
    header { display: flex; align-items: flex-start; gap: var(--spacing-16); margin-bottom: var(--spacing-16); }
    h2 { flex: 1; min-width: 0; }
    header button { flex-shrink: 0; padding-inline: var(--spacing-12); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--spacing-12); margin-top: var(--spacing-24); }
    .secondary { border-color: var(--color-fog); }
    .secondary:hover { background: var(--color-linen); }
  `,
})
export class AuthRequiredPrompt {
  readonly returnUrl = input.required<string>();
  readonly trigger = input.required<HTMLElement>();
  readonly message = input.required<string>();
  readonly proceed = output<void>();
  readonly cancelled = output<void>();
  readonly closed = output<void>();
  private acceptedNavigation = false;
  private closing = false;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected safeUrl(): string { return safeReturnUrl(this.returnUrl()); }
  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.finish(this.acceptedNavigation, false);
    });
  }
  protected cancel(event: Event): void { event.preventDefault(); this.close(); }
  protected accept(event: MouseEvent, link: HTMLAnchorElement): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || !this.currentTab(link)) return;
    this.acceptedNavigation = true;
    this.proceed.emit();
  }
  protected activateWithSpace(event: KeyboardEvent, link: HTMLAnchorElement): void {
    if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !this.currentTab(link)) return;
    event.preventDefault();
    if (!event.repeat) link.click();
  }
  private currentTab(link: HTMLAnchorElement): boolean {
    return (!link.target || link.target === '_self') && !link.hasAttribute('download');
  }
  close(): void { this.finish(false, true); }
  private finish(acceptedNavigation: boolean, restoreFocus: boolean): void {
    // Native close can follow our own close call. Emit cancellation/cleanup only once.
    if (this.closing) return;
    this.closing = true;
    if (!acceptedNavigation) this.cancelled.emit();
    this.dialog().nativeElement.close();
    if (restoreFocus && this.trigger().isConnected) this.trigger().focus({ preventScroll: true });
    this.closed.emit();
  }
}
