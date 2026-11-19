import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBack, lockClosedOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../core/ui.service';
import { apiErrorMessage, fieldErrors } from '../../core/utils';

/** Restablecer contraseña (POST /auth/forgot-password) */
@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['../register/register.page.scss', './forgot-password.page.scss'],
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonIcon, IonSpinner],
})
export class ForgotPasswordPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);

  email = '';
  password = '';
  confirm = '';
  loading = signal(false);
  errors = signal<Record<string, string>>({});

  constructor() {
    addIcons({ arrowBack, lockClosedOutline });
  }

  submit() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) e['email'] = 'Escribe un correo válido.';
    if (this.password.length < 8) e['new_password'] = 'Mínimo 8 caracteres.';
    if (this.password !== this.confirm) e['confirm'] = 'Las contraseñas no coinciden.';
    this.errors.set(e);
    if (Object.keys(e).length) return;

    this.loading.set(true);
    this.auth.forgotPassword(this.email.trim().toLowerCase(), this.password).subscribe({
      next: res => {
        this.loading.set(false);
        this.ui.toast(res.message || 'Contraseña restablecida. Ya puedes iniciar sesión.', 'success', 3500);
        this.router.navigateByUrl('/login', { replaceUrl: true });
      },
      error: err => {
        this.loading.set(false);
        this.errors.set(fieldErrors(err));
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }
}