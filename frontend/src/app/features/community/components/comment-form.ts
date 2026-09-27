import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { apiProblem } from '../../../core/http/api-problem';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { CommunityApi } from '../community-api';
import { Comment } from '../community.models';
import { COMMENT_ERROR, COMMENT_FAILURE, communityError } from '../community-feedback';
@Component({ selector: 'app-comment-form', imports: [FormField], templateUrl: './comment-form.html', styleUrl: '../community.scss' })
export class CommentForm {
  readonly discussionId = input.required<string>();
  readonly comment = input<Comment | null>(null);
  readonly draftChanged = output<string>();
  readonly saved = output<Comment>();
  readonly unavailable = output<unknown>();
  readonly cancelled = output<void>();
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(CommunityApi);
  private readonly notifications = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');
  protected readonly model = signal({ body: '' });
  protected readonly error = signal('');
  protected readonly canSubmit = computed(() => this.auth.isAuthenticated() && this.auth.mutationsReady()
    && (!this.comment() || this.comment()?.author.id === this.auth.user()?.id));
  protected readonly fields = form(this.model, path => {
    validate(path.body, ({ value }) => !value().trim() || value().trim().length > 2000
      ? { kind: 'length', message: COMMENT_ERROR } : undefined);
  });
  ngOnInit(): void { this.model.set({ body: this.comment()?.body ?? '' }); }
  constructor() {
    afterNextRender(() => { if (this.comment()) this.focus(); });
  }
  focus(): void { this.textarea().nativeElement.focus({ preventScroll: true }); }
  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.fields().submitting() || !this.auth.isAuthenticated() || !this.auth.mutationsReady()
      || (this.comment() && this.comment()?.author.id !== this.auth.user()?.id)) return;
    this.fields.body().markAsTouched();
    if (this.fields().invalid()) { this.focus(); return; }
    const generation = this.auth.sessionGeneration();
    void submit(this.fields, async fields => {
      this.error.set('');
      const comment = this.comment();
      const body = { body: this.model().body.trim() };
      try {
        const result = await firstValueFrom((comment ? this.api.updateComment(comment.id, body)
          : this.api.createComment(this.discussionId(), body)).pipe(takeUntilDestroyed(this.destroyRef)));
        if (this.destroyRef.destroyed || generation !== this.auth.sessionGeneration()) return;
        if (!comment) { this.model.set({ body: '' }); fields().reset(); this.draftChanged.emit(''); }
        this.saved.emit(result);
      } catch (error: unknown) {
        if (this.destroyRef.destroyed) return;
        this.error.set(COMMENT_FAILURE);
        if (generation !== this.auth.sessionGeneration()) return;
        const problem = apiProblem(error);
        if (['COMMENT_NOT_FOUND', 'COMMENT_NOT_OWNED', 'DISCUSSION_NOT_FOUND'].includes(problem?.code ?? '')) {
          this.notifications.show(communityError(error)); this.unavailable.emit(error);
        }
        if (problem?.code === 'VALIDATION_FAILED' && problem.fieldErrors?.some(e => e.field === 'body')) {
          return { fieldTree: fields.body, kind: 'server', message: COMMENT_ERROR };
        }
        if (problem?.code === 'ACCESS_DENIED') this.error.set(`${COMMENT_FAILURE} ${communityError(error)}`);
      }
      return undefined;
    });
  }
}
