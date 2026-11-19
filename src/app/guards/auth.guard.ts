import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../core/models';

/** Solo deja pasar si hay sesión iniciada */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/** Solo deja pasar al rol indicado; si no, lo manda a su propia pantalla */
export function roleGuard(role: Role): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
    const userRole = auth.user?.role;
    return userRole === role ? true : router.createUrlTree([auth.homeFor(userRole)]);
  };
}

/** Si ya hay sesión, no muestra login/registro: va directo a su pantalla */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree([auth.homeFor(auth.user?.role)]) : true;
};