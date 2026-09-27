import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { apiProblem } from '../../../core/http/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { ProtectedActionIntent } from '../../../core/auth/protected-action-intent';
import { AuthRequiredPrompt } from '../../../shared/ui/auth-required-prompt/auth-required-prompt';
import { CommunityApi } from '../community-api';
import { communityError } from '../community-feedback';
import { Comment, PageResponse } from '../community.models';
import { CommentForm } from './comment-form';
import { CommentItem } from './comment-item';
import { CommunityPagination } from './community-pagination';
@Component({ selector: 'app-comment-list', imports: [CommentForm, CommentItem, CommunityPagination, AuthRequiredPrompt],
  templateUrl: './comment-list.html', styleUrl: '../community.scss', styles: `:host { margin-top:var(--spacing-48); } .stack { margin-top:var(--spacing-24); }` })
export class CommentList {
  readonly discussionId = input.required<string>();
  readonly contextAvailable = input(true);
  readonly commentCount = input<number | null>(null);
  readonly changed = output<void>();
  protected readonly auth = inject(AuthStore);
  protected readonly intent = inject(ProtectedActionIntent);
  private readonly api = inject(CommunityApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly form = viewChild(CommentForm);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  protected readonly draft = signal('');
  protected readonly result = signal<PageResponse<Comment> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly prompt = signal<{ trigger: HTMLElement; returnUrl: string } | null>(null);
  protected readonly deniedIds = signal<ReadonlySet<string>>(new Set());
  private requestedPage = 0;
  private request?: Subscription;
  constructor() {
    effect(() => { this.discussionId(); untracked(() => this.load(0)); });
    effect(() => {
      this.intent.continuation(); this.auth.user();
      const form = this.form(); const id = this.discussionId();
      untracked(() => { if (form && this.intent.consume('comment', id)) {
        afterNextRender(() => form.focus(), { injector: this.injector });
      } });
    });
  }
  protected load(page = this.requestedPage): void {
    this.requestedPage = page;
    this.request?.unsubscribe(); this.loading.set(true); this.error.set('');
    this.request = this.api.getComments(this.discussionId(), page, 20).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        // A concurrent deletion can also leave a requested page beyond the last page.
        if (!result.items.length && page > 0) { this.load(Math.max(0, Math.min(page - 1, result.totalPages - 1))); return; }
        this.result.set(result); this.loading.set(false);
      },
      error: error => { this.error.set(communityError(error)); this.loading.set(false); },
    });
  }
  protected join(trigger: HTMLElement): void {
    this.intent.clear(); this.prompt.set({ trigger, returnUrl: this.router.url });
  }
  protected created(): void { this.changed.emit(); this.load(); }
  protected updated(comment: Comment): void {
    this.result.update(result => result ? { ...result, items: result.items.map(item => item.id === comment.id ? comment : item) } : result);
    // A read already in flight may contain the pre-edit body. Replace only that
    // pending read, keeping the confirmed edit and its keyed item mounted.
    if (this.loading()) this.load();
  }
  private focusHeading(): void {
    afterNextRender(() => {
      if (this.contextAvailable()) this.heading().nativeElement.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  protected deleted(commentId: string): void {
    this.removeConfirmedComment(commentId);
    this.focusHeading();
    this.changed.emit(); this.load();
  }
  private removeConfirmedComment(commentId: string): void {
    this.result.update(result => result ? { ...result, items: result.items.filter(item => item.id !== commentId) } : result);
  }
  protected unavailable(error: unknown, commentId?: string): void {
    if (commentId && apiProblem(error)?.code === 'COMMENT_NOT_FOUND') this.removeConfirmedComment(commentId);
    if (commentId && apiProblem(error)?.code === 'COMMENT_NOT_OWNED') {
      this.deniedIds.update(ids => new Set([...ids, commentId]));
    }
    this.focusHeading();
    this.changed.emit(); this.load();
  }
}
