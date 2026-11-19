import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { addIcons } from 'ionicons';
import { callOutline, close, star, warningOutline } from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { UiService } from '../../../core/ui.service';
import { RealMapComponent } from '../../../shared/real-map.component';
import { CopPipe, InitialsPipe } from '../../../core/pipes';
import { ActiveResponse, ActiveTrip, LatLng, RideRequest } from '../../../core/models';
import { apiErrorMessage, etaMinutes, firstName, haversineKm, num, store } from '../../../core/utils';

/** Mockup 3 · Viaje activo (HU-08 seguimiento, HU-13 cancelar, HU-14 SOS) */
@Component({
  selector: 'app-client-trip',
  templateUrl: './trip.page.html',
  styleUrls: ['./trip.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, IonSpinner, RealMapComponent, CopPipe, InitialsPipe],
})
export class ClientTripPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);

  trip = signal<ActiveTrip | null>(null);
  request = signal<RideRequest | null>(store.get<RideRequest>('ride_request'));
  cancelling = signal(false);
  private poll?: Subscription;

  driverName = computed(() => this.trip()?.driver?.user?.name ?? 'Tu conductor');
  driverFirst = computed(() => firstName(this.driverName()));
  rating = computed(() => num(this.trip()?.driver?.rating_average, 5).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  status = computed(() => this.trip()?.status ?? 'assigned');
  canCancel = computed(() => ['assigned', 'driver_arrived', 'accepted'].includes(this.status()));

  originName = computed(() => this.trip()?.origin_name ?? this.trip()?.request?.origin_name ?? this.request()?.origin_name ?? 'tu punto de recogida');
  destName = computed(() => this.trip()?.destination_name ?? this.trip()?.request?.destination_name ?? this.request()?.destination_name ?? 'tu destino');

  originLL = computed<LatLng | null>(() => {
    const t = this.trip();
    const r = t?.request ?? this.request();
    const lat = t?.origin_latitude ?? r?.origin_latitude;
    const lng = t?.origin_longitude ?? r?.origin_longitude;
    return lat != null && lng != null ? { lat: num(lat), lng: num(lng) } : null;
  });

  destLL = computed<LatLng | null>(() => {
    const t = this.trip();
    const r = t?.request ?? this.request();
    const lat = t?.destination_latitude ?? r?.destination_latitude;
    const lng = t?.destination_longitude ?? r?.destination_longitude;
    return lat != null && lng != null ? { lat: num(lat), lng: num(lng) } : null;
  });

  driverLL = computed<LatLng | null>(() => {
    const loc = this.trip()?.driver?.latest_location;
    return loc ? { lat: num(loc.latitude), lng: num(loc.longitude) } : null;
  });

  /** Minutos estimados: hasta la recogida o, si ya va en camino, hasta el destino */
  eta = computed<number | null>(() => {
    const d = this.driverLL();
    const target = this.status() === 'in_progress' ? this.destLL() : this.originLL();
    if (d && target) return etaMinutes(haversineKm(d, target));
    if (this.status() === 'in_progress') return num(this.request()?.estimated_duration_min, 0) || null;
    return null;
  });

  constructor() {
    addIcons({ callOutline, close, star, warningOutline });
  }

  ionViewWillEnter() {
    this.poll?.unsubscribe();
    this.poll = timer(0, 4000)
      .pipe(switchMap(() => this.api.clientActive().pipe(catchError(() => of(null)))))
      .subscribe(res => this.handle(res));
  }

  ionViewWillLeave() {
    this.poll?.unsubscribe();
  }

  ngOnDestroy() {
    this.poll?.unsubscribe();
  }

  private handle(res: ActiveResponse | null) {
    if (!res) return;
    if (res.has_active && res.type === 'trip' && res.data) {
      this.trip.set(res.data as ActiveTrip);
      this.rememberTrip(res.data as ActiveTrip);
      return;
    }
    if (res.has_active && res.type === 'request') {
      this.router.navigateByUrl('/client', { replaceUrl: true });
      return;
    }
    // Ya no hay viaje activo: terminó (o fue cancelado) -> calificar
    this.poll?.unsubscribe();
    const last = store.get<{ id: number }>('last_trip');
    if (this.trip() && last?.id) {
      this.router.navigateByUrl(`/client/rate/${last.id}`, { replaceUrl: true });
    } else {
      this.router.navigateByUrl('/client', { replaceUrl: true });
    }
  }

  private rememberTrip(t: ActiveTrip) {
    const r = this.request();
    store.set('last_trip', {
      id: t.id,
      driverName: t.driver?.user?.name ?? '',
      plate: t.vehicle?.plate ?? '',
      fare: t.final_fare ?? t.estimated_fare ?? r?.estimated_fare ?? 0,
      km: r?.estimated_distance_km ?? null,
      min: r?.estimated_duration_min ?? null,
    });
  }

  call() {
    const phone = this.trip()?.driver?.user?.phone;
    if (!phone) {
      this.ui.toast('El conductor no tiene un teléfono registrado.', 'warning');
      return;
    }
    window.location.href = `tel:${phone}`;
  }

  /** HU-13: cancelar antes de que empiece el recorrido */
  async cancel() {
    const t = this.trip();
    if (!t) return;
    const ok = await this.ui.confirm(
      '¿Cancelar el viaje?',
      'Tu conductor ya va en camino. Como el recorrido aún no empieza, la cancelación no tiene costo.',
      'Sí, cancelar',
      true,
    );
    if (!ok) return;
    this.cancelling.set(true);
    const reason = 'Cancelado por el pasajero antes de iniciar el recorrido';
    this.api.cancel(t.id, reason).pipe(
      catchError(err => {
        // Si la API espera el id de la solicitud, intentamos con ese
        const requestId = t.request_id ?? this.request()?.id;
        if (err?.status === 404 && requestId && requestId !== t.id) return this.api.cancel(requestId, reason);
        throw err;
      }),
    ).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.poll?.unsubscribe();
        store.remove('ride_request');
        store.remove('last_trip');
        this.ui.toast('Viaje cancelado.', 'success');
        this.router.navigateByUrl('/client', { replaceUrl: true });
      },
      error: err => {
        this.cancelling.set(false);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  /** HU-14: botón de emergencia */
  sos() {
    this.ui.actionSheet('Emergencia', [
      {
        text: 'Llamar a la Línea 123',
        role: 'destructive',
        handler: () => {
          window.location.href = 'tel:123';
        },
      },
      {
        text: 'Compartir mi ubicación',
        handler: () => this.shareLocation(),
      },
    ]);
  }

  private shareLocation() {
    const send = (lat: number, lng: number) => {
      const t = this.trip();
      const text =
        `Estoy en un viaje con ${this.driverName()}` +
        (t?.vehicle?.plate ? ` (placa ${t.vehicle.plate})` : '') +
        `. Mi ubicación: https://maps.google.com/?q=${lat},${lng}`;
      if (navigator.share) {
        navigator.share({ title: 'Mi ubicación', text }).catch(() => undefined);
      } else {
        navigator.clipboard?.writeText(text).then(
          () => this.ui.toast('Mensaje copiado. Pégalo y envíalo a tu contacto de confianza.', 'info', 4000),
          () => this.ui.toast(text, 'info', 8000),
        );
      }
    };
    if (!('geolocation' in navigator)) {
      const o = this.originLL();
      if (o) send(o.lat, o.lng);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => send(pos.coords.latitude, pos.coords.longitude),
      () => {
        const o = this.driverLL() ?? this.originLL();
        if (o) send(o.lat, o.lng);
        else this.ui.toast('No pudimos obtener tu ubicación.', 'danger');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }
}