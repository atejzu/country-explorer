import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import localeSl from '@angular/common/locales/sl';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth-store';
import { authSessionInterceptor } from './core/auth/auth-session-interceptor';

registerLocaleData(localeSl);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([authSessionInterceptor]),
    ),
    provideAppInitializer(() => inject(AuthStore).initialize()),
    { provide: LOCALE_ID, useValue: 'sl-SI' },
  ],
};
