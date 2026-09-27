import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { safeReturnUrl } from './safe-return-url';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (auth.isChecking()) await auth.initialize();
  return auth.isAuthenticated() || router.createUrlTree(['/login'], {
    queryParams: { returnUrl: safeReturnUrl(state.url) },
  });
};

export const anonymousGuard: CanActivateFn = async route => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (auth.isChecking()) await auth.initialize();
  return auth.isAuthenticated() ? router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl'))) : true;
};
