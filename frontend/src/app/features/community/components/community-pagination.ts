import { Component, input, output } from '@angular/core';
@Component({ selector: 'app-community-pagination', template: `
  @if (totalPages() > 0) {
    <nav [attr.aria-label]="label()" class="actions">
      <button class="button ghost" [disabled]="loading() || page() === 0" (click)="changePage.emit(page() - 1)">Prejšnja</button>
      <span role="status">Stran {{ page() + 1 }} od {{ totalPages() }}</span>
      <button class="button ghost" [disabled]="loading() || page() + 1 >= totalPages()" (click)="changePage.emit(page() + 1)">Naslednja</button>
    </nav>
  }
`, styles: `.actions { display:flex; flex-wrap:wrap; align-items:center; gap:var(--spacing-12); margin-top:var(--spacing-24); }` })
export class CommunityPagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly loading = input(false);
  readonly label = input.required<string>();
  readonly changePage = output<number>();
}
