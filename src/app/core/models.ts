export type Role = 'client' | 'driver' | 'admin';

export interface Vehicle {
  id?: number;
  plate: string;
  brand: string;
  model: string;
  year?: number;
  capacity?: number;
  color?: string;
}

export interface DriverProfile {
  id: number;
  license_number?: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended' | string;
  availability_status?: 'available' | 'unavailable' | string;
  rating_average?: number | string;
  vehicles?: Vehicle[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: string;
  driver_profile?: DriverProfile;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  name: string;
  address: string;
  city?: string;
  /** Departamento (ej. "Huila"), si lo conocemos */
  state?: string;
}

export interface Fare {
  id: number;
  name: string;
  base_fare: number | string;
  price_per_km: number | string;
  price_per_minute: number | string;
  minimum_fare: number | string;
  surge_multiplier: number | string;
  active: boolean;
  created_at?: string;
}

export interface FareBreakdown {
  base_fare: number;
  price_per_km: number;
  price_per_minute: number;
  minimum_fare: number;
  surge_multiplier: number;
}

export interface Estimate {
  distance_km: number;
  duration_min: number;
  estimated_fare: number;
  currency: string;
  fare_breakdown: FareBreakdown;
}

export interface RideRequest {
  id: number;
  client_id?: number;
  origin_name: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
  estimated_distance_km?: number;
  estimated_duration_min?: number;
  estimated_fare?: number;
  status?: string;
  created_at?: string;
  client?: { name: string; phone?: string };
}

export interface DriverSummary {
  id: number;
  rating_average?: number | string;
  user?: { name: string; phone?: string; email?: string };
  latest_location?: { latitude: number; longitude: number } | null;
}

/** Datos de /client/active cuando ya hay un conductor asignado */
export interface ActiveTrip {
  id: number;
  status: string;
  request_id?: number;
  estimated_fare?: number;
  final_fare?: number;
  driver?: DriverSummary;
  vehicle?: Vehicle;
  origin_name?: string;
  destination_name?: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  request?: RideRequest;
}

export interface ActiveResponse {
  success: boolean;
  has_active: boolean;
  type?: 'request' | 'trip';
  data?: ActiveTrip & Partial<RideRequest>;
}

export interface Trip {
  id: number;
  request_id?: number;
  status: string;
  estimated_fare?: number | string;
  final_fare?: number | string;
  distance_travelled_km?: number | string;
  duration_travelled_min?: number | string;
  created_at?: string;
  completed_at?: string;
  driver_arrived_at?: string;
  started_at?: string;
  origin_name?: string;
  destination_name?: string;
  driver?: DriverSummary;
  client?: { name?: string; user?: { name: string } };
  vehicle?: Vehicle;
  request?: RideRequest;
  ride_request?: RideRequest;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  next_page_url: string | null;
  total: number;
}

export interface AdminStats {
  total_clients: number;
  total_drivers: number;
  pending_drivers: number;
  approved_drivers: number;
  active_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  pending_requests: number;
  total_revenue: number;
}

export interface AdminDriver {
  id: number;
  license_number?: string;
  approval_status: string;
  availability_status?: string;
  rating_average?: number | string;
  admin_notes?: string | null;
  user?: { name: string; email?: string; phone?: string };
  vehicles?: Vehicle[];
}