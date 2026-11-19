import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, timeout } from 'rxjs';

/**
 * Agrega el token y el header Accept a todas las peticiones,
 * corta las que tardan más de 15 s y, si el token venció (401),
 * cierra la sesión y lleva al login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isAuthCall = /\/auth\/(login|register|forgot-password)$/.test(req.url);

  return next(req.clone({ setHeaders: headers })).pipe(
    timeout(15000),
    catchError(err => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token && !isAuthCall) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.navigateByUrl('/login', { replaceUrl: true });
      }
      return throwError(() => err);
    }),
  );
};