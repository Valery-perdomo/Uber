import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: 'client' | 'driver' | 'admin';
  status: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  login(login: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.api}/auth/login`, { login, password })
      .pipe(
        tap(res => {
          localStorage.setItem('token', res.access_token);
          localStorage.setItem('user', JSON.stringify(res.user));
        })
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
    return data ? JSON.parse(data) : null;
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }
}