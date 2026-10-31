import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
} from '@ionic/angular';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  ],
})
export class HomePage {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.user;

  roleLabels: Record<string, string> = {
    client: 'Cliente',
    driver: 'Conductor',
    admin: 'Administrador',
  };

  logout() {
    this.auth.logout().subscribe({
      complete: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
    });
  }
}