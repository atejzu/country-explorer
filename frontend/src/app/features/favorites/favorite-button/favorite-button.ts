import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';
import { AuthRequiredPrompt } from '../../../shared/ui/auth-required-prompt/auth-required-prompt';
import { CountrySummary } from '../../countries/models/country';
import { FavoritesStore } from '../favorites-store';
import { FavoriteIntent } from '../favorite-intent';

@Component({
  selector: 'app-favorite-button', imports: [AuthRequiredPrompt],
  template: `
    <button #trigger type="button" class="favorite" [class.full]="full()"
      [attr.aria-pressed]="saved()" [attr.aria-label]="label()"
      [attr.aria-disabled]="pending() || auth.isChecking() || auth.logoutPending()"
      (click)="activate(trigger)">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"
        [attr.fill]="saved() ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
      @if (full()) { <span>{{ saved() ? 'Shranjeno' : 'Shrani državo' }}</span> }
    </button>
    @if (prompt(); as context) {
      <app-auth-required-prompt [trigger]="context.trigger" [returnUrl]="context.returnUrl"
        message="Prijavi se ali ustvari račun, da shraniš državo med priljubljene."
        (proceed)="intent.arm(country(), context.returnUrl)" (cancelled)="intent.clear()" (closed)="prompt.set(null)" />
    }`,
  styles: `
    :host { display: inline-block; }
    .favorite { display: inline-flex; align-items: center; justify-content: center; gap: var(--spacing-8); min-width: 44px; min-height: 44px; padding: var(--spacing-8); border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--color-graphite); }
    .favorite:hover { background: var(--color-mist); }
    .favorite[aria-pressed=true] { color: var(--color-primary); }
    .favorite[aria-disabled=true] { cursor: default; }
    .full { min-width: 176px; border-color: var(--color-fog); padding-inline: var(--spacing-16); }
    svg { flex-shrink: 0; }
    @media (forced-colors: active) { .favorite { border-color: ButtonText; } .favorite[aria-pressed=true] { color: Highlight; } }
  `,
})
export class FavoriteButton {
  readonly country = input.required<CountrySummary>();
  readonly full = input(false);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesStore);
  protected readonly intent = inject(FavoriteIntent);
  protected readonly saved = computed(() => this.favorites.isFavorite(this.country().code));
  protected readonly pending = computed(() => this.favorites.isPending(this.country().code));
  protected readonly label = computed(() => `${this.saved() ? 'Odstrani' : 'Dodaj'} ${this.country().name} ${this.saved() ? 'iz priljubljenih' : 'med priljubljene'}`);
  protected readonly prompt = signal<{ trigger: HTMLElement; returnUrl: string } | null>(null);
  protected activate(trigger: HTMLElement): void {
    if (this.pending() || this.auth.isChecking() || this.auth.logoutPending()) return;
    if (!this.auth.isAuthenticated()) {
      this.intent.clear();
      this.prompt.set({ trigger, returnUrl: safeReturnUrl(this.router.url) });
    } else if (this.saved()) this.favorites.remove(this.country());
    else this.favorites.add(this.country());
  }
}
