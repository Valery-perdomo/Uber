import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBack, arrowForward, carSportOutline, personOutline } from 'ionicons/icons';
import { AuthService, RegisterPayload } from '../../services/auth.service';
import { UiService } from '../../core/ui.service';
import { apiErrorMessage, fieldErrors, firstName } from '../../core/utils';

/** HU-01 (registro de pasajero) y HU-02 (registro de conductor) */
@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonIcon, IonSpinner],
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);

  role = signal<'client' | 'driver'>('client');
  loading = signal(false);
  errors = signal<Record<string, string>>({});
  readonly currentYear = new Date().getFullYear();

  form = {
    name: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    license_number: '',
    plate: '',
    brand: '',
    model: '',
    year: '' as string | number,
    capacity: 4 as string | number,
    color: '',
  };

  constructor() {
    addIcons({ arrowBack, arrowForward, carSportOutline, personOutline });
    const role = inject(ActivatedRoute).snapshot.queryParamMap.get('role');
    if (role === 'driver') this.role.set('driver');
  }

  setRole(role: 'client' | 'driver') {
    this.role.set(role);
    this.errors.set({});
  }

  error(field: string): string | undefined {
    return this.errors()[field];
  }

  private validate(): Record<string, string> {
    const f = this.form;
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Escribe tu nombre.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e['email'] = 'Escribe un correo válido.';
    if (!/^\d{7,15}$/.test(f.phone.replace(/\s/g, ''))) e['phone'] = 'Escribe un número de celular válido.';
    if (f.password.length < 8) e['password'] = 'Mínimo 8 caracteres.';
    if (f.password !== f.confirm) e['confirm'] = 'Las contraseñas no coinciden.';
    if (this.role() === 'driver') {
      if (!f.license_number.trim()) e['license_number'] = 'Escribe tu número de licencia.';
      if (!/^[A-Za-z]{3}-?\d{2,3}[A-Za-z]?$/.test(f.plate.trim())) e['plate'] = 'Formato: ABC-123.';
      if (!f.brand.trim()) e['brand'] = 'Escribe la marca.';
      if (!f.model.trim()) e['model'] = 'Escribe el modelo.';
      const year = Number(f.year);
      if (!year || year < 1990 || year > this.currentYear + 1) e['year'] = 'Año no válido.';
      if (!f.color.trim()) e['color'] = 'Escribe el color.';
    }
    return e;
  }

  submit() {
    const errors = this.validate();
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      this.ui.toast('Revisa los campos marcados', 'warning');
      return;
    }

    const f = this.form;
    const payload: RegisterPayload = {
      name: f.name.trim(),
      email: f.email.trim().toLowerCase(),
      phone: f.phone.replace(/\s/g, ''),
      password: f.password,
      role: this.role(),
    };
    if (this.role() === 'driver') {
      Object.assign(payload, {
        license_number: f.license_number.trim(),
        plate: f.plate.trim().toUpperCase(),
        brand: f.brand.trim(),
        model: f.model.trim(),
        year: Number(f.year),
        capacity: Number(f.capacity) || 4,
        color: f.color.trim(),
      });
    }

    this.loading.set(true);
    this.auth.register(payload).subscribe({
      next: res => {
        this.loading.set(false);
        const msg = res.user.role === 'driver'
          ? `¡Listo, ${firstName(res.user.name)}! Tu cuenta quedó en revisión.`
          : `¡Bienvenida/o, ${firstName(res.user.name)}!`;
        this.ui.toast(msg, 'success', 3500);
        this.router.navigateByUrl(this.auth.homeFor(res.user.role), { replaceUrl: true });
      },
      error: err => {
        this.loading.set(false);
        this.errors.set(fieldErrors(err));
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }
}