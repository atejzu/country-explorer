import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Strani ni bilo mogoče najti.</h1>
    <a routerLink="/">Nazaj na začetno stran</a>
  `,
})
export class NotFoundPage {}
