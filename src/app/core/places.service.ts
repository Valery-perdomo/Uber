import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { LatLng, Place } from './models';
import { HUILA_BBOX, inHuila } from './utils';

/** Si no sabemos dónde está la persona, se priorizan resultados cerca de Neiva */
const NEIVA_CENTER: LatLng = { lat: 2.9273, lng: -75.2819 };

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    osm_value?: string;
  };
}

/**
 * Buscador de lugares con OpenStreetMap (servicio gratuito Photon).
 * Usa HttpBackend para que NO pase por el interceptor: así no se envía
 * el token de la app a un servicio externo.
 */
@Injectable({ providedIn: 'root' })
export class PlacesService {
  private http = new HttpClient(inject(HttpBackend));
  private base = 'https://photon.komoot.io';

  /** Busca lugares del Huila por nombre o dirección */
  search(query: string, near?: LatLng | null): Observable<Place[]> {
    const center = near ?? NEIVA_CENTER;
    const params = new HttpParams()
      .set('q', query)
      .set('bbox', HUILA_BBOX)
      .set('lat', center.lat)
      .set('lon', center.lng)
      .set('limit', 15);
    return this.http.get<{ features: PhotonFeature[] }>(`${this.base}/api`, { params }).pipe(
      timeout(8000),
      map(res =>
        this.dedupe((res.features ?? []).map(f => this.toPlace(f)).filter((p): p is Place => !!p && inHuila(p))).slice(0, 10),
      ),
      catchError(() => of([])),
    );
  }

  /** Convierte unas coordenadas en una dirección ("Calle 7 # 5-20, Centro, Neiva") */
  reverse(point: LatLng): Observable<Place | null> {
    const params = new HttpParams().set('lat', point.lat).set('lon', point.lng).set('limit', 1);
    return this.http.get<{ features: PhotonFeature[] }>(`${this.base}/reverse`, { params }).pipe(
      timeout(8000),
      map(res => (res.features?.[0] ? this.toPlace(res.features[0]) : null)),
      catchError(() => of(null)),
    );
  }

  private toPlace(f: PhotonFeature): Place | null {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const street = [p.street, p.housenumber ? `# ${p.housenumber}` : ''].filter(Boolean).join(' ');
    const zone = p.district ?? p.locality ?? '';
    const name = p.name ?? (street || zone);
    if (!name) return null;

    const city = p.city ?? p.county ?? '';
    const address = [street !== name ? street : '', zone !== name ? zone : '', city !== name ? city : '']
      .filter(Boolean)
      .join(', ');
    return { name, address: address || 'Huila', city: city || undefined, state: p.state, lat, lng };
  }

  /** Quita resultados repetidos (mismo nombre y misma dirección) */
  private dedupe(list: Place[]): Place[] {
    const seen = new Set<string>();
    return list.filter(p => {
      const key = `${p.name}|${p.address}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}