import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, barChartOutline, carOutline, cashOutline, close, documentTextOutline, gridOutline,
  logOutOutline, peopleOutline, refreshOutline, searchOutline, shieldCheckmarkOutline,
} from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../core/ui.service';
import { CopPipe, InitialsPipe, StatusLabelPipe, StatusTonePipe } from '../../core/pipes';
import { AdminDriver, AdminStats, Fare, Trip } from '../../core/models';
import { apiErrorMessage, fieldErrors, formatCop, num, statusLabel } from '../../core/utils';

type Section = 'overview' | 'drivers' | 'trips' | 'fares' | 'reports' | 'audit';

interface ReportBlock {
  key: string;
  title: string;
  kind: 'number' | 'list' | 'object' | 'text';
  value: unknown;
}

const NAV: { key: Section; label: string; icon: string; title: string }[] = [
  { key: 'overview', label: 'Resumen', icon: 'grid-outline', title: 'Resumen de la plataforma' },
  { key: 'drivers', label: 'Conductores', icon: 'people-outline', title: 'Conductores' },
  { key: 'trips', label: 'Viajes', icon: 'car-outline', title: 'Viajes' },
  { key: 'fares', label: 'Tarifas', icon: 'cash-outline', title: 'Tarifas' },
  { key: 'reports', label: 'Reportes', icon: 'bar-chart-outline', title: 'Reportes' },
  { key: 'audit', label: 'Auditoría', icon: 'shield-checkmark-outline', title: 'Registro de auditoría' },
];

const MONEY_KEYS = /(fare|revenue|ingreso|total_amount|amount|earn|ganancia|price)/i;
const DATE_KEYS = /(_at|date|fecha)$/i;

/** Mockup 7 · Admin · Dashboard (HU-15) */
@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonSpinner, CopPipe, InitialsPipe, StatusLabelPipe, StatusTonePipe],
})
export class AdminPage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);

  readonly nav = NAV;
  readonly user = this.auth.user;
  readonly driverFilters = ['', 'pending', 'approved', 'suspended', 'rejected'];
  readonly tripFilters = ['', 'requested', 'assigned', 'in_progress', 'completed', 'cancelled'];

  section = signal<Section>('overview');
  search = signal('');
  loading = signal(false);

  // Resumen
  stats = signal<Partial<AdminStats>>({});
  recentTrips = signal<Trip[]>([]);
  incidents = signal<any[]>([]);
  pending = signal<AdminDriver[]>([]);
  activeFare = signal<Fare | null>(null);
  working = signal<number | null>(null);

  // Secciones
  drivers = signal<AdminDriver[]>([]);
  driverFilter = signal('');
  trips = signal<Trip[]>([]);
  tripFilter = signal('');
  tripDate = '';
  fares = signal<Fare[]>([]);
  reports = signal<Record<string, unknown> | null>(null);
  logs = signal<any[]>([]);

  // Nueva tarifa
  fareOpen = signal(false);
  savingFare = signal(false);
  fareErrors = signal<Record<string, string>>({});
  fareForm = this.emptyFare();

  title = computed(() => NAV.find(n => n.key === this.section())?.title ?? '');

  filteredRecent = computed(() => this.filterTrips(this.recentTrips()));
  filteredTrips = computed(() => this.filterTrips(this.trips()));
  filteredPending = computed(() => this.filterDrivers(this.pending()));
  filteredDrivers = computed(() => this.filterDrivers(this.drivers()));
  filteredLogs = computed(() => {
    const q = normalize(this.search());
    return q ? this.logs().filter(l => normalize(JSON.stringify(l)).includes(q)) : this.logs();
  });
  logColumns = computed(() => columnsOf(this.logs()));

  fareRows = computed(() => {
    const f = this.activeFare();
    if (!f) return [];
    return [
      { key: 'base_fare', value: formatCop(f.base_fare) },
      { key: 'price_per_km', value: formatCop(f.price_per_km) },
      { key: 'price_per_minute', value: formatCop(f.price_per_minute) },
      { key: 'minimum_fare', value: formatCop(f.minimum_fare) },
      { key: 'surge_multiplier', value: '×' + num(f.surge_multiplier, 1).toLocaleString('es-CO', { minimumFractionDigits: 1 }) },
    ];
  });

  reportBlocks = computed<ReportBlock[]>(() => {
    let data = this.reports();
    if (!data) return [];
    const inner = (data['report'] ?? data['reports'] ?? data['data']) as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) data = inner;
    return Object.entries(data)
      .filter(([key]) => key !== 'success' && key !== 'message')
      .map(([key, value]) => ({
        key,
        title: humanize(key),
        kind: Array.isArray(value) ? 'list' : value !== null && typeof value === 'object' ? 'object' : typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value)) ? 'number' : 'text',
        value,
      }));
  });

  constructor() {
    addIcons({
      addOutline, barChartOutline, carOutline, cashOutline, close, documentTextOutline, gridOutline,
      logOutOutline, peopleOutline, refreshOutline, searchOutline, shieldCheckmarkOutline,
    });
  }

  ionViewWillEnter() {
    this.loadSection(this.section());
  }

  go(section: Section) {
    this.section.set(section);
    this.search.set('');
    this.loadSection(section);
  }

  refresh() {
    this.loadSection(this.section());
  }

  private loadSection(section: Section) {
    switch (section) {
      case 'overview':
        return this.loadOverview();
      case 'drivers':
        return this.loadDrivers();
      case 'trips':
        return this.loadTrips();
      case 'fares':
        return this.loadFares();
      case 'reports':
        return this.loadReports();
      case 'audit':
        return this.loadAudit();
    }
  }

  private fail = (err: unknown) => {
    this.loading.set(false);
    this.ui.toast(apiErrorMessage(err), 'danger');
  };

  // ---------- Resumen ----------
  private loadOverview() {
    this.loading.set(true);
    this.api.dashboard().subscribe({
      next: d => {
        this.stats.set(d.stats);
        this.recentTrips.set(d.recent_trips);
        this.incidents.set(d.recent_incidents);
        this.loading.set(false);
      },
      error: this.fail,
    });
    this.api.adminDrivers('pending').subscribe({ next: list => this.pending.set(list), error: () => undefined });
    this.api.activeFare().subscribe({ next: f => this.activeFare.set(f), error: () => this.activeFare.set(null) });
  }

  // ---------- Conductores ----------
  private loadDrivers() {
    this.loading.set(true);
    this.api.adminDrivers(this.driverFilter() || undefined).subscribe({
      next: list => {
        this.drivers.set(list);
        this.loading.set(false);
      },
      error: this.fail,
    });
  }

  setDriverFilter(value: string) {
    this.driverFilter.set(value);
    this.loadDrivers();
  }

  async approve(d: AdminDriver) {
    const ok = await this.ui.confirm('Aprobar conductor', `¿Aprobar a ${d.user?.name ?? 'este conductor'}? Podrá recibir viajes de inmediato.`, 'Aprobar');
    if (!ok) return;
    this.changeApproval(d, 'approved', 'Documentación de licencia y vehículo verificada.');
  }

  async reject(d: AdminDriver, status: 'rejected' | 'suspended' = 'rejected') {
    const verb = status === 'rejected' ? 'Rechazar' : 'Suspender';
    const reason = await this.ui.prompt(
      `${verb} conductor`,
      `Escribe el motivo. ${d.user?.name ?? 'El conductor'} podrá verlo.`,
      'Ej: la licencia está vencida',
      verb,
      true,
    );
    if (reason === null) return;
    if (!reason) {
      this.ui.toast('El motivo es obligatorio.', 'warning');
      return;
    }
    this.changeApproval(d, status, reason);
  }

  private changeApproval(d: AdminDriver, status: string, notes: string) {
    this.working.set(d.id);
    this.api.setDriverApproval(d.id, status, notes).subscribe({
      next: () => {
        this.working.set(null);
        this.ui.toast(`${d.user?.name ?? 'Conductor'}: ${statusLabel(status).toLowerCase()}.`, 'success');
        this.pending.update(list => list.filter(x => x.id !== d.id));
        this.drivers.update(list => list.map(x => (x.id === d.id ? { ...x, approval_status: status, admin_notes: notes } : x)));
        this.stats.update(s => ({
          ...s,
          pending_drivers: Math.max(0, num(s.pending_drivers) - (d.approval_status === 'pending' ? 1 : 0)),
          approved_drivers: num(s.approved_drivers) + (status === 'approved' ? 1 : 0),
        }));
      },
      error: err => {
        this.working.set(null);
        this.ui.toast(apiErrorMessage(err), 'danger');
      },
    });
  }

  // ---------- Viajes ----------
  loadTrips() {
    this.loading.set(true);
    this.api.adminTrips({ status: this.tripFilter(), date: this.tripDate }).subscribe({
      next: list => {
        this.trips.set(list);
        this.loading.set(false);
      },
      error: this.fail,
    });
  }

  setTripFilter(value: string) {
    this.tripFilter.set(value);
    this.loadTrips();
  }

  // ---------- Tarifas ----------
  private loadFares() {
    this.loading.set(true);
    this.api.adminFares().subscribe({
      next: list => {
        this.fares.set(list);
        this.loading.set(false);
      },
      error: this.fail,
    });
    this.api.activeFare().subscribe({ next: f => this.activeFare.set(f), error: () => undefined });
  }

  openFare() {
    this.fareForm = this.emptyFare();
    this.fareErrors.set({});
    this.fareOpen.set(true);
  }

  private emptyFare() {
    return {
      name: '',
      base_fare: 3800 as number | string,
      price_per_km: 1250 as number | string,
      price_per_minute: 250 as number | string,
      minimum_fare: 6500 as number | string,
      surge_multiplier: 1 as number | string,
      active: true,
    };
  }

  saveFare() {
    const f = this.fareForm;
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Escribe un nombre.';
    for (const key of ['base_fare', 'price_per_km', 'price_per_minute', 'minimum_fare'] as const) {
      if (!(num(f[key], -1) >= 0)) e[key] = 'Valor no válido.';
    }
    if (!(num(f.surge_multiplier, 0) >= 1)) e['surge_multiplier'] = 'Debe ser 1 o más.';
    this.fareErrors.set(e);
    if (Object.keys(e).length) return;

    this.savingFare.set(true);
    this.api
      .createFare({
        name: f.name.trim(),
        base_fare: num(f.base_fare),
        price_per_km: num(f.price_per_km),
        price_per_minute: num(f.price_per_minute),
        minimum_fare: num(f.minimum_fare),
        surge_multiplier: num(f.surge_multiplier, 1),
        active: f.active,
      })
      .subscribe({
        next: () => {
          this.savingFare.set(false);
          this.fareOpen.set(false);
          this.ui.toast('Tarifa configurada.', 'success');
          this.loadSection(this.section());
          this.api.activeFare().subscribe({ next: fare => this.activeFare.set(fare), error: () => undefined });
        },
        error: err => {
          this.savingFare.set(false);
          this.fareErrors.set(fieldErrors(err));
          this.ui.toast(apiErrorMessage(err), 'danger');
        },
      });
  }

  // ---------- Reportes y auditoría ----------
  private loadReports() {
    this.loading.set(true);
    this.api.adminReports().subscribe({
      next: r => {
        this.reports.set(r);
        this.loading.set(false);
      },
      error: this.fail,
    });
  }

  private loadAudit() {
    this.loading.set(true);
    this.api.auditLogs().subscribe({
      next: list => {
        this.logs.set(list);
        this.loading.set(false);
      },
      error: this.fail,
    });
  }

  // ---------- Ayudas para la vista ----------
  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clientName(t: Trip): string {
    return t.client?.user?.name ?? t.client?.name ?? '—';
  }

  driverName(t: Trip): string {
    return t.driver?.user?.name ?? '—';
  }

  tripDateLabel(t: Trip): string {
    const raw = t.completed_at ?? t.created_at;
    return raw ? new Date(raw).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
  }

  filterLabel(value: string, kind: 'driver' | 'trip'): string {
    if (!value) return 'Todos';
    return kind === 'trip' && value === 'requested' ? 'Solicitados' : statusLabel(value);
  }

  numberOf(value: unknown): number {
    return num(value);
  }

  isMoney(key: string): boolean {
    return MONEY_KEYS.test(key);
  }

  humanize(key: string): string {
    return humanize(key);
  }

  columnsOf(rows: unknown): string[] {
    return columnsOf(Array.isArray(rows) ? rows : []);
  }

  entriesOf(value: unknown): { key: string; value: unknown }[] {
    return value && typeof value === 'object' ? Object.entries(value).map(([key, v]) => ({ key, value: v })) : [];
  }

  asList(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  cell(row: any, key: string): string {
    const value = row?.[key];
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return value.name ?? value.user?.name ?? value.email ?? JSON.stringify(value);
    if (MONEY_KEYS.test(key) && Number.isFinite(Number(value))) return formatCop(value);
    if (DATE_KEYS.test(key) && !Number.isNaN(Date.parse(String(value)))) {
      return new Date(String(value)).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    }
    if (key === 'status' || key === 'approval_status') return statusLabel(String(value));
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return String(value);
  }

  private filterTrips(list: Trip[]): Trip[] {
    const q = normalize(this.search());
    if (!q) return list;
    return list.filter(t =>
      normalize(`${t.id} ${this.clientName(t)} ${this.driverName(t)} ${t.vehicle?.plate ?? ''} ${t.status}`).includes(q),
    );
  }

  private filterDrivers(list: AdminDriver[]): AdminDriver[] {
    const q = normalize(this.search());
    if (!q) return list;
    return list.filter(d =>
      normalize(`${d.user?.name ?? ''} ${d.user?.email ?? ''} ${d.license_number ?? ''} ${d.vehicles?.map(v => v.plate).join(' ') ?? ''}`).includes(q),
    );
  }

  async logout() {
    const ok = await this.ui.confirm('Cerrar sesión', '¿Quieres salir del panel?', 'Salir');
    if (!ok) return;
    const leave = () => this.router.navigateByUrl('/login', { replaceUrl: true });
    this.auth.logout().subscribe({ complete: leave, error: leave });
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function humanize(key: string): string {
  const text = key.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Columnas sencillas para mostrar listas de la API como tabla */
function columnsOf(rows: any[]): string[] {
  const first = rows.find(r => r && typeof r === 'object');
  if (!first) return [];
  return Object.keys(first)
    .filter(k => !['updated_at', 'password', 'remember_token', 'deleted_at'].includes(k))
    .filter(k => {
      const v = first[k];
      return v === null || typeof v !== 'object' || 'name' in v || (v.user && 'name' in v.user);
    })
    .slice(0, 7);
}