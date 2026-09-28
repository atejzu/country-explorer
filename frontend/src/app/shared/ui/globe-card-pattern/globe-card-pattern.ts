import { Component } from '@angular/core';

@Component({
  selector: 'app-globe-card-pattern',
  host: { 'aria-hidden': 'true' },
  template: `
    <span class="globe tiny"></span>
    <span class="globe small"></span>
    <span class="globe medium"></span>
    <span class="globe tiny"></span>
    <span class="globe small"></span>
    <span class="globe small"></span>
    <span class="globe large"></span>
    <span class="globe accent"></span>
    <span class="globe small"></span>
  `,
  styleUrl: './globe-card-pattern.scss',
})
export class GlobeCardPattern {}
