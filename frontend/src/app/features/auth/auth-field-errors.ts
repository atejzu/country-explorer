import { Component, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

@Component({
  selector: 'app-auth-field-errors',
  template: `@if (field()().touched()) {
    @for (error of field()().errors(); track $index) { <p class="field-error">{{ error.message }}</p> }
  }`,
  host: { 'aria-live': 'polite' },
})
export class AuthFieldErrors { readonly field = input.required<FieldTree<string>>(); }
