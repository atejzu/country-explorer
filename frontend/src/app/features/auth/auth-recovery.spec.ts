import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../app.config';
import { AuthStore } from '../../core/auth/auth-store';
import { problem } from '../../core/auth/auth.fixture';

describe('Auth startup recovery UI', () => {
  it.each(['/login', '/register'])('blocks %s mutations and restores the form after explicit recovery', async url => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const auth = TestBed.inject(AuthStore); const ready = auth.initialize();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error')); await ready;
    const harness = await RouterTestingHarness.create(url);
    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Prijave trenutno ni mogoče preveriti.');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button')!.click();
    harness.detectChanges(); expect(harness.routeNativeElement?.textContent).toContain('Preverjanje prijave');
    http.expectOne('/api/v1/auth/csrf').flush(null); await Promise.resolve();
    http.expectOne('/api/v1/users/me').flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
    expect(auth.startupError()).toBe(false); http.verify();
  });
  it('keeps public country browsing available after bootstrap failure', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const ready = TestBed.inject(AuthStore).initialize(); const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error')); await ready;
    const harness = await RouterTestingHarness.create('/?region=Europe');
    http.expectOne(r => r.url === '/api/v1/countries').flush([]); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Razišči države'); http.verify();
  });
});
