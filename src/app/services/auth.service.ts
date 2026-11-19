import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, Role, User } from '../core/models';

export type { User, Role } from '../core/models';
export type LoginResponse = AuthResponse;

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'client' | 'driver';
  license_number?: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  capacity?: number;
  color?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  login(login: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/login`, { login, password })
      .pipe(tap(res => this.saveSession(res)));
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/register`, payload)
      .pipe(tap(res => this.saveSession(res)));
  }

  forgotPassword(email: string, new_password: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.api}/auth/forgot-password`, {
      email,
      new_password,
    });
  }

  /** Perfil actualizado del usuario (GET /auth/me) */
  me(): Observable<User> {
    return this.http.get<{ user: User }>(`${this.api}/auth/me`).pipe(
      map(r => r.user),
      tap(user => localStorage.setItem('user', JSON.stringify(user))),
    );
  }

  logout(): Observable<unknown> {
    return this.http
      .post(`${this.api}/auth/logout`, {})
      .pipe(finalize(() => this.clearSession()));
  }

  clearSession(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  get user(): User | null {
    const data = localStorage.getItem('user');
    try {
      return data ? (JSON.parse(data) as User) : null;
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  /** Pantalla principal de cada rol */
  homeFor(role?: Role | null): string {
    if (role === 'driver') return '/driver';
    if (role === 'admin') return '/admin';
    return '/client';
  }

  private saveSession(res: AuthResponse): void {
    localStorage.setItem('token', res.access_token);
    localStorage.setItem('user', JSON.stringify(res.user));
  }
}