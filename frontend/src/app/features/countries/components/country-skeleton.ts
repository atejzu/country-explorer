import { Component } from '@angular/core';
@Component({ selector: 'app-country-skeleton', template: `
  <div class="panel skeleton-card" aria-hidden="true">
    <div class="skeleton flag"></div><div class="skeleton title"></div>
    <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
  </div>`, styles: `
  .skeleton-card { min-height: 332px; display: grid; gap: 24px; }
  .title { width: 70%; height: 24px; }
  .flag { width: 48px; height: 32px; }
` })
export class CountrySkeleton {}
