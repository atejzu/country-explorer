import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map, Subscription } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { apiProblem } from '../../../core/http/api-problem';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { CommunityApi } from '../community-api';
import { communityError, LOCK_MESSAGE, notFound } from '../community-feedback';
import { Discussion } from '../community.models';
import { CommentList } from '../components/comment-list';
import { CommunityTime } from '../components/community-time';
import { DeleteConfirmation } from '../components/delete-confirmation';
import { DiscussionEditor } from '../components/discussion-editor';
@Component({ selector: 'app-discussion-page', imports: [RouterLink, CommentList, CommunityTime, DeleteConfirmation, DiscussionEditor],
  templateUrl: './discussion-page.html', styleUrl: '../community.scss', styles: `
    :host { max-width:800px; margin-inline:auto; }
    .back { display:inline-flex; align-items:center; min-height:44px; margin-bottom:var(--spacing-24); }
    h1 { font-family:var(--font-sans); font-weight:600; margin-top:var(--spacing-24); }
    .prose { margin-top:var(--spacing-32); } .notice { margin-top:var(--spacing-24); }
  ` })
export class DiscussionPage {
  private readonly api = inject(CommunityApi);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private readonly confirmation = viewChild(DeleteConfirmation);
  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(params => params.get('discussionId') ?? ''), distinctUntilChanged()), { initialValue: '' });
  protected readonly discussion = signal<Discussion | null>(null);
  protected readonly loading = signal(true);
  protected readonly missing = signal(false);
  protected readonly error = signal('');
  protected readonly denied = signal(false);
  protected readonly lockConfirmed = signal(false);
  protected readonly editable = computed(() => !!this.discussion() && this.auth.user()?.id === this.discussion()?.author.id
    && !this.discussion()?.locked && !this.lockConfirmed() && !this.denied());
  protected readonly editor = signal<{ discussion: Discussion; trigger: HTMLElement } | null>(null);
  protected readonly deletion = signal<HTMLElement | null>(null);
  protected readonly pending = signal(false);
  protected readonly deleteError = signal('');
  protected readonly lockMessage = LOCK_MESSAGE;
  private request?: Subscription;
  private mutation?: Subscription;
  constructor() {
    effect(() => {
      this.id();
      untracked(() => {
        this.mutation?.unsubscribe(); this.pending.set(false);
        this.discussion.set(null); this.editor.set(null); this.deletion.set(null);
        this.denied.set(false); this.lockConfirmed.set(false); this.load();
      });
    });
  }
  protected load(): void {
    this.request?.unsubscribe(); this.loading.set(true); this.error.set(''); this.missing.set(false);
    const id = this.id();
    this.request = this.api.getDiscussion(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: discussion => {
        if (id !== this.id()) return;
        // This latch belongs only to the current route resource (reset above).
        // Only backend lock observations, including DISCUSSION_LOCKED, can set it.
        if (discussion.locked) this.lockConfirmed.set(true);
        this.discussion.set({ ...discussion, locked: this.lockConfirmed() }); this.loading.set(false);
      },
      error: error => {
        if (id !== this.id()) return;
        this.loading.set(false);
        if (notFound(error) || apiProblem(error)?.code === 'VALIDATION_FAILED') {
          this.discussion.set(null); this.editor.set(null); this.missing.set(true);
        }
        else this.error.set(communityError(error));
      },
    });
  }
  protected edit(trigger: HTMLElement): void {
    const discussion = this.discussion();
    if (discussion && this.editable()) this.editor.set({ discussion, trigger });
  }
  protected edited(discussion: Discussion): void {
    const current = this.discussion();
    if (!current || discussion.id !== this.id() || current.id !== discussion.id) return;
    if (discussion.locked) this.lockConfirmed.set(true);
    // PATCH confirms editable content, but its count/lock snapshot may predate
    // a completed comment mutation. Keep read metadata until a new GET reconciles
    // it, and never replace content already observed with a newer server timestamp.
    // A locked GET necessarily follows any successful pre-lock PATCH commit.
    const content = current.locked || Date.parse(current.updatedAt) > Date.parse(discussion.updatedAt) ? current : discussion;
    this.discussion.set({ ...current, title: content.title, body: content.body,
      updatedAt: content.updatedAt, locked: this.lockConfirmed() });
    this.editor.set(null);
    this.load(); // Cancels any read begun before this PATCH completion.
    this.notifications.show('Razprava je posodobljena.', 'success'); this.focusHeading();
  }
  protected unavailable(error: unknown): void {
    this.confirmation()?.dismiss();
    const code = apiProblem(error)?.code;
    this.deletion.set(null);
    if (code === 'DISCUSSION_LOCKED') this.lockConfirmed.set(true);
    if (code === 'DISCUSSION_NOT_OWNED') { this.denied.set(true); this.editor.set(null); }
    this.notifications.show(communityError(error));
    if (notFound(error)) { this.discussion.set(null); this.editor.set(null); this.missing.set(true); }
    else this.load();
    if (!this.editor()) this.focusHeading();
  }
  protected remove(): void {
    const discussion = this.discussion();
    if (!discussion || !this.editable() || !this.auth.mutationsReady() || this.pending()) return;
    const generation = this.auth.sessionGeneration(); this.pending.set(true); this.deleteError.set('');
    this.mutation = this.api.deleteDiscussion(discussion.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.confirmation()?.dismiss();
        this.pending.set(false); this.deletion.set(null);
        if (generation !== this.auth.sessionGeneration() || this.id() !== discussion.id) return;
        this.notifications.show('Razprava je izbrisana.', 'success');
        void this.router.navigate(['/countries', discussion.countryCode]);
      },
      error: error => {
        this.pending.set(false);
        if (generation !== this.auth.sessionGeneration() || this.id() !== discussion.id) { this.deletion.set(null); return; }
        if (['DISCUSSION_LOCKED', 'DISCUSSION_NOT_OWNED', 'DISCUSSION_NOT_FOUND'].includes(apiProblem(error)?.code ?? '') || notFound(error)) this.unavailable(error);
        else this.deleteError.set(communityError(error));
      },
    });
  }
  private focusHeading(): void {
    afterNextRender(() => this.heading()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }
}
