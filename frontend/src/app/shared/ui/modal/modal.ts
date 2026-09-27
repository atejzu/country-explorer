import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Native top layer provides modal keyboard/focus behavior. Caller owns whether it is mounted. */
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dialog aria-labelledby="modal-title" (cancel)="cancel($event)" (close)="close()">
      <header><h2 id="modal-title">{{ title() }}</h2>
        <button type="button" class="button ghost" aria-label="Zapri pogovorno okno" [disabled]="pending()" (click)="close()">×</button>
      </header>
      <ng-content />
    </dialog>`,
  styles: `
    dialog { width:min(560px, calc(100% - 32px)); max-height:calc(100dvh - 32px); overflow:auto; margin:auto; padding:var(--spacing-24); border:1px solid var(--color-fog); border-radius:var(--radius-xl); color:var(--color-carbon); background:var(--color-paper-white); }
    dialog::backdrop { background:#18192566; }
    header { display:flex; align-items:start; gap:var(--spacing-16); margin-bottom:var(--spacing-16); }
    h2 { flex:1; min-width:0; }
    header button { flex-shrink:0; padding-inline:var(--spacing-12); }
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly trigger = input<HTMLElement | null>(null);
  readonly pending = input(false);
  readonly closed = output<void>();
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private closing = false;
  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true });
    });
  }
  protected cancel(event: Event): void { event.preventDefault(); this.close(); }
  close(): void {
    if (this.pending() || this.closing) return;
    this.dismiss();
    const trigger = this.trigger();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    this.closed.emit();
  }
  /** Completion/navigation closes the top layer without restoring a disappearing trigger. */
  dismiss(): void {
    if (this.closing) return;
    this.closing = true;
    this.dialog()?.nativeElement.close();
  }
  ngOnDestroy(): void { this.dismiss(); }
}
