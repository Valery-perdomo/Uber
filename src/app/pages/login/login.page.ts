import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonInput, IonSpinner, IonText, IonInputPasswordToggle, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForward } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../core/ui.service';
import { apiErrorMessage, firstName } from '../../core/utils';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonInput, IonSpinner, IonText, IonInputPasswordToggle, IonIcon],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);

  login = '';
  password = '';
  loading = signal(false);

  constructor() {
    addIcons({ arrowForward });
  }

  onLogin() {
    if (!this.login || !this.password) {
      this.ui.toast('Escribe tu correo o teléfono y tu contraseña', 'warning');
      return;
    }

    this.loading.set(true);
    this.auth.login(this.login.trim(), this.password).subscribe({
      next: res => {
        this.loading.set(false);
        this.password = '';
        this.ui.toast(`¡Hola, ${firstName(res.user.name)}!`, 'success');
        this.router.navigateByUrl(this.auth.homeFor(res.user.role), { replaceUrl: true });
      },
      error: err => {
        this.loading.set(false);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }
}