import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonSpinner, InfiniteScrollCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBack, chevronForward, receiptOutline, star } from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { UiService } from '../../../core/ui.service';
import { CopPipe, KmPipe, StatusLabelPipe, StatusTonePipe } from '../../../core/pipes';
import { Trip } from '../../../core/models';
import { apiErrorMessage, store } from '../../../core/utils';

/** HU-12 · Historial de viajes (con carga al hacer scroll) */
@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    RouterLink, IonContent, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonSpinner,
    CopPipe, KmPipe, StatusLabelPipe, StatusTonePipe,
  ],
})
export class HistoryPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);

  trips = signal<Trip[]>([]);
  loading = signal(true);
  page = signal(1);
  hasMore = signal(false);
  total = signal(0);
  open = signal<number | null>(null);

  constructor() {
    addIcons({ arrowBack, chevronForward, receiptOutline, star });
  }

  ionViewWillEnter() {
    this.load(1);
  }

  private load(page: number, event?: InfiniteScrollCustomEvent) {
    if (page === 1) this.loading.set(true);
    this.api.clientTrips(page).subscribe({
      next: res => {
        this.trips.update(list => (page === 1 ? res.data : [...list, ...res.data]));
        this.page.set(res.current_page ?? page);
        this.hasMore.set(!!res.next_page_url || (res.current_page ?? page) < (res.last_page ?? 1));
        this.total.set(res.total ?? this.trips().length);
        this.loading.set(false);
        event?.target.complete();
      },
      error: err => {
        this.loading.set(false);
        event?.target.complete();
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  loadMore(event: InfiniteScrollCustomEvent) {
    this.load(this.page() + 1, event);
  }

  toggle(id: number) {
    this.open.update(current => (current === id ? null : id));
  }

  date(t: Trip): string {
    const raw = t.completed_at ?? t.created_at;
    if (!raw) return '';
    return new Date(raw).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  origin(t: Trip): string {
    return t.origin_name ?? t.request?.origin_name ?? t.ride_request?.origin_name ?? 'Punto de recogida';
  }

  destination(t: Trip): string {
    return t.destination_name ?? t.request?.destination_name ?? t.ride_request?.destination_name ?? 'Destino';
  }

  rate(t: Trip) {
    store.set('last_trip', {
      id: t.id,
      driverName: t.driver?.user?.name ?? '',
      plate: t.vehicle?.plate ?? '',
      fare: t.final_fare ?? t.estimated_fare ?? 0,
      km: t.distance_travelled_km ?? null,
      min: t.duration_travelled_min ?? null,
    });
    this.router.navigateByUrl(`/client/rate/${t.id}`);
  }
}