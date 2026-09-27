import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { DiscussionSummary } from '../community.models';
import { CommunityTime } from './community-time';
@Component({ selector: 'app-discussion-card', imports: [RouterLink, CommunityTime],
  template: `<article class="panel">
    @if (showLock()) { <span class="chip" title="Urejanje in brisanje razprave sta zaklenjena. Komentarji ostajajo odprti.">Urejanje zaklenjeno</span> }
    <h3><a [routerLink]="['/discussions', discussion().id]">{{ discussion().title }}</a></h3>
    <div class="metadata"><span>{{ discussion().author.username }}</span>
      <app-community-time [createdAt]="discussion().createdAt" [updatedAt]="discussion().updatedAt" />
      <span>Komentarji: {{ discussion().commentCount }}</span>
    </div>
  </article>`, styleUrl: '../community.scss',
  styles: `h3 { font:600 18px/1.33 var(--font-sans); margin:var(--spacing-12) 0 0; } a { display:inline-flex; align-items:center; min-height:44px; } .panel { padding:var(--spacing-24); }`,
})
export class DiscussionCard {
  readonly discussion = input.required<DiscussionSummary>();
  private readonly auth = inject(AuthStore);
  protected readonly showLock = computed(() => this.discussion().locked && this.auth.user()?.id === this.discussion().author.id);
}
