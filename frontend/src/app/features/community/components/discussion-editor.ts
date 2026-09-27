import { Component, computed, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { apiProblem } from '../../../core/http/api-problem';
import { Modal } from '../../../shared/ui/modal/modal';
import { CommunityApi } from '../community-api';
import { Discussion } from '../community.models';
import { BODY_ERROR, communityError, LOCK_MESSAGE, TITLE_ERROR } from '../community-feedback';

@Component({ selector: 'app-discussion-editor', imports: [FormField, Modal],
  templateUrl: './discussion-editor.html', styleUrl: '../community.scss' })
export class DiscussionEditor {
  readonly countryCode = input.required<string>();
  readonly countryName = input('');
  readonly discussion = input<Discussion | null>(null);
  readonly trigger = input<HTMLElement | null>(null);
  readonly blocked = input(false);
  readonly saved = output<Discussion>();
  readonly unavailable = output<unknown>();
  readonly closed = output<void>();
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(CommunityApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly modal = viewChild.required(Modal);
  // Snapshot the draft on opening, never overwrite it during a metadata refresh.
  protected readonly model = signal({ title: '', body: '' });
  protected readonly locked = signal(false);
  protected readonly error = signal('');
  protected readonly disabled = computed(() => this.blocked() || this.locked()
    || !this.auth.isAuthenticated() || !this.auth.mutationsReady()
    || (!!this.discussion() && this.auth.user()?.id !== this.discussion()?.author.id));
  protected readonly fields = form(this.model, path => {
    validate(path.title, ({ value }) => value().trim().length < 5 || value().trim().length > 150
      ? { kind: 'length', message: TITLE_ERROR } : undefined);
    validate(path.body, ({ value }) => !value().trim() || value().trim().length > 5000
      ? { kind: 'length', message: BODY_ERROR } : undefined);
  });
  ngOnInit(): void {
    const discussion = this.discussion();
    if (discussion) this.model.set({ title: discussion.title, body: discussion.body });
  }
  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.disabled() || this.fields().submitting()) return;
    this.fields.title().markAsTouched(); this.fields.body().markAsTouched();
    if (this.fields().invalid()) {
      this.element.nativeElement.querySelector<HTMLElement>(this.fields.title().invalid() ? '#discussion-title' : '#discussion-body')?.focus();
      return;
    }
    const generation = this.auth.sessionGeneration();
    void submit(this.fields, async fields => {
      this.error.set('');
      const body = { title: this.model().title.trim(), body: this.model().body.trim() };
      const discussion = this.discussion();
      try {
        const result = await firstValueFrom((discussion
          ? this.api.updateDiscussion(discussion.id, body)
          : this.api.createDiscussion(this.countryCode(), body)).pipe(takeUntilDestroyed(this.destroyRef)));
        if (!this.destroyRef.destroyed && generation === this.auth.sessionGeneration()) {
          this.modal().dismiss(); this.saved.emit(result);
        }
      } catch (error: unknown) {
        if (this.destroyRef.destroyed) return;
        this.error.set(communityError(error));
        if (generation !== this.auth.sessionGeneration()) return;
        const problem = apiProblem(error);
        if (problem?.code === 'DISCUSSION_LOCKED') { this.locked.set(true); this.error.set(LOCK_MESSAGE); }
        if (['DISCUSSION_LOCKED', 'DISCUSSION_NOT_OWNED', 'DISCUSSION_NOT_FOUND'].includes(problem?.code ?? '')) this.unavailable.emit(error);
        if (problem?.code === 'VALIDATION_FAILED') {
          const errors = (problem.fieldErrors ?? []).flatMap(({ field }) => field === 'title' || field === 'body'
            ? [{ fieldTree: fields[field], kind: 'server', message: field === 'title' ? TITLE_ERROR : BODY_ERROR }] : []);
          if (errors.length) return errors;
        }
      }
      return undefined;
    });
  }
}
