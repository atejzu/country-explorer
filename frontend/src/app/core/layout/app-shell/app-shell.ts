import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth-store';
import { LogoutButton } from '../../auth/logout-button';
import { NotificationRegion } from '../../notifications/notification-region/notification-region';
@Component({
  selector: 'app-shell', imports: [RouterLink, RouterLinkActive, RouterOutlet, LogoutButton, NotificationRegion],
  template: `
    <button class="skip button primary" type="button" (click)="skipToContent(main)">Preskoči na vsebino</button>
    <header><div class="container navigation">
      <a class="wordmark" routerLink="/">Country Explorer</a>
      <nav aria-label="Glavna navigacija"><a class="nav-link" routerLink="/" routerLinkActive="current"
        [routerLinkActiveOptions]="{ paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' }" ariaCurrentWhenActive="page">Razišči</a>
        <a class="nav-link" routerLink="/favorites" routerLinkActive="current" ariaCurrentWhenActive="page">Priljubljene</a>
        @if (auth.isAuthenticated()) {
          <details #accountMenu (keydown.escape)="closeMenu(true)">
            <summary>{{ auth.user()?.username }}</summary>
            <div class="account-menu">
              <a class="nav-link" routerLink="/account" routerLinkActive="current" ariaCurrentWhenActive="page">Račun</a>
              <a class="nav-link" routerLink="/favorites" routerLinkActive="current" ariaCurrentWhenActive="page">Priljubljene</a>
              <app-logout-button />
            </div>
          </details>
        } @else if (!auth.isChecking()) {
          <a class="nav-link" routerLink="/login" routerLinkActive="current" ariaCurrentWhenActive="page">Prijava</a>
        }
      </nav>
    </div></header>
    @if (auth.logoutError()) {
      <div class="container logout-error" role="alert">
        <p>Odjave ni bilo mogoče potrditi. Poskusi znova.</p><app-logout-button />
      </div>
    }
    <main #main id="main" class="container" tabindex="-1"><router-outlet /></main>
    <app-notification-region />
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100dvh; }
    header { border-bottom: 1px solid var(--color-fog); }
    .navigation { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-block: 16px; }
    a { display: inline-flex; min-height: 44px; align-items: center; }
    .wordmark { font: 400 24px var(--font-display); color: var(--color-carbon); }
    .wordmark, nav a { text-decoration: none; }
    nav a { padding: 10px 12px; border-bottom: 1px solid transparent; color: var(--color-graphite); }
    nav a:hover:not(.current) { color: var(--color-carbon); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
    nav a.current { color: var(--color-primary); border-bottom-color: var(--color-primary); }
    nav { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; max-width: 100%; margin-inline-start: auto; }
    details { position: relative; min-width: 0; max-width: 100%; }
    summary { min-height: 44px; padding: 10px 12px; color: var(--color-graphite); cursor: pointer; overflow-wrap: anywhere; }
    summary:hover { color: var(--color-carbon); }
    .account-menu { position: absolute; right: 0; top: calc(100% + 8px); width: 180px; max-width: calc(100vw - 32px); padding: 8px; border: 1px solid var(--color-fog); border-radius: var(--radius-control); background: var(--color-paper-white); box-shadow: var(--shadow-subtle-3); z-index: 1100; }
    .account-menu a { display: flex; }
    .logout-error { padding-top: 16px; }
    main { flex: 1; padding-block: 48px 64px; }
    #main:focus { outline: none; }
    .skip { position: absolute; top: -100px; left: 16px; z-index: 2000; }
    .skip:focus { top: 12px; }
    @media (max-width: 560px) { main { padding-block: 32px 48px; } }
    @media (forced-colors: active) { nav a.current { border-bottom: 2px solid Highlight; } }
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthStore);
  private readonly accountMenu = viewChild<ElementRef<HTMLDetailsElement>>('accountMenu');
  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.closeMenu();
    });
  }
  protected closeMenu(focus = false): void {
    const menu = this.accountMenu()?.nativeElement;
    if (menu) {
      menu.open = false;
      if (focus) menu.querySelector('summary')?.focus();
    }
  }
  protected skipToContent(main: HTMLElement): void {
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start' });
  }
}
