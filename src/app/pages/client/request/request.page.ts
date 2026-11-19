import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  carSportOutline, locateOutline, logOutOutline, receiptOutline, searchOutline, close, navigateOutline, mapOutline,
} from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../services/auth.service';
import { UiService } from '../../../core/ui.service';
import { PlacesService } from '../../../core/places.service';
import { RealMapComponent } from '../../../shared/real-map.component';
import { CopPipe, InitialsPipe, KmPipe } from '../../../core/pipes';
import { ActiveResponse, Estimate, LatLng, Place, RideRequest } from '../../../core/models';
import { PLACES, apiErrorMessage, firstName, formatKm, haversineKm, inHuila, num, store } from '../../../core/utils';

const DEFAULT_PICKUP = PLACES[0];
const SEARCH_LIMIT_SECONDS = 120;

/** Mockup 2 · Pedir viaje (HU-04, HU-05, HU-06) */
@Component({
  selector: 'app-request',
  templateUrl: './request.page.html',
  styleUrls: ['./request.page.scss'],
  standalone: true,
  imports: [RouterLink, IonContent, IonIcon, IonSpinner, RealMapComponent, CopPipe, InitialsPipe, KmPipe],
})
export class RequestPage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);
  private places = inject(PlacesService);

  readonly user = this.auth.user;
  readonly first = firstName(this.user?.name) || 'viajero';
  readonly searchLimit = SEARCH_LIMIT_SECONDS;

  // Planear el viaje
  pickup = signal<Place | null>(DEFAULT_PICKUP);
  destination = signal<Place | null>(null);
  editing = signal<'pickup' | 'destination' | null>(null);
  query = signal('');
  remote = signal<Place[]>([]);
  searching = signal(false);
  locating = signal(false);
  estimate = signal<Estimate | null>(null);
  estimating = signal(false);
  estimateError = signal(false);
  requesting = signal(false);

  // Elegir un punto moviendo el mapa
  mapPick = signal<'pickup' | 'destination' | null>(null);
  pickCenter = signal<LatLng | null>(null);
  pickPlace = signal<Place | null>(null);
  pickLoading = signal(false);

  // Buscando conductor
  phase = signal<'loading' | 'plan' | 'searching'>('loading');
  request = signal<RideRequest | null>(null);
  elapsed = signal(0);
  cancelling = signal(false);

  private poll?: Subscription;
  private clock?: ReturnType<typeof setInterval>;
  private askedLocation = false;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private pickTimer?: ReturnType<typeof setTimeout>;

  pickupLL = computed<LatLng | null>(() => this.pickup());
  destLL = computed<LatLng | null>(() => this.destination());

  suggestions = computed(() => {
    const q = normalize(this.query());
    const which = this.editing();
    const ref = which === 'destination' ? this.pickup() : null;
    const other = which === 'destination' ? this.pickup() : this.destination();
    // Con 3 letras o más se usan los resultados de OpenStreetMap
    if (q.length >= 3 && this.remote().length) {
      return this.remote()
        .filter(p => p.name !== other?.name)
        .map(p => ({ place: p, km: ref ? haversineKm(ref, p) : null }))
        .slice(0, 8);
    }
    if (q.length >= 3) return [];
    return PLACES.filter(p => p.name !== other?.name)
      .filter(p => !q || normalize(`${p.name} ${p.address} ${p.city}`).includes(q))
      .map(p => ({ place: p, km: ref ? haversineKm(ref, p) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
      .slice(0, 8);
  });

  elapsedLabel = computed(() => {
    const s = this.elapsed();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  constructor() {
    addIcons({ carSportOutline, locateOutline, logOutOutline, receiptOutline, searchOutline, close, navigateOutline, mapOutline });
  }

  ionViewWillEnter() {
    this.checkActive();
  }

  ionViewWillLeave() {
    this.stopSearching();
  }

  ngOnDestroy() {
    this.stopSearching();
  }

  /** Si ya hay una solicitud o un viaje en curso, continúa donde iba */
  private checkActive() {
    this.api.clientActive().subscribe({
      next: res => this.handleActive(res, true),
      error: () => {
        this.phase.set('plan');
        this.askLocationOnce();
      },
    });
  }

  private handleActive(res: ActiveResponse | null, first = false) {
    if (!res) return;
    if (res.has_active && res.type === 'trip') {
      this.stopSearching();
      this.router.navigateByUrl('/client/trip', { replaceUrl: true });
      return;
    }
    if (res.has_active && res.type === 'request' && res.data) {
      const req = res.data as unknown as RideRequest;
      this.request.set(req);
      store.set('ride_request', req);
      if (this.phase() !== 'searching') this.startSearching(req);
      return;
    }
    // No hay nada activo
    if (this.phase() === 'searching' && !first) {
      this.ui.toast('Tu solicitud ya no está activa.', 'warning');
    }
    this.stopSearching();
    this.phase.set('plan');
    this.askLocationOnce();
  }

  // ---------- Ubicación (HU-04) ----------
  private askLocationOnce() {
    if (this.askedLocation) return;
    this.askedLocation = true;
    this.locate(true);
  }

  locate(silent = false) {
    if (!('geolocation' in navigator)) {
      if (!silent) this.ui.toast('Tu dispositivo no permite obtener la ubicación.', 'warning');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.locating.set(false);
                const { latitude, longitude } = pos.coords;
        if (!inHuila({ lat: latitude, lng: longitude })) {
          this.ui.toast('Estás fuera del Huila. Elige un punto de recogida dentro del departamento.', 'warning', 4000);
          return;
        }
        this.pickup.set({
          name: 'Mi ubicación actual',
          address: 'Buscando dirección…',
          lat: latitude,
          lng: longitude,
        });
        this.refreshEstimate();
        // Convierte las coordenadas en una dirección real
        this.places.reverse({ lat: latitude, lng: longitude }).subscribe(found => {
          const current = this.pickup();
                    if (current?.name !== 'Mi ubicación actual') return;
          // El rectángulo del Huila toca un poco de Cauca, Caquetá y Tolima: confirmamos con el departamento real
          if (found?.state && !inHuila({ lat: latitude, lng: longitude, state: found.state })) {
            this.pickup.set(DEFAULT_PICKUP);
            this.refreshEstimate();
            this.ui.toast('Estás fuera del Huila. Elige un punto de recogida dentro del departamento.', 'warning', 4000);
            return;
          }
          const address = found ? [found.name, found.address].filter(a => a && a !== 'Huila').join(', ') : '';
          this.pickup.set({ ...current, address: address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
        });
      },
      () => {
        this.locating.set(false);
        if (!silent) this.ui.toast('No pudimos obtener tu ubicación. Elige el punto de recogida de la lista.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  // ---------- Elegir recogida / destino (HU-05) ----------
  edit(which: 'pickup' | 'destination') {
    this.editing.set(which);
    this.query.set('');
    this.remote.set([]);
  }

  /** Espera a que la persona deje de escribir y busca en OpenStreetMap */
  onQuery(event: Event) {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    clearTimeout(this.searchTimer);
    if (text.trim().length < 3) {
      this.remote.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(() => {
      this.places.search(text.trim(), this.pickup()).subscribe(list => {
        if (this.query() !== text) return;
        this.remote.set(list);
        this.searching.set(false);
      });
    }, 400);
  }

  choose(place: Place) {
    if (!inHuila(place)) {
      this.ui.toast('Ese punto está fuera del Huila. Solo hacemos viajes dentro del departamento.', 'warning');
      return;
    }
    if (this.editing() === 'pickup') this.pickup.set(place);
    else this.destination.set(place);
    this.editing.set(null);
    this.refreshEstimate();
  }

  // ---------- Elegir en el mapa ----------
  startPick(which: 'pickup' | 'destination') {
    this.editing.set(null);
    this.pickPlace.set(null);
    this.pickCenter.set(null);
    this.mapPick.set(which);
  }

  /** El mapa avisa dónde quedó el pin; buscamos la dirección de ese punto */
  onMapMove(point: LatLng) {
    if (!this.mapPick()) return;
    this.pickCenter.set(point);
    this.pickPlace.set(null);
    this.pickLoading.set(true);
    clearTimeout(this.pickTimer);
    this.pickTimer = setTimeout(() => {
      this.places.reverse(point).subscribe(found => {
        if (this.pickCenter() !== point) return;
        this.pickLoading.set(false);
        this.pickPlace.set({
          name: found?.name ?? 'Punto en el mapa',
                    address: found?.address && found.address !== found.name ? found.address : 'Huila',
          city: found?.city,
          state: found?.state,
          lat: point.lat,
          lng: point.lng,
        });
      });
    }, 500);
  }

  confirmPick() {
    const which = this.mapPick();
    const point = this.pickCenter();
    if (!which || !point) return;
    const place: Place = this.pickPlace() ?? {
      name: 'Punto en el mapa',
    address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      lat: point.lat,
      lng: point.lng,
    };
    if (!inHuila(place)) {
      this.ui.toast('Ese punto está fuera del Huila. Solo hacemos viajes dentro del departamento.', 'warning');
      return;
    }
    if (which === 'pickup') this.pickup.set(place);
    else this.destination.set(place);
    this.mapPick.set(null);
    this.refreshEstimate();
  }

  cancelPick() {
    clearTimeout(this.pickTimer);
    this.mapPick.set(null);
  }

  /** Texto que se guarda como origen/destino en la API */
  private placeLabel(p: Place): string {
    if (p.name === 'Mi ubicación actual') return p.address && !p.address.startsWith('Buscando') ? p.address : p.name;
    return p.address && p.address !== 'Huila' ? `${p.name}, ${p.address}` : `${p.name}, ${p.city ?? 'Huila'}`;
  }

  distanceLabel(km: number | null): string {
    return km === null ? '' : formatKm(km);
  }

  refreshEstimate() {
    const o = this.pickup();
    const d = this.destination();
    this.estimate.set(null);
    this.estimateError.set(false);
    if (!o || !d) return;
    this.estimating.set(true);
    this.api.estimate(o, d).subscribe({
      next: e => {
        this.estimating.set(false);
        this.estimate.set(e);
      },
      error: err => {
        this.estimating.set(false);
        this.estimateError.set(true);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  surge(e: Estimate): string {
    return '×' + num(e.fare_breakdown?.surge_multiplier, 1).toLocaleString('es-CO', { minimumFractionDigits: 1 });
  }

  // ---------- Solicitar (HU-06) ----------
  confirm() {
    const o = this.pickup();
    const d = this.destination();
    if (!o || !d) return;
    this.requesting.set(true);
    this.api
      .createRideRequest({
        origin_name: this.placeLabel(o),
        origin_latitude: o.lat,
        origin_longitude: o.lng,
        destination_name: this.placeLabel(d),
        destination_latitude: d.lat,
        destination_longitude: d.lng,
      })
      .subscribe({
        next: req => {
          this.requesting.set(false);
          store.set('ride_request', req);
          this.request.set(req);
          this.startSearching(req);
        },
        error: err => {
          this.requesting.set(false);
          if (err?.status === 400 && err?.error?.active_request_id) {
            this.ui.toast('Ya tienes una solicitud activa. Te mostramos su estado.', 'info');
            this.checkActive();
            return;
          }
          this.ui.toast(apiErrorMessage(err), 'danger');
        },
      });
  }

  private startSearching(req: RideRequest) {
    this.phase.set('searching');
    this.pickup.set({
      name: req.origin_name,
      address: '',
      lat: num(req.origin_latitude),
      lng: num(req.origin_longitude),
    });
    this.destination.set({
      name: req.destination_name,
      address: '',
      lat: num(req.destination_latitude),
      lng: num(req.destination_longitude),
    });

    const created = req.created_at ? new Date(req.created_at).getTime() : Date.now();
    const update = () => this.elapsed.set(Math.max(0, Math.floor((Date.now() - created) / 1000)));
    update();
    clearInterval(this.clock);
    this.clock = setInterval(update, 1000);

    this.poll?.unsubscribe();
    this.poll = timer(4000, 4000)
      .pipe(switchMap(() => this.api.clientActive().pipe(catchError(() => of(null)))))
      .subscribe(res => this.handleActive(res));
  }

  private stopSearching() {
    this.poll?.unsubscribe();
    this.poll = undefined;
    clearInterval(this.clock);
  }

  async cancelSearch() {
    const req = this.request();
    if (!req) return;
    const ok = await this.ui.confirm(
      '¿Cancelar la solicitud?',
      'Todavía ningún conductor la ha aceptado, así que no se cobra ninguna tarifa.',
      'Sí, cancelar',
      true,
    );
    if (!ok) return;
    this.cancelling.set(true);
    this.api.cancel(req.id, 'Cancelado por el pasajero antes de asignar conductor').subscribe({
      next: () => {
        this.cancelling.set(false);
        this.stopSearching();
        store.remove('ride_request');
        this.request.set(null);
        this.estimate.set(null);
        this.destination.set(null);
        this.phase.set('plan');
        this.ui.toast('Solicitud cancelada.', 'success');
      },
      error: err => {
        this.cancelling.set(false);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  async logout() {
    const ok = await this.ui.confirm('Cerrar sesión', '¿Quieres salir de tu cuenta?', 'Salir');
    if (!ok) return;
    this.stopSearching();
    this.auth.logout().subscribe({
      complete: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
    });
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}