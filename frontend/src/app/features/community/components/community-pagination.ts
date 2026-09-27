import { Component, input, output } from '@angular/core';
@Component({ selector: 'app-community-pagination', template: `
  @if (totalPages() > 0) {
    <nav [attr.aria-label]="label()" class="actions">
      <button type="button" class="button ghost page-control" aria-label="Prejšnja stran" [disabled]="loading() || page() === 0" (click)="changePage.emit(page() - 1)"><span aria-hidden="true">‹</span></button>
      <span role="status">Stran {{ page() + 1 }} od {{ totalPages() }}</span>
      <button type="button" class="button ghost page-control" aria-label="Naslednja stran" [disabled]="loading() || page() + 1 >= totalPages()" (click)="changePage.emit(page() + 1)"><span aria-hidden="true">›</span></button>
    </nav>
  }
`, styles: `.actions { display:flex; flex-wrap:wrap; align-items:center; gap:var(--spacing-8); margin-top:var(--spacing-24); } .page-control { width:44px; min-width:44px; padding:0; font-size:24px; line-height:1; }` })
export class CommunityPagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly loading = input(false);
  readonly label = input.required<string>();
  readonly changePage = output<number>();
}
