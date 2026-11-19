import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmark, star, starOutline } from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { UiService } from '../../../core/ui.service';
import { CopPipe, InitialsPipe } from '../../../core/pipes';
import { apiErrorMessage, firstName, num, store } from '../../../core/utils';

interface LastTrip {
  id: number;
  driverName?: string;
  plate?: string;
  fare?: number | string;
  km?: number | string | null;
  min?: number | string | null;
}

/** Mockup 4 · Calificar (HU-11) */
@Component({
  selector: 'app-rate',
  templateUrl: './rate.page.html',
  styleUrls: ['./rate.page.scss'],
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonSpinner, CopPipe, InitialsPipe],
})
export class RatePage {
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);

  readonly tripId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly info: LastTrip | null = (() => {
    const last = store.get<LastTrip>('last_trip');
    return last && last.id === this.tripId ? last : null;
  })();

  readonly tags = ['Puntual', 'Vehículo limpio', 'Buena ruta', 'Amable', 'Buena música', 'Conducción segura'];
  readonly stars = [1, 2, 3, 4, 5];
  readonly labels = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'];

  score = signal(0);
  selected = signal<string[]>([]);
  comment = '';
  incident = signal(false);
  sending = signal(false);
    /** Tarifa definitiva que guardó el backend al finalizar (GET /client/trips) */
  finalFare = signal<number | string | null>(null);

  driverFirst = firstName(this.info?.driverName) || 'tu conductor';
  details = computed(() => {
    const parts: string[] = [];
    if (this.info?.km) parts.push(`${num(this.info.km).toLocaleString('es-CO', { maximumFractionDigits: 2 })} KM`);
    if (this.info?.min) parts.push(`${this.info.min} MIN`);
    if (this.info?.plate) parts.push(this.info.plate);
    parts.push(`VIAJE #${this.tripId}`);
    return parts.join(' · ');
  });

  constructor() {
    addIcons({ checkmark, star, starOutline });
        // Trae la tarifa final real del viaje desde el backend
    this.api.clientTrips(1).subscribe({
      next: page => {
        const t = page.data.find(x => x.id === this.tripId);
        if (t?.final_fare != null) this.finalFare.set(t.final_fare);
      },
      error: () => undefined,
    });
  }

  setScore(n: number) {
    this.score.set(n);
  }

  toggleTag(tag: string) {
    this.selected.update(list => (list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]));
  }

  submit() {
    if (!this.score()) {
      this.ui.toast('Elige de 1 a 5 estrellas', 'warning');
      return;
    }
    const tags = this.selected();
    const text = this.comment.trim();
    const comment = [tags.length ? tags.join(', ') + '.' : '', text].filter(Boolean).join(' ');

    this.sending.set(true);
    this.api.rateTrip(this.tripId, { score: this.score(), comment, has_incident: this.incident() }).subscribe({
      next: () => {
        this.sending.set(false);
        store.remove('last_trip');
        store.remove('ride_request');
        this.ui.toast('¡Gracias por tu calificación!', 'success');
        this.router.navigateByUrl('/client', { replaceUrl: true });
      },
      error: err => {
        this.sending.set(false);
        this.ui.toast(apiErrorMessage(err), 'danger', 4000);
      },
    });
  }

  skip() {
    store.remove('last_trip');
    store.remove('ride_request');
    this.router.navigateByUrl('/client', { replaceUrl: true });
  }
}