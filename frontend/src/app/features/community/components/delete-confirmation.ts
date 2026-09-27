import { Component, input, output, viewChild } from '@angular/core';
import { Modal } from '../../../shared/ui/modal/modal';
@Component({ selector: 'app-delete-confirmation', imports: [Modal], template: `
  <app-modal #modal [title]="discussionTitle() === null ? 'Izbrišem komentar?' : 'Izbrišem razpravo?'"
    [trigger]="trigger()" [pending]="pending()" (closed)="cancelled.emit()">
    <p>{{ discussionTitle() === null ? 'Tvoj komentar bo trajno izbrisan.' : 'Razprava “' + discussionTitle() + '” bo trajno izbrisana.' }} Tega ni mogoče razveljaviti.</p>
    @if (error()) { <p class="error-box" role="alert">{{ error() }}</p> }
    <div class="actions" [attr.aria-busy]="pending()">
      <button class="button danger" [disabled]="pending()" (click)="confirmed.emit()">{{ pending() ? 'Brisanje …' : (discussionTitle() === null ? 'Izbriši komentar' : 'Izbriši razpravo') }}</button>
      <button autofocus class="button ghost" [disabled]="pending()" (click)="modal.close()">Prekliči</button>
    </div>
  </app-modal>`, styleUrl: '../community.scss' })
export class DeleteConfirmation {
  readonly discussionTitle = input<string | null>(null);
  readonly trigger = input<HTMLElement | null>(null);
  readonly pending = input(false);
  readonly error = input('');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly modal = viewChild.required(Modal);
  dismiss(): void { this.modal().dismiss(); }
}
