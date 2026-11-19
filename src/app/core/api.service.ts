import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ActiveResponse, AdminDriver, AdminStats, Estimate, Fare, LatLng, Paginated, RideRequest, Trip,
} from './models';
import { toList } from './utils';

/**
 * Todas las rutas de la API (excepto login/registro, que están en AuthService).
 * El token se agrega solo gracias al interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // ---------- Tarifas públicas ----------
  activeFare(): Observable<Fare> {
    return this.http.get<{ fare: Fare }>(`${this.api}/fares/active`).pipe(map(r => r.fare));
  }

  // ---------- Cliente ----------
  estimate(origin: LatLng, destination: LatLng): Observable<Estimate> {
    return this.http
      .post<{ estimate: Estimate }>(`${this.api}/client/estimate-fare`, {
        origin_latitude: origin.lat,
        origin_longitude: origin.lng,
        destination_latitude: destination.lat,
        destination_longitude: destination.lng,
      })
      .pipe(map(r => r.estimate));
  }

  createRideRequest(body: {
    origin_name: string;
    origin_latitude: number;
    origin_longitude: number;
    destination_name: string;
    destination_latitude: number;
    destination_longitude: number;
  }): Observable<RideRequest> {
    return this.http
      .post<{ ride_request: RideRequest }>(`${this.api}/client/ride-requests`, body)
      .pipe(map(r => r.ride_request));
  }

  clientActive(): Observable<ActiveResponse> {
    return this.http.get<ActiveResponse>(`${this.api}/client/active`);
  }

  cancel(id: number, reason: string): Observable<unknown> {
    return this.http.post(`${this.api}/client/cancel/${id}`, { reason });
  }

  clientTrips(page = 1): Observable<Paginated<Trip>> {
    return this.http
      .get<{ trips: Paginated<Trip> | Trip[] }>(`${this.api}/client/trips`, { params: { page } })
      .pipe(
        map(r =>
          Array.isArray(r.trips)
            ? { data: r.trips, current_page: 1, last_page: 1, next_page_url: null, total: r.trips.length }
            : r.trips,
        ),
      );
  }

  rateTrip(tripId: number, body: { score: number; comment: string; has_incident: boolean }): Observable<unknown> {
    return this.http.post(`${this.api}/client/trips/${tripId}/rating`, body);
  }

  // ---------- Conductor ----------
  setAvailability(status: 'available' | 'unavailable'): Observable<{ availability_status: string }> {
    return this.http.put<{ availability_status: string }>(`${this.api}/driver/availability`, { status });
  }

  rideRequests(): Observable<RideRequest[]> {
    return this.http
      .get<{ requests: RideRequest[] }>(`${this.api}/driver/ride-requests`)
      .pipe(map(r => toList<RideRequest>(r.requests)));
  }

  acceptRequest(id: number): Observable<Trip> {
    return this.http
      .post<{ trip: Trip }>(`${this.api}/driver/ride-requests/${id}/accept`, {})
      .pipe(map(r => r.trip));
  }

  arrive(tripId: number): Observable<Trip> {
    return this.http.post<{ trip: Trip }>(`${this.api}/driver/trips/${tripId}/arrive`, {}).pipe(map(r => r.trip));
  }

  start(tripId: number): Observable<Trip> {
    return this.http.post<{ trip: Trip }>(`${this.api}/driver/trips/${tripId}/start`, {}).pipe(map(r => r.trip));
  }

  complete(tripId: number, body: { actual_distance_km: number; actual_duration_min: number }): Observable<Trip> {
    return this.http
      .post<{ trip: Trip }>(`${this.api}/driver/trips/${tripId}/complete`, body)
      .pipe(map(r => r.trip));
  }

  sendLocation(body: { latitude: number; longitude: number; heading?: number; speed?: number; trip_id?: number }): Observable<unknown> {
    return this.http.post(`${this.api}/driver/location`, body);
  }

  // ---------- Administrador ----------
  dashboard(): Observable<{ stats: AdminStats; recent_trips: Trip[]; recent_incidents: any[] }> {
    return this.http.get<any>(`${this.api}/admin/dashboard`).pipe(
      map(r => ({
        stats: r.stats ?? {},
        recent_trips: toList<Trip>(r.recent_trips),
        recent_incidents: toList(r.recent_incidents),
      })),
    );
  }

  adminDrivers(approvalStatus?: string): Observable<AdminDriver[]> {
    let params = new HttpParams();
    if (approvalStatus) params = params.set('approval_status', approvalStatus);
    return this.http
      .get<{ drivers: unknown }>(`${this.api}/admin/drivers`, { params })
      .pipe(map(r => toList<AdminDriver>(r.drivers)));
  }

  setDriverApproval(id: number, approval_status: string, admin_notes: string): Observable<unknown> {
    return this.http.patch(`${this.api}/admin/drivers/${id}/approval`, { approval_status, admin_notes });
  }

  adminFares(): Observable<Fare[]> {
    return this.http.get<{ fares: unknown }>(`${this.api}/admin/fares`).pipe(map(r => toList<Fare>(r.fares)));
  }

  createFare(body: Omit<Fare, 'id' | 'created_at'>): Observable<Fare> {
    return this.http.post<{ fare: Fare }>(`${this.api}/admin/fares`, body).pipe(map(r => r.fare));
  }

  adminTrips(filters: Record<string, string> = {}): Observable<Trip[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<{ trips: unknown }>(`${this.api}/admin/trips`, { params }).pipe(map(r => toList<Trip>(r.trips)));
  }

  adminReports(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.api}/admin/reports`);
  }

  auditLogs(): Observable<any[]> {
    return this.http.get<any>(`${this.api}/admin/audit-logs`).pipe(
      map(r => toList(r.logs ?? r.audit_logs ?? r.data ?? r)),
    );
  }
}