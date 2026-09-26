import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet],
  template: `
    <header><a routerLink="/">Country Explorer</a></header>
    <main><router-outlet /></main>
  `,
})
export class AppShell {}
