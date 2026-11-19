import { LatLng, Place } from './models';

/** Convierte cualquier valor (número o texto de la API) a número */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** $6.500 */
export function formatCop(value: unknown): string {
  return '$' + Math.round(num(value)).toLocaleString('es-CO');
}

/** 1,28 km */
export function formatKm(value: unknown): string {
  return num(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
}

/** Iniciales: "Carlos Rodríguez" -> "CR" */
export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

export function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || '';
}

/** Distancia en km entre dos puntos (fórmula de Haversine, igual que el backend) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Minutos aproximados para recorrer una distancia en ciudad (~24 km/h) */
export function etaMinutes(km: number): number {
  return Math.max(1, Math.ceil(km / 0.4));
}

/** Algunas respuestas vienen paginadas ({ data: [...] }) y otras como lista directa */
/**
 * Zona permitida: departamento del Huila (oeste, sur, este, norte).
 * Es un rectángulo aproximado que cubre todo el departamento.
 */
export const HUILA_BOUNDS = { west: -76.7, south: 1.45, east: -74.4, north: 3.95 };
export const HUILA_BBOX = `${HUILA_BOUNDS.west},${HUILA_BOUNDS.south},${HUILA_BOUNDS.east},${HUILA_BOUNDS.north}`;

/** true si el punto está dentro del Huila */
export function inHuila(p: (LatLng & { state?: string }) | null | undefined): boolean {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  // Si el buscador nos dijo el departamento, usamos ese dato (es más exacto que el rectángulo)
  if (p.state) return /huila/i.test(p.state);
  const b = HUILA_BOUNDS;
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}
export function toList<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

export const STATUS_LABELS: Record<string, string> = {
  requested: 'Buscando conductor',
  assigned: 'Asignado',
  driver_arrived: 'Conductor llegó',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
  available: 'En línea',
  unavailable: 'Desconectado',
  active: 'Activo',
  inactive: 'Inactivo',
};

export const STATUS_TONES: Record<string, string> = {
  requested: 'cielo',
  assigned: 'lila',
  driver_arrived: 'durazno',
  in_progress: 'cielo',
  completed: 'menta',
  cancelled: 'rosa',
  canceled: 'rosa',
  pending: 'durazno',
  approved: 'menta',
  rejected: 'rosa',
  suspended: 'gris',
  available: 'menta',
  unavailable: 'gris',
  active: 'menta',
  inactive: 'gris',
};

export function statusLabel(status?: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function statusTone(status?: string | null): string {
  return (status && STATUS_TONES[status]) || 'lila';
}

/** Mensaje entendible a partir de un error de la API */
export function apiErrorMessage(err: any): string {
  if (err?.name === 'TimeoutError') return 'El servidor tardó demasiado en responder. Intenta más tarde.';
  if (err?.status === 0) return 'No se pudo conectar con el servidor. Revisa tu red.';
  if (err?.status === 401) return err?.error?.message && err.error.message !== 'Unauthenticated.'
    ? err.error.message
    : 'Correo/teléfono o contraseña incorrectos.';
  if (err?.status === 422 && err?.error?.errors) {
    const first = Object.values(err.error.errors)[0] as string[];
    return first?.[0] ?? 'Revisa los datos ingresados.';
  }
  return err?.error?.message ?? 'Ocurrió un error. Intenta de nuevo.';
}

/** Errores de validación por campo: { email: 'El correo ya existe' } */
export function fieldErrors(err: any): Record<string, string> {
  const out: Record<string, string> = {};
  const errors = err?.error?.errors;
  if (errors && typeof errors === 'object') {
    for (const [key, value] of Object.entries(errors)) {
      out[key] = Array.isArray(value) ? String(value[0]) : String(value);
    }
  }
  return out;
}

/** Guardado sencillo en el navegador (con protección por si falla) */
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin almacenamiento disponible */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* sin almacenamiento disponible */
    }
  },
};

/**
 * Lugares sugeridos de Neiva para el buscador.
 * Las coordenadas son aproximadas: para ajustar una, búscala en Google Maps,
 * clic derecho sobre el lugar y copia los números (latitud, longitud).
 */
export const PLACES: Place[] = [
  { name: 'Parque Santander', address: 'Calle 7 con Carrera 5, Centro', city: 'Neiva', lat: 2.929, lng: -75.29 },
  { name: 'Catedral de Neiva', address: 'Carrera 4 # 7-30, Centro', city: 'Neiva', lat: 2.9296, lng: -75.2908 },
  { name: 'Malecón del Río Magdalena', address: 'Avenida Circunvalar', city: 'Neiva', lat: 2.9312, lng: -75.2945 },
  { name: 'Monumento La Gaitana', address: 'Avenida Circunvalar con Calle 10', city: 'Neiva', lat: 2.935, lng: -75.2955 },
  { name: 'Hospital Universitario', address: 'Calle 9 # 15-25', city: 'Neiva', lat: 2.9318, lng: -75.278 },
  { name: 'Estadio Guillermo Plazas Alcid', address: 'Calle 21 con Carrera 16', city: 'Neiva', lat: 2.933, lng: -75.276 },
  { name: 'Terminal de Transportes', address: 'Carrera 7 # 3-01 Sur', city: 'Neiva', lat: 2.9215, lng: -75.283 },
  { name: 'Universidad Surcolombiana', address: 'Avenida Pastrana Borrero, Carrera 1', city: 'Neiva', lat: 2.942, lng: -75.296 },
  { name: 'C.C. San Pedro Plaza', address: 'Carrera 8 # 38-42', city: 'Neiva', lat: 2.9467, lng: -75.2843 },
  { name: 'C.C. Unicentro Neiva', address: 'Carrera 15 # 31-12', city: 'Neiva', lat: 2.9405, lng: -75.2785 },
  { name: 'Aeropuerto Benito Salas', address: 'Carrera 4 # 26-00', city: 'Neiva', lat: 2.9515, lng: -75.294 },
  { name: 'C.C. Santa Lucía Plaza', address: 'Calle 64 con Carrera 1', city: 'Neiva', lat: 2.964, lng: -75.2958 },
    // Municipios del Huila (parque principal de cada uno)
  { name: 'Rivera', address: 'Parque principal', city: 'Rivera', lat: 2.7772, lng: -75.2577 },
  { name: 'Palermo', address: 'Parque principal', city: 'Palermo', lat: 2.8892, lng: -75.4342 },
  { name: 'Campoalegre', address: 'Parque principal', city: 'Campoalegre', lat: 2.6867, lng: -75.3256 },
  { name: 'Tello', address: 'Parque principal', city: 'Tello', lat: 3.0675, lng: -75.1394 },
  { name: 'Aipe', address: 'Parque principal', city: 'Aipe', lat: 3.2217, lng: -75.2367 },
  { name: 'Villavieja', address: 'Parque principal', city: 'Villavieja', lat: 3.2189, lng: -75.2181 },
  { name: 'Desierto de la Tatacoa', address: 'Observatorio Astronómico', city: 'Villavieja', lat: 3.2333, lng: -75.1683 },
  { name: 'Baraya', address: 'Parque principal', city: 'Baraya', lat: 3.1528, lng: -75.0547 },
  { name: 'Yaguará', address: 'Parque principal', city: 'Yaguará', lat: 2.6642, lng: -75.5183 },
  { name: 'Hobo', address: 'Parque principal', city: 'Hobo', lat: 2.5808, lng: -75.4489 },
  { name: 'Gigante', address: 'Parque principal', city: 'Gigante', lat: 2.3864, lng: -75.5469 },
  { name: 'Garzón', address: 'Parque principal', city: 'Garzón', lat: 2.1961, lng: -75.6278 },
  { name: 'La Plata', address: 'Parque principal', city: 'La Plata', lat: 2.39, lng: -75.8925 },
  { name: 'Pitalito', address: 'Parque principal', city: 'Pitalito', lat: 1.8536, lng: -76.0511 },
  { name: 'San Agustín', address: 'Parque principal', city: 'San Agustín', lat: 1.8814, lng: -76.2683 },
];