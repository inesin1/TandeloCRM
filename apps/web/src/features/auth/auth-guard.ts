import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApi } from './auth-api';

export const authGuard: CanActivateFn = () => {
  const authApi = inject(AuthApi);
  const router = inject(Router);
  return authApi.isAuthenticated() ? true : router.createUrlTree(['/login']);
};