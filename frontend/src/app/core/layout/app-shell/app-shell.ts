import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
@Component({
  selector: 'app-shell', imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <button class="skip button primary" type="button" (click)="skipToContent(main)">Preskoči na vsebino</button>
    <header><div class="container navigation">
      <a class="wordmark" routerLink="/">Country Explorer</a>
      <nav aria-label="Glavna navigacija"><a routerLink="/" routerLinkActive="current"
        [routerLinkActiveOptions]="{ paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' }" ariaCurrentWhenActive="page">Razišči</a></nav>
    </div></header>
    <main #main id="main" class="container" tabindex="-1"><router-outlet /></main>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100dvh; }
    header { border-bottom: 1px solid var(--color-fog); }
    .navigation { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-block: 16px; }
    a { display: inline-flex; min-height: 44px; align-items: center; text-decoration: none; }
    .wordmark { font: 400 24px var(--font-display); color: var(--color-carbon); }
    nav a { padding: 12px; border-radius: 12px; color: var(--color-graphite); }
    nav a:hover { background: var(--color-mist); }
    nav a.current { color: var(--color-carbon); box-shadow: inset 0 -2px var(--color-primary); }
    main { flex: 1; padding-block: 48px 64px; }
    .skip { position: absolute; top: -100px; left: 16px; z-index: 2000; }
    .skip:focus { top: 12px; }
    @media (max-width: 560px) { main { padding-block: 32px 48px; } }
    @media (forced-colors: active) { nav a.current { border-bottom: 2px solid Highlight; } }
  `,
})
export class AppShell {
  protected skipToContent(main: HTMLElement): void {
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start' });
  }
}
