import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, catchError, of, timeout } from 'rxjs';
import { addIcons } from 'ionicons';
import { arrowBack, callOutline, checkmarkCircle } from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { UiService } from '../../../core/ui.service';
import { RealMapComponent } from '../../../shared/real-map.component';
import { CopPipe, InitialsPipe, KmPipe } from '../../../core/pipes';
import { LatLng, Trip } from '../../../core/models';
import { apiErrorMessage, firstName, haversineKm, num, store } from '../../../core/utils';
import { DriverTripState, todayStats } from '../home/driver-home.page';

/**
 * En el computador el GPS no se mueve, así que el carro avanza solo por las calles para probar.
 * true = carro simulado (para probar) · false = GPS real del celular
 */
const SIMULATE_GPS = false;

const STEPS = [
  { key: 'assigned', label: 'Asignado' },
  { key: 'driver_arrived', label: 'Llegó' },
  { key: 'in_progress', label: 'En curso' },
  { key: 'completed', label: 'Finalizado' },
];

/** Mockup 6 · Conductor · Viaje en curso (HU-09) */
@Component({
  selector: 'app-driver-trip',
  templateUrl: './driver-trip.page.html',
  styleUrls: ['./driver-trip.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, IonSpinner, RealMapComponent, CopPipe, InitialsPipe, KmPipe],
})
export class DriverTripPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);
  private http = new HttpClient(inject(HttpBackend));

  readonly tripId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly steps = STEPS;

  state = signal<DriverTripState | null>(null);
  busy = signal(false);
  now = signal(Date.now());
  position = signal<LatLng | null>(null);

  private watchId?: number;
  private clock?: ReturnType<typeof setInterval>;
  private lastSent = 0;
  private lastPoint: LatLng | null = null;
  private simTimer?: ReturnType<typeof setInterval>;

  trip = computed(() => this.state()?.trip ?? null);
  request = computed(() => this.state()?.request ?? null);
  status = computed(() => this.trip()?.status ?? 'assigned');
  stepIndex = computed(() => Math.max(0, STEPS.findIndex(s => s.key === this.status())));
  clientName = computed(() => this.request()?.client?.name ?? 'Pasajero');
  clientFirst = computed(() => firstName(this.clientName()));

  originLL = computed<LatLng | null>(() => {
    const r = this.request();
    return r ? { lat: num(r.origin_latitude), lng: num(r.origin_longitude) } : null;
  });
  destLL = computed<LatLng | null>(() => {
    const r = this.request();
    return r ? { lat: num(r.destination_latitude), lng: num(r.destination_longitude) } : null;
  });

  /** Minutos desde que inició el recorrido */
  elapsedMin = computed(() => {
    const started = this.trip()?.started_at ?? this.state()?.startedAt;
    if (!started) return null;
    return Math.max(1, Math.round((this.now() - new Date(started).getTime()) / 60000));
  });

  distanceKm = computed(() => {
    const travelled = this.state()?.travelledKm ?? 0;
    return travelled > 0.05 ? travelled : num(this.request()?.estimated_distance_km);
  });

  constructor() {
    addIcons({ arrowBack, callOutline, checkmarkCircle });
  }

  ionViewWillEnter() {
    const saved = store.get<DriverTripState>('driver_trip');
    if (!saved || saved.trip?.id !== this.tripId) {
      this.ui.toast('No encontramos la información de este viaje.', 'warning');
      this.router.navigateByUrl('/driver', { replaceUrl: true });
      return;
    }
    this.state.set(saved);
    this.clock = setInterval(() => this.now.set(Date.now()), 15000);
    if (SIMULATE_GPS) this.planLeg();
    else this.watchLocation();
  }

  ionViewWillLeave() {
    this.cleanup();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    clearInterval(this.clock);
    clearInterval(this.simTimer);
    if (this.watchId !== undefined) navigator.geolocation?.clearWatch(this.watchId);
    this.watchId = undefined;
  }

   /** GPS real del celular */
  private watchLocation() {
    if (!('geolocation' in navigator)) {
      this.ui.toast('Este dispositivo no tiene GPS disponible.', 'warning');
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onPoint(
        { lat: pos.coords.latitude, lng: pos.coords.longitude },
        pos.coords.heading ?? undefined,
        pos.coords.speed ? pos.coords.speed * 3.6 : undefined,
      ),
      () => this.ui.toast('Activa la ubicación para que el pasajero vea tu carro.', 'warning'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
  

  /** Nueva posición del carro: la muestra, suma los km y la envía al backend cada 4 s */
  private onPoint(point: LatLng, heading?: number, speed?: number) {
    this.position.set(point);
    if (this.status() === 'in_progress' && this.lastPoint) {
      const step = haversineKm(this.lastPoint, point);
      if (step > 0.002 && step < 2) this.patch({ travelledKm: (this.state()?.travelledKm ?? 0) + step });
    }
    this.lastPoint = point;
    if (Date.now() - this.lastSent > 4000) {
      this.lastSent = Date.now();
      this.api
        .sendLocation({ latitude: point.lat, longitude: point.lng, heading, speed, trip_id: this.tripId })
        .subscribe({ error: () => undefined });
    }
  }

  // ---------- Carro simulado (para probar en el computador) ----------
  /** Asignado: va hacia la recogida · En curso: va hacia el destino */
  private planLeg() {
    clearInterval(this.simTimer);
    const o = this.originLL();
    const d = this.destLL();
    const leg = this.status();
    if (!o || !d) return;
    if (leg === 'driver_arrived') {
      this.onPoint(o);
      return;
    }
    if (leg !== 'assigned' && leg !== 'in_progress') return;
    const from = leg === 'assigned' ? this.position() ?? { lat: o.lat + 0.009, lng: o.lng + 0.006 } : o;
    const to = leg === 'assigned' ? o : d;
    this.onPoint(from);
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    this.http
      .get<{ routes?: { geometry: { coordinates: [number, number][] } }[] }>(url)
      .pipe(timeout(8000), catchError(() => of(null)))
      .subscribe(res => {
        const coords = res?.routes?.[0]?.geometry?.coordinates;
        const path = coords?.length ? coords.map(([lng, lat]) => ({ lat, lng })) : [from, to];
        this.drive(path, leg);
      });
  }

  /** Mueve el carro por la ruta, un paso cada segundo */
  private drive(path: LatLng[], leg: string) {
    if (path.length < 2) return;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineKm(path[i - 1], path[i]));
    const total = cum[cum.length - 1];
    const seconds = Math.min(90, Math.max(25, total * 15));
    const t0 = Date.now();
    clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      if (this.status() !== leg) {
        clearInterval(this.simTimer);
        return;
      }
      const k = Math.min(1, (Date.now() - t0) / 1000 / seconds);
      const target = total * k;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < target) i++;
      const f = Math.max(0, Math.min(1, (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
      const a = path[i - 1];
      const b = path[i];
      this.onPoint({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      if (k >= 1) clearInterval(this.simTimer);
    }, 1000);
  }

  private patch(changes: Partial<DriverTripState>) {
    const current = this.state();
    if (!current) return;
    const next = { ...current, ...changes };
    this.state.set(next);
    store.set('driver_trip', next);
  }

  private applyTrip(updated: Trip) {
    const current = this.state();
    if (!current) return;
    this.patch({ trip: { ...current.trip, ...updated } });
  }

  actionLabel = computed(() => {
    switch (this.status()) {
      case 'assigned':
        return 'Llegué al punto de recogida';
      case 'driver_arrived':
        return 'Iniciar viaje';
      case 'in_progress':
        return 'Finalizar viaje';
      default:
        return 'Volver a solicitudes';
    }
  });

  async nextStep() {
    const status = this.status();
    if (status === 'completed') {
      this.router.navigateByUrl('/driver', { replaceUrl: true });
      return;
    }

    let call: Observable<Trip>;
    if (status === 'assigned') {
      call = this.api.arrive(this.tripId);
    } else if (status === 'driver_arrived') {
      call = this.api.start(this.tripId);
    } else {
      const ok = await this.ui.confirm('¿Finalizar el viaje?', `Confirma que ${this.clientFirst()} llegó a su destino.`, 'Finalizar');
      if (!ok) return;
      call = this.api.complete(this.tripId, {
        actual_distance_km: Math.round(this.distanceKm() * 100) / 100 || 0.1,
        actual_duration_min: this.elapsedMin() ?? Math.max(1, num(this.request()?.estimated_duration_min, 1)),
      });
    }

    this.busy.set(true);
    call.subscribe({
      next: trip => {
        this.busy.set(false);
        if (status === 'driver_arrived') this.patch({ startedAt: trip.started_at ?? new Date().toISOString() });
        this.applyTrip(trip);
        if (status === 'assigned') this.ui.toast(`Le avisamos a ${this.clientFirst()} que llegaste.`, 'success');
        if (status === 'driver_arrived') this.ui.toast('¡Buen viaje!', 'success');
        if (trip.status === 'completed' || status === 'in_progress') this.finish(trip);
        else if (SIMULATE_GPS) this.planLeg();
      },
      error: err => {
        this.busy.set(false);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  private finish(trip: Trip) {
    this.applyTrip({ ...trip, status: 'completed' });
    const stats = todayStats();
    stats.earned += num(trip.final_fare ?? this.trip()?.estimated_fare);
    stats.trips += 1;
    store.set('driver_stats', stats);
    store.remove('driver_trip');
    this.cleanup();
  }

  call() {
    const phone = this.request()?.client?.phone;
    if (!phone) {
      this.ui.toast('El pasajero no tiene un teléfono registrado.', 'warning');
      return;
    }
    window.location.href = `tel:${phone}`;
  }
}