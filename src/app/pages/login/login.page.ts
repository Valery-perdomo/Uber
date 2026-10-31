import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  IonContent, IonInput, IonButton, IonSpinner, IonText, IonInputPasswordToggle,
  ToastController,
} from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [FormsModule, IonContent, IonInput, IonButton, IonSpinner, IonText, IonInputPasswordToggle],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  login = '';
  password = '';
  loading = false;

  async onLogin() {
    if (!this.login || !this.password) {
      this.showToast('Escribe tu correo o teléfono y tu contraseña', 'warning');
      return;
    }

    this.loading = true;
    this.auth.login(this.login.trim(), this.password).subscribe({
      next: res => {
        this.loading = false;
        this.showToast(`¡Bienvenido, ${res.user.name}!`, 'success');
        this.router.navigateByUrl('/home', { replaceUrl: true });
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.showToast(this.errorMessage(err), 'danger');
      },
    });
  }

  private errorMessage(err: HttpErrorResponse): string {
    if (err.status === 0) return 'No se pudo conectar con el servidor. Revisa tu red.';
    if (err.status === 401) return 'Correo/teléfono o contraseña incorrectos.';
    if (err.status === 403) return 'Tu cuenta está inactiva o suspendida.';
    if (err.status === 422 && err.error?.errors) {
      const first = Object.values(err.error.errors)[0] as string[];
      return first[0];
    }
    return err.error?.message ?? 'Ocurrió un error. Intenta de nuevo.';
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, color, duration: 2500, position: 'top' });
    await toast.present();
  }
}