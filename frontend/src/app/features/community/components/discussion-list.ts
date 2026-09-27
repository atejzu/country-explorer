import { Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { ProtectedActionIntent } from '../../../core/auth/protected-action-intent';
import { AuthRequiredPrompt } from '../../../shared/ui/auth-required-prompt/auth-required-prompt';
import { CommunityApi } from '../community-api';
import { communityError } from '../community-feedback';
import { Discussion, DiscussionSummary, PageResponse } from '../community.models';
import { DiscussionCard } from './discussion-card';
import { DiscussionEditor } from './discussion-editor';
import { CommunityPagination } from './community-pagination';
@Component({ selector: 'app-discussion-list', imports: [DiscussionCard, DiscussionEditor, CommunityPagination, AuthRequiredPrompt],
  templateUrl: './discussion-list.html', styleUrl: '../community.scss',
  styles: `:host { margin-top:var(--spacing-48); }` })
export class DiscussionList {
  readonly countryCode = input.required<string>();
  readonly countryName = input.required<string>();
  protected readonly auth = inject(AuthStore);
  protected readonly intent = inject(ProtectedActionIntent);
  private readonly api = inject(CommunityApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly result = signal<PageResponse<DiscussionSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly editor = signal<HTMLElement | null>(null);
  protected readonly prompt = signal<{ trigger: HTMLElement; returnUrl: string } | null>(null);
  private readonly createButton = viewChild.required<ElementRef<HTMLButtonElement>>('createButton');
  private requestedPage = 0;
  private request?: Subscription;
  constructor() {
    effect(() => { this.countryCode(); untracked(() => this.load(0)); });
    effect(() => {
      this.intent.continuation(); this.auth.user();
      const button = this.createButton(); const code = this.countryCode();
      untracked(() => { if (this.intent.consume('newDiscussion', code)) this.editor.set(button.nativeElement); });
    });
  }
  protected load(page = this.requestedPage): void {
    this.requestedPage = page;
    this.request?.unsubscribe(); this.loading.set(true); this.error.set('');
    this.request = this.api.getDiscussions(this.countryCode(), page, 10).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (!result.items.length && page > 0 && result.totalPages <= page) {
          this.load(Math.max(0, result.totalPages - 1)); return;
        }
        this.result.set(result); this.loading.set(false);
      },
      error: error => { this.error.set(communityError(error)); this.loading.set(false); },
    });
  }
  protected create(trigger: HTMLElement): void {
    if (this.auth.isChecking() || this.auth.logoutPending()) return;
    if (this.auth.isAuthenticated()) this.editor.set(trigger);
    else { this.intent.clear(); this.prompt.set({ trigger, returnUrl: this.router.url }); }
  }
  protected created(discussion: Discussion): void {
    this.editor.set(null);
    void this.router.navigate(['/discussions', discussion.id]);
  }
}
