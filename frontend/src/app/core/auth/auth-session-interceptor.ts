import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth-store';
import { isAuthenticationRequired } from '../http/api-problem';
import { NotificationStore } from '../notifications/notification-store';

export const authSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);
  const notifications = inject(NotificationStore);
  const generation = auth.isAuthenticated() ? auth.sessionGeneration() : undefined;
  return next(request).pipe(catchError((error: unknown) => {
    if (isAuthenticationRequired(error) && generation !== undefined && auth.isAuthenticated()
      && auth.sessionGeneration() === generation) {
      auth.expireSession();
      notifications.show('Seja je potekla.');
    }
    return throwError(() => error);
  }));
};
