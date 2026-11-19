import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input,
  output, signal, untracked,
} from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, remove } from 'ionicons/icons';
import { LatLng } from '../core/models';
import { haversineKm } from '../core/utils';

const TILE = 256;
const MIN_ZOOM = 8; // 8 = se alcanza a ver todo el Huila
const MAX_ZOOM = 19;
const NEIVA: LatLng = { lat: 2.9273, lng: -75.2819 };

interface Px {
  x: number;
  y: number;
}

/** Coordenadas -> píxeles del mapa mundial (proyección Web Mercator, la misma de Google Maps) */
function project(p: LatLng, z: number): Px {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Píxeles del mapa mundial -> coordenadas */
function unproject(px: Px, z: number): LatLng {
  const scale = TILE * 2 ** z;
  const lng = (px.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * px.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

/**
 * Mapa real con calles (OpenStreetMap).
 * - Se arrastra con el dedo o el mouse y tiene zoom (+ / −, rueda del mouse o dos dedos).
 * - Dibuja la ruta por las calles (OSRM), la recogida, el destino y el carro.
 * - En modo "elegir" muestra un pin fijo en el centro y avisa dónde quedó (centerChange).
 */
@Component({
  selector: 'app-real-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div
      class="viewport"
      [class.dragging]="dragging()"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
      (wheel)="onWheel($event)"
      (dblclick)="zoomBy(1)"
      role="application"
      aria-label="Mapa de Neiva. Arrastra para moverlo."
    >
      @for (t of tiles(); track t.key) {
        <img class="tile" [src]="t.url" [style.left.px]="t.left" [style.top.px]="t.top" alt="" draggable="false" />
      }

      @if (!pickMode()) {
        <svg class="overlay" [attr.width]="size().w" [attr.height]="size().h" aria-hidden="true">
          <defs>
            <linearGradient id="realRoute" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cd6" />
              <stop offset="100%" stop-color="#e0709f" />
            </linearGradient>
          </defs>

          @if (routePoints(); as pts) {
            <polyline [attr.points]="pts" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
            <polyline [attr.points]="pts" fill="none" stroke="#7c5cd6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          }

          @if (screen(origin()); as p) {
            @if (pulse()) {
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="12" fill="#7c5cd6" opacity="0.3">
                <animate attributeName="r" from="10" to="46" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
              </circle>
            }
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="10" fill="#ffffff" stroke="#7c5cd6" stroke-width="5" />
          }

          @if (screen(destination()); as p) {
            <rect [attr.x]="p.x - 11" [attr.y]="p.y - 11" width="22" height="22" rx="6" fill="#e0709f" stroke="#ffffff" stroke-width="3" />
          }

          <!-- Carritos alrededor mientras busca conductor (solo animación) -->
          @for (c of ambient(); track $index) {
            @if (screen(c.p); as p) {
              <g class="car ghost" [attr.transform]="'translate(' + p.x + ' ' + p.y + ') rotate(' + c.h + ') scale(0.8)'">
                <rect x="-10" y="-18" width="20" height="36" rx="8" fill="url(#realRoute)" stroke="#ffffff" stroke-width="2.5" />
                <rect x="-7" y="-11" width="14" height="7" rx="2.5" fill="#ffffff" opacity="0.95" />
                <rect x="-7" y="-3" width="14" height="10" rx="2" fill="#ffffff" opacity="0.25" />
                <rect x="-7" y="8" width="14" height="5" rx="2" fill="#ffffff" opacity="0.8" />
              </g>
            }
          }

          @if (screen(driverShown()); as p) {
            <!-- Carro del conductor visto desde arriba, girado hacia donde va -->
            <g class="car" [attr.transform]="'translate(' + p.x + ' ' + p.y + ') rotate(' + heading() + ')'">
              <circle r="22" fill="#7c5cd6" opacity="0.15">
                <animate attributeName="r" from="16" to="30" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.3" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <rect x="-10" y="-18" width="20" height="36" rx="8" fill="url(#realRoute)" stroke="#ffffff" stroke-width="2.5" />
              <rect x="-7" y="-11" width="14" height="7" rx="2.5" fill="#ffffff" opacity="0.95" />
              <rect x="-7" y="-3" width="14" height="10" rx="2" fill="#ffffff" opacity="0.25" />
              <rect x="-7" y="8" width="14" height="5" rx="2" fill="#ffffff" opacity="0.8" />
              <circle cx="-6" cy="-16" r="1.8" fill="#fff6c2" />
              <circle cx="6" cy="-16" r="1.8" fill="#fff6c2" />
            </g>
          }
        </svg>
      }
    </div>

    <!-- Pin fijo en el centro para elegir un punto -->
    @if (pickMode(); as mode) {
      <div class="pick-pin" [class.dest]="mode === 'destination'" [class.lifted]="dragging()" aria-hidden="true">
        <span class="pin"></span>
        <span class="shadow"></span>
      </div>
    }

    <div class="zoom" [style.top.px]="padTop() - 40 > 10 ? padTop() - 40 : 10">
      <button type="button" (click)="zoomBy(1)" aria-label="Acercar"><ion-icon name="add" aria-hidden="true"></ion-icon></button>
      <button type="button" (click)="zoomBy(-1)" aria-label="Alejar"><ion-icon name="remove" aria-hidden="true"></ion-icon></button>
    </div>

    <p class="attribution" [style.bottom.px]="padBottom() - 22 > 4 ? padBottom() - 22 : 4">
      © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors
    </p>
  `,
  styles: `
    :host { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; background: #f2eefa; }
    .viewport { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; }
    .viewport.dragging { cursor: grabbing; }
    .tile { position: absolute; width: 256px; height: 256px; pointer-events: none; user-select: none; }
    .overlay { position: absolute; inset: 0; pointer-events: none; }
    .car { filter: drop-shadow(0 4px 6px rgba(61, 47, 92, 0.35)); }
    .car.ghost { opacity: 0.9; }

    .pick-pin { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
    .pick-pin .pin {
      position: absolute; left: -21px; top: -50px; width: 42px; height: 42px;
      border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      background: radial-gradient(circle at center, #fff 0 7px, transparent 8px), linear-gradient(135deg, #7c5cd6, #9b7be6);
      box-shadow: 0 8px 18px rgba(124, 92, 214, 0.45); transition: top 0.15s ease;
    }
    .pick-pin.dest .pin { background: radial-gradient(circle at center, #fff 0 7px, transparent 8px), linear-gradient(135deg, #e0709f, #f29bbd); box-shadow: 0 8px 18px rgba(224, 112, 159, 0.45); }
    .pick-pin .shadow { position: absolute; left: -9px; top: -4px; width: 18px; height: 7px; border-radius: 50%; background: rgba(61, 47, 92, 0.3); filter: blur(1px); }
    .pick-pin.lifted .pin { top: -62px; }

    .zoom { position: absolute; right: 12px; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; background: #fff; box-shadow: 0 6px 16px rgba(61, 47, 92, 0.18); }
    .zoom button { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; background: #fff; color: #7c5cd6; font-size: 1.2rem; cursor: pointer; }
    .zoom button + button { border-top: 1px solid #efe9fb; }

    .attribution { position: absolute; right: 8px; margin: 0; padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.8); color: #6b6280; font-size: 10px; }
    .attribution a { color: inherit; }
  `,
})
export class RealMapComponent {
  origin = input<LatLng | null>(null);
  destination = input<LatLng | null>(null);
  driver = input<LatLng | null>(null);
  /** Modo elegir: muestra un pin fijo en el centro */
  pickMode = input<'pickup' | 'destination' | null>(null);
  /** Onda animada en la recogida (mientras busca conductor) */
  pulse = input(false);
  /** Muestra carritos dando vueltas cerca de la recogida (animación mientras busca conductor) */
  nearbyCars = input(false);
  /** Espacio libre arriba y abajo (por tarjetas que tapan el mapa) */
  padTop = input(40);
  padBottom = input(40);

  /** Dónde quedó el centro del mapa al soltarlo (modo elegir) */
  centerChange = output<LatLng>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private http = new HttpClient(inject(HttpBackend));

  size = signal({ w: 0, h: 0 });
  center = signal<LatLng>(NEIVA);
  zoom = signal(15);
  dragging = signal(false);
  private route = signal<LatLng[] | null>(null);

  /** Posición del carro que se ve (se desliza suave hacia la posición real) */
  driverShown = signal<LatLng | null>(null);
  /** Hacia dónde mira el carro (grados, 0 = norte) */
  heading = signal(0);
  private animFrame = 0;
  private lastDriverAt = 0;

  /** Carritos de la animación "buscando conductor": van y vienen cerca de la recogida */
  private ambientTime = signal(0);
  ambient = computed(() => {
    const o = this.origin();
    if (!this.nearbyCars() || !o) return [];
    const t = this.ambientTime() / 1000;
    const cars = [
      { dx: 0.0032, dy: 0.0016, axis: 'x', amp: 0.0022, speed: 0.35, ph: 0 },
      { dx: -0.0028, dy: -0.0022, axis: 'y', amp: 0.0018, speed: 0.3, ph: 1.5 },
      { dx: -0.0024, dy: 0.0028, axis: 'x', amp: 0.0018, speed: 0.4, ph: 3 },
    ];
    return cars.map(c => {
      const off = c.amp * Math.sin(t * c.speed + c.ph);
      const goingForward = Math.cos(t * c.speed + c.ph) > 0;
      return {
        p: { lat: o.lat + c.dy + (c.axis === 'y' ? off : 0), lng: o.lng + c.dx + (c.axis === 'x' ? off : 0) },
        h: c.axis === 'x' ? (goingForward ? 90 : 270) : goingForward ? 0 : 180,
      };
    });
  });

  /** Solo reencuadra cuando cambian de verdad los puntos (no cada vez que se mueve el carro) */
  private pointsKey = computed(() => {
    const k = (p: LatLng | null) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-');
    return `${k(this.origin())}|${k(this.destination())}|${this.driver() ? 1 : 0}`;
  });

  private pointers = new Map<number, Px>();
  private dragStart: { px: Px; center: Px; moved: boolean } | null = null;
  private pinchStart = 0;
  private lastWheel = 0;
  private userMoved = false;
  private routeKey = '';

  constructor() {
    addIcons({ add, remove });
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const ro = new ResizeObserver(entries => {
        const r = entries[0].contentRect;
        this.size.set({ w: r.width, h: r.height });
        if (!this.userMoved && !this.pickMode()) this.fit();
      });
      ro.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => ro.disconnect());
    });

    // Reencuadra el mapa cuando cambian los puntos
    effect(() => {
      this.pointsKey();
      untracked(() => {
        if (!this.pickMode()) {
          this.userMoved = false;
          this.fit();
        }
      });
    });

    // Al entrar en modo elegir, centra en el punto actual
    effect(() => {
      const mode = this.pickMode();
      untracked(() => {
        if (!mode) {
          this.userMoved = false;
          this.fit();
          return;
        }
        const start = (mode === 'pickup' ? this.origin() : this.destination()) ?? this.origin() ?? this.center();
        this.center.set(start);
        this.zoom.set(Math.max(this.zoom(), 17));
        this.centerChange.emit(start);
      });
    });

    // El carro se mueve suave cada vez que llega una ubicación nueva
    effect(() => {
      const target = this.driver();
      untracked(() => this.animateDriver(target));
    });
    destroyRef.onDestroy(() => cancelAnimationFrame(this.animFrame));

    // Reloj de la animación de carritos (solo corre mientras está activa)
    effect(onCleanup => {
      if (!this.nearbyCars()) return;
      const id = setInterval(() => this.ambientTime.set(performance.now()), 60);
      onCleanup(() => clearInterval(id));
    });

    // Ruta real por las calles
    effect(() => {
      const o = this.origin();
      const d = this.destination();
      untracked(() => this.loadRoute(o, d));
    });
  }

  // ---------- Dibujo ----------
  private topLeft = computed<Px>(() => {
    const c = project(this.center(), this.zoom());
    return { x: c.x - this.size().w / 2, y: c.y - this.size().h / 2 };
  });

  tiles = computed(() => {
    const { w, h } = this.size();
    if (!w || !h) return [];
    const z = this.zoom();
    const tl = this.topLeft();
    const n = 2 ** z;
    const list: { key: string; url: string; left: number; top: number }[] = [];
    for (let ty = Math.floor(tl.y / TILE); ty <= Math.floor((tl.y + h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(tl.x / TILE); tx <= Math.floor((tl.x + w) / TILE); tx++) {
        const x = ((tx % n) + n) % n;
        list.push({
          key: `${z}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${z}/${x}/${ty}.png`,
          left: Math.round(tx * TILE - tl.x),
          top: Math.round(ty * TILE - tl.y),
        });
      }
    }
    return list;
  });

  screen(p: LatLng | null): Px | null {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    const px = project(p, this.zoom());
    const tl = this.topLeft();
    return { x: px.x - tl.x, y: px.y - tl.y };
  }

  routePoints = computed(() => {
    const o = this.origin();
    const d = this.destination();
    if (!o || !d) return null;
    const pts = this.route() ?? [o, d];
    return pts
      .map(p => this.screen(p))
      .filter((p): p is Px => !!p)
      .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  });

  // ---------- Encuadre ----------
  private fit() {
    const { w, h } = this.size();
    if (!w || !h) return;
    const pts = [this.origin(), this.destination(), this.driver()].filter(
      (p): p is LatLng => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
    if (!pts.length) {
      this.center.set(NEIVA);
      this.zoom.set(14);
      return;
    }
    const top = this.padTop();
    const bottom = this.padBottom();
    const usableH = Math.max(60, h - top - bottom);
    const usableW = Math.max(60, w - 60);

    let zoom = 17;
    if (pts.length > 1) {
      for (zoom = 18; zoom > MIN_ZOOM; zoom--) {
        const px = pts.map(p => project(p, zoom));
        const bw = Math.max(...px.map(p => p.x)) - Math.min(...px.map(p => p.x));
        const bh = Math.max(...px.map(p => p.y)) - Math.min(...px.map(p => p.y));
        if (bw <= usableW && bh <= usableH) break;
      }
    }
    const px = pts.map(p => project(p, zoom));
    const midX = (Math.max(...px.map(p => p.x)) + Math.min(...px.map(p => p.x))) / 2;
    const midY = (Math.max(...px.map(p => p.y)) + Math.min(...px.map(p => p.y))) / 2;
    // Corre el centro para que los puntos queden en la zona que no tapan las tarjetas
    const offsetY = (bottom - top) / 2;
    this.zoom.set(zoom);
    this.center.set(unproject({ x: midX, y: midY + offsetY }, zoom));
  }

  // ---------- Carro en movimiento ----------
  private animateDriver(target: LatLng | null) {
    cancelAnimationFrame(this.animFrame);
    const from = this.driverShown();
    const now = performance.now();
    const gap = this.lastDriverAt ? now - this.lastDriverAt : 0;
    this.lastDriverAt = now;
    if (!target || !from || !Number.isFinite(target.lat)) {
      this.driverShown.set(target);
      return;
    }
    const a = project(from, 20);
    const b = project(target, 20);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) > 3) this.heading.set((Math.atan2(dx, -dy) * 180) / Math.PI);
    // Si saltó muy lejos (más de ~3 km) no se anima
    if (haversineKm(from, target) > 3) {
      this.driverShown.set(target);
      return;
    }
    const duration = Math.min(4000, Math.max(300, gap * 0.95));
    const t0 = now;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      this.driverShown.set({ lat: from.lat + (target.lat - from.lat) * k, lng: from.lng + (target.lng - from.lng) * k });
      if (k < 1) this.animFrame = requestAnimationFrame(step);
      else this.keepDriverInView();
    };
    this.animFrame = requestAnimationFrame(step);
  }

  /** Si el carro se sale de la parte visible del mapa, reencuadra */
  private keepDriverInView() {
    if (this.pickMode() || this.userMoved) return;
    const p = this.screen(this.driverShown());
    const { w, h } = this.size();
    if (!p || !w) return;
    if (p.x < 30 || p.x > w - 30 || p.y < this.padTop() || p.y > h - this.padBottom()) this.fit();
  }

  zoomBy(delta: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom() + delta));
    if (next === this.zoom()) return;
    this.userMoved = true;
    this.zoom.set(next);
  }

  // ---------- Arrastrar ----------
  onDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragStart = { px: { x: e.clientX, y: e.clientY }, center: project(this.center(), this.zoom()), moved: false };
    } else if (this.pointers.size === 2) {
      this.pinchStart = this.pinchDistance();
    }
  }

  onMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2 && this.pinchStart) {
      const ratio = this.pinchDistance() / this.pinchStart;
      if (ratio > 1.5 || ratio < 0.67) {
        this.zoomBy(ratio > 1 ? 1 : -1);
        this.pinchStart = this.pinchDistance();
        this.dragStart = null;
      }
      return;
    }

    const s = this.dragStart;
    if (!s) return;
    const dx = e.clientX - s.px.x;
    const dy = e.clientY - s.px.y;
    if (!s.moved && Math.hypot(dx, dy) < 4) return;
    s.moved = true;
    this.dragging.set(true);
    this.userMoved = true;
    this.center.set(unproject({ x: s.center.x - dx, y: s.center.y - dy }, this.zoom()));
  }

  onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;
    const moved = this.dragStart?.moved;
    this.dragStart = null;
    this.pinchStart = 0;
    this.dragging.set(false);
    if (this.pickMode() && moved) this.centerChange.emit(this.center());
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const now = Date.now();
    if (now - this.lastWheel < 250) return;
    this.lastWheel = now;
    this.zoomBy(e.deltaY < 0 ? 1 : -1);
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  // ---------- Ruta por las calles (OSRM, gratuito) ----------
  private loadRoute(o: LatLng | null, d: LatLng | null) {
    if (!o || !d) {
      this.route.set(null);
      this.routeKey = '';
      return;
    }
    const key = `${o.lat},${o.lng};${d.lat},${d.lng}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.route.set(null);
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    this.http.get<{ routes?: { geometry: { coordinates: [number, number][] } }[] }>(url).subscribe({
      next: res => {
        if (this.routeKey !== key) return;
        const coords = res.routes?.[0]?.geometry?.coordinates;
        this.route.set(coords?.length ? coords.map(([lng, lat]) => ({ lat, lng })) : null);
      },
      error: () => undefined, // sin internet: se dibuja una línea recta
    });
  }
}