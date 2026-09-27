import { TestBed } from '@angular/core/testing';
import { NotificationStore } from './notification-store';

describe('NotificationStore', () => {
  afterEach(() => vi.useRealTimers());
  it('dismisses transient feedback after seven seconds', () => {
    vi.useFakeTimers(); const store = TestBed.inject(NotificationStore);
    store.show('Seja je potekla.'); vi.advanceTimersByTime(6999);
    expect(store.notification()?.message).toBe('Seja je potekla.');
    vi.advanceTimersByTime(1); expect(store.notification()).toBeNull();
  });
  it('restarts the duration for replacement feedback and supports manual dismissal', () => {
    vi.useFakeTimers(); const store = TestBed.inject(NotificationStore);
    store.show('Seja je potekla.'); vi.advanceTimersByTime(6000);
    store.show('Povezave s strežnikom ni bilo mogoče vzpostaviti.');
    vi.advanceTimersByTime(1000); expect(store.notification()?.message).toBe('Povezave s strežnikom ni bilo mogoče vzpostaviti.');
    store.dismiss(); expect(store.notification()).toBeNull();
  });
});
