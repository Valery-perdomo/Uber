import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './guards/auth.guard';

export const routes: Routes = [
  // ---------- Públicas ----------
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage) },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage) },

  // ---------- Pasajero ----------
  {
    path: 'client',
    canActivate: [roleGuard('client')],
    children: [
      { path: '', loadComponent: () => import('./pages/client/request/request.page').then(m => m.RequestPage) },
      { path: 'trip', loadComponent: () => import('./pages/client/trip/trip.page').then(m => m.ClientTripPage) },
      { path: 'rate/:id', loadComponent: () => import('./pages/client/rate/rate.page').then(m => m.RatePage) },
      { path: 'history', loadComponent: () => import('./pages/client/history/history.page').then(m => m.HistoryPage) },
    ],
  },

  // ---------- Conductor ----------
  {
    path: 'driver',
    canActivate: [roleGuard('driver')],
    children: [
      { path: '', loadComponent: () => import('./pages/driver/home/driver-home.page').then(m => m.DriverHomePage) },
      { path: 'trip/:id', loadComponent: () => import('./pages/driver/trip/driver-trip.page').then(m => m.DriverTripPage) },
    ],
  },

  // ---------- Mi perfil (cualquier rol con sesión) ----------
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) },

  // ---------- Administrador ----------
  { path: 'admin', canActivate: [roleGuard('admin')], loadComponent: () => import('./pages/admin/admin.page').then(m => m.AdminPage) },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];