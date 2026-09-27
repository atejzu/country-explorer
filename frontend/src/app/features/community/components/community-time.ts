import { Component, computed, input } from '@angular/core';
const dateFormat = new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium', timeStyle: 'short' });
@Component({ selector: 'app-community-time', template: `
  <time [attr.datetime]="createdAt()">{{ created() }}</time>
  @if (edited()) { <span> · Urejeno <time [attr.datetime]="updatedAt()">{{ updated() }}</time></span> }
` })
export class CommunityTime {
  readonly createdAt = input.required<string>();
  readonly updatedAt = input.required<string>();
  protected readonly edited = computed(() => Date.parse(this.updatedAt()) !== Date.parse(this.createdAt()));
  protected readonly created = computed(() => dateFormat.format(new Date(this.createdAt())));
  protected readonly updated = computed(() => dateFormat.format(new Date(this.updatedAt())));
}
