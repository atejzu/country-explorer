import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../../core/auth/auth-store';
import { apiProblem } from '../../../core/http/api-problem';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { CommunityApi } from '../community-api';
import { communityError } from '../community-feedback';
import { Comment } from '../community.models';
import { CommunityTime } from './community-time';
import { CommentForm } from './comment-form';
import { DeleteConfirmation } from './delete-confirmation';
@Component({ selector: 'app-comment-item', imports: [CommunityTime, CommentForm, DeleteConfirmation], templateUrl: './comment-item.html',
  styleUrl: '../community.scss', styles: `
    article { display:grid; grid-template-columns:40px minmax(0,1fr); gap:var(--spacing-16); }
    .avatar { display:grid; place-items:center; width:40px; height:40px; border-radius:50%; background:var(--color-mist); }
    .prose { margin-top:var(--spacing-16); } .metadata { margin-top:0; }
    @media(max-width:560px) { article { grid-template-columns:minmax(0,1fr); } }
  ` })
export class CommentItem {
  readonly comment = input.required<Comment>();
  readonly ownershipBlocked = input(false);
  readonly updated = output<Comment>();
  readonly deleted = output<void>();
  readonly unavailable = output<unknown>();
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(CommunityApi);
  private readonly notifications = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');
  private readonly confirmation = viewChild(DeleteConfirmation);
  protected readonly denied = signal(false);
  protected readonly owner = computed(() => this.auth.user()?.id === this.comment().author.id && !this.denied() && !this.ownershipBlocked());
  protected readonly editing = signal(false);
  protected readonly deletion = signal<HTMLElement | null>(null);
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected cancelEdit(): void {
    this.editing.set(false);
    afterNextRender(() => this.editButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }
  protected edited(comment: Comment): void { this.updated.emit(comment); this.cancelEdit(); }
  protected failed(error: unknown): void {
    this.confirmation()?.dismiss();
    if (apiProblem(error)?.code === 'COMMENT_NOT_OWNED') this.denied.set(true);
    this.editing.set(false); this.deletion.set(null); this.unavailable.emit(error);
  }
  protected remove(): void {
    if (!this.owner() || !this.auth.mutationsReady() || this.pending()) return;
    const generation = this.auth.sessionGeneration();
    this.pending.set(true); this.error.set('');
    this.api.deleteComment(this.comment().id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.confirmation()?.dismiss();
        this.pending.set(false);
        if (generation !== this.auth.sessionGeneration()) { this.deletion.set(null); return; }
        this.deletion.set(null); this.notifications.show('Komentar je izbrisan.', 'success'); this.deleted.emit();
      },
      error: error => {
        this.pending.set(false);
        if (generation !== this.auth.sessionGeneration()) { this.deletion.set(null); return; }
        this.error.set(communityError(error));
        if (['COMMENT_NOT_OWNED', 'COMMENT_NOT_FOUND'].includes(apiProblem(error)?.code ?? '')) {
          this.notifications.show(communityError(error)); this.failed(error);
        }
      },
    });
  }
}
