import { Component, inject } from '@angular/core';
import { NotificationStore } from '../notification-store';

@Component({
  selector: 'app-notification-region',
  template: `
    <div class="region" role="status" aria-live="polite" aria-atomic="true">
      @if (store.notification(); as notification) {
        <div class="notice" [class.success]="notification.kind === 'success'">
          <div><strong>{{ notification.kind === 'success' ? 'Uspešno' : 'Obvestilo' }}</strong>
            <p>{{ notification.message }}</p></div>
          <button type="button" class="button ghost" (click)="store.dismiss()" aria-label="Zapri obvestilo">×</button>
        </div>
      }
    </div>`,
  styles: `
    .region { position: fixed; bottom: 16px; right: 16px; width: min(440px, calc(100% - 32px)); z-index: 1500; }
    .notice { display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); background: var(--color-linen); box-shadow: var(--shadow-subtle-3); }
    .notice.success { background: var(--color-mint-wash); }
    .notice > div { flex: 1; min-width: 0; }
    button { flex-shrink: 0; }
  `,
})
export class NotificationRegion { protected readonly store = inject(NotificationStore); }
