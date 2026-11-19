import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBack, logOutOutline, star } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../core/api.service';
import { UiService } from '../../core/ui.service';
import { InitialsPipe, StatusLabelPipe, StatusTonePipe } from '../../core/pipes';
import { User } from '../../core/models';
import { num } from '../../core/utils';

const ROLE_NAMES: Record<string, string> = { client: 'Pasajero', driver: 'Conductor', admin: 'Administrador' };

/** Mi perfil: datos de GET /api/auth/me y cerrar sesión con POST /api/auth/logout */
@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [RouterLink, IonContent, IonIcon, IonSpinner, InitialsPipe, StatusLabelPipe, StatusTonePipe],
})
export class ProfilePage {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);

  user = signal<User | null>(this.auth.user);
  loading = signal(true);
  leaving = signal(false);

  home = computed(() => this.auth.homeFor(this.user()?.role));
  roleName = computed(() => ROLE_NAMES[this.user()?.role ?? ''] ?? '');
  profile = computed(() => this.user()?.driver_profile ?? null);
  vehicle = computed(() => this.profile()?.vehicles?.[0] ?? null);
  rating = computed(() => {
    const r = this.profile()?.rating_average;
    return r == null ? null : num(r).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  constructor() {
    addIcons({ arrowBack, logOutOutline, star });
  }

  ionViewWillEnter() {
    this.loading.set(true);
    this.auth.me().subscribe({
      next: user => {
        this.user.set(user);
        this.loading.set(false);
      },
      error: () => this.loading.set(false), // si falla, mostramos lo guardado al iniciar sesión
    });
  }

  async logout() {
    const ok = await this.ui.confirm('Cerrar sesión', '¿Quieres salir de tu cuenta?', 'Salir');
    if (!ok) return;
    this.leaving.set(true);
    const leave = () => this.router.navigateByUrl('/login', { replaceUrl: true });
    // Si es conductor, primero se desconecta (PUT /driver/availability)
    if (this.user()?.role === 'driver') this.api.setAvailability('unavailable').subscribe({ error: () => undefined });
    this.auth.logout().subscribe({ complete: leave, error: leave });
  }
}