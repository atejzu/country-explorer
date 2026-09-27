import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly current = signal<{ message: string; kind: 'success' | 'information' } | null>(null);
  readonly notification = this.current.asReadonly();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() { inject(DestroyRef).onDestroy(() => clearTimeout(this.timer)); }

  show(message: string, kind: 'success' | 'information' = 'information'): void {
    clearTimeout(this.timer);
    this.current.set({ message, kind });
    this.timer = setTimeout(() => this.dismiss(), 7000);
  }

  dismiss(): void { clearTimeout(this.timer); this.current.set(null); }
}
