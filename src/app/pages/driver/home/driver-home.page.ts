import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, } from '@ionic/angular';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { addIcons } from 'ionicons';
import { arrowForward, hourglassOutline, logOutOutline, carSportOutline, alertCircleOutline } from 'ionicons/icons';
import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../services/auth.service';
import { UiService } from '../../../core/ui.service';
import { CopPipe, InitialsPipe, KmPipe } from '../../../core/pipes';
import { RideRequest, Trip, User } from '../../../core/models';
import { apiErrorMessage, num, store } from '../../../core/utils';

export const ACCEPT_SECONDS = 15;

export interface DriverStats {
  date: string;
  earned: number;
  trips: number;
}

export interface DriverTripState {
  trip: Trip;
  request: RideRequest;
  startedAt?: string;
  travelledKm?: number;
}

export function todayStats(): DriverStats {
  const today = new Date().toISOString().slice(0, 10);
  const saved = store.get<DriverStats>('driver_stats');
  return saved && saved.date === today ? saved : { date: today, earned: 0, trips: 0 };
}

/** Mockup 5 · Conductor · Solicitudes (HU-07) */
@Component({
  selector: 'app-driver-home',
  templateUrl: './driver-home.page.html',
  styleUrls: ['./driver-home.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, IonSpinner, CopPipe, InitialsPipe, KmPipe, RouterLink],
})
export class DriverHomePage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);

  user = signal<User | null>(this.auth.user);
  approval = signal<string>(this.auth.user?.driver_profile?.approval_status ?? 'unknown');
  online = signal(this.auth.user?.driver_profile?.availability_status === 'available');
  toggling = signal(false);
  requests = signal<RideRequest[]>([]);
  ignored = signal<number[]>([]);
  countdown = signal(ACCEPT_SECONDS);
  accepting = signal(false);
  stats = signal<DriverStats>(todayStats());
  pendingTrip = signal<DriverTripState | null>(null);

  // "Desliza para aceptar"
  slide = signal(0);
  dragging = signal(false);

  readonly acceptSeconds = ACCEPT_SECONDS;

  shortName = computed(() => {
    const parts = (this.user()?.name ?? '').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || 'Conductor';
  });

  approved = computed(() => this.approval() === 'approved');

  queue = computed(() => this.requests().filter(r => !this.ignored().includes(r.id)));
  current = computed(() => this.queue()[0] ?? null);
  waiting = computed(() => Math.max(0, this.queue().length - 1));

  private poll?: Subscription;
  private ticker?: ReturnType<typeof setInterval>;
  private locationTimer?: ReturnType<typeof setInterval>;
  private trackedId: number | null = null;
  private dragStartX = 0;
  private dragWidth = 1;

  constructor() {
    addIcons({ arrowForward, hourglassOutline, logOutOutline, carSportOutline, alertCircleOutline });
  }

  ionViewWillEnter() {
    this.stats.set(todayStats());
    const saved = store.get<DriverTripState>('driver_trip');
    this.pendingTrip.set(saved && saved.trip?.status !== 'completed' ? saved : null);

    this.auth.me().subscribe({
      next: user => {
        this.user.set(user);
        if (user.driver_profile) {
          this.approval.set(user.driver_profile.approval_status);
          this.online.set(user.driver_profile.availability_status === 'available');
        }
        this.afterProfile();
      },
      error: () => this.afterProfile(),
    });
  }

  ionViewWillLeave() {
    this.stop();
  }

  ngOnDestroy() {
    this.stop();
  }

  /** Revisa si puede recibir solicitudes (la API responde 403 si no está aprobado) */
  private afterProfile() {
    this.api.rideRequests().subscribe({
      next: list => {
        this.approval.set('approved');
        this.requests.set(list);
        if (this.online()) this.startPolling();
      },
      error: err => {
        if (err?.status === 403) {
          if (this.approval() === 'approved' || this.approval() === 'unknown') this.approval.set('pending');
          this.online.set(false);
        }
      },
    });
  }

  // ---------- Disponibilidad ----------
  toggleOnline() {
    if (!this.approved()) {
      this.ui.toast('Tu cuenta aún no está aprobada por un administrador.', 'warning');
      return;
    }
    const next = this.online() ? 'unavailable' : 'available';
    this.toggling.set(true);
    this.api.setAvailability(next).subscribe({
      next: res => {
        this.toggling.set(false);
        const isOnline = (res?.availability_status ?? next) === 'available';
        this.online.set(isOnline);
        if (isOnline) {
          this.ui.toast('Estás en línea. Te avisaremos de nuevas solicitudes.', 'success');
          this.startPolling();
        } else {
          this.stop();
          this.requests.set([]);
        }
      },
      error: err => {
        this.toggling.set(false);
        if (err?.status === 403) this.approval.set(err?.error?.approval_status ?? 'pending');
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  private startPolling() {
    this.stop();
    this.poll = timer(0, 5000)
      .pipe(switchMap(() => this.api.rideRequests().pipe(catchError(() => of(null)))))
      .subscribe(list => {
        if (list) this.requests.set(list);
      });
    this.ticker = setInterval(() => this.tick(), 1000);
    this.sendLocation();
    this.locationTimer = setInterval(() => this.sendLocation(), 30000);
  }

  private stop() {
    this.poll?.unsubscribe();
    this.poll = undefined;
    clearInterval(this.ticker);
    clearInterval(this.locationTimer);
  }

  private sendLocation() {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.api
          .sendLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
          })
          .subscribe({ error: () => undefined });
      },
      () => undefined,
      { timeout: 8000, maximumAge: 20000 },
    );
  }

  /** Contador de 15 s: si se acaba, la solicitud se descarta */
  private tick() {
    const cur = this.current();
    if (!cur) {
      this.trackedId = null;
      return;
    }
    if (cur.id !== this.trackedId) {
      this.trackedId = cur.id;
      this.countdown.set(ACCEPT_SECONDS);
      return;
    }
    if (this.accepting() || this.dragging()) return;
    const next = this.countdown() - 1;
    if (next <= 0) {
      this.ignore(cur);
      return;
    }
    this.countdown.set(next);
  }

  ignore(req: RideRequest) {
    this.ignored.update(list => [...list, req.id]);
    this.slide.set(0);
  }

  // ---------- Deslizar para aceptar ----------
  onDragStart(event: PointerEvent) {
    if (this.accepting()) return;
    const track = (event.currentTarget as HTMLElement).parentElement as HTMLElement;
    this.dragWidth = Math.max(1, track.clientWidth - 60);
    this.dragStartX = event.clientX - this.slide() * this.dragWidth;
    this.dragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onDragMove(event: PointerEvent) {
    if (!this.dragging()) return;
    const progress = (event.clientX - this.dragStartX) / this.dragWidth;
    this.slide.set(Math.min(1, Math.max(0, progress)));
  }

  onDragEnd() {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (this.slide() > 0.85) {
      this.slide.set(1);
      this.accept();
    } else {
      this.slide.set(0);
    }
  }

  accept() {
    const req = this.current();
    if (!req || this.accepting()) return;
    this.accepting.set(true);
    this.api.acceptRequest(req.id).subscribe({
      next: trip => {
        this.accepting.set(false);
        this.slide.set(0);
        this.stop();
        const state: DriverTripState = { trip: { ...trip, status: trip.status ?? 'assigned' }, request: req };
        store.set('driver_trip', state);
        this.ui.toast('¡Servicio aceptado! Ve por tu pasajero.', 'success');
        this.router.navigateByUrl(`/driver/trip/${trip.id}`);
      },
      error: err => {
        this.accepting.set(false);
        this.slide.set(0);
        if (err?.status === 409) {
          this.ui.toast('Otro conductor tomó este servicio primero.', 'warning');
          this.ignore(req);
        } else {
          this.ui.toast(apiErrorMessage(err), 'danger');
        }
      },
    });
  }

  continueTrip() {
    const t = this.pendingTrip();
    if (t) this.router.navigateByUrl(`/driver/trip/${t.trip.id}`);
  }

  fare(req: RideRequest): number {
    return num(req.estimated_fare);
  }

  async logout() {
    const ok = await this.ui.confirm('Cerrar sesión', '¿Quieres salir de tu cuenta?', 'Salir');
    if (!ok) return;
    this.stop();
    const leave = () => this.router.navigateByUrl('/login', { replaceUrl: true });
    if (this.online()) {
      this.api.setAvailability('unavailable').subscribe({ error: () => undefined });
    }
    this.auth.logout().subscribe({ complete: leave, error: leave });
  }
}