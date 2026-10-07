import { polygonKm, type LatLng } from '@crumb/core';

/*
 * Walking distance for a loop via the Routes API (computeRoutes, travelMode WALK).
 * "Compute Routes Essentials" (≤ 10 waypoints, no traffic) has a 10,000 calls/month free cap.
 */

export interface MeasuredRoute {
  distanceKm: number;
  durationMin: number;
  polyline?: string;
  warnings: string[];
}

export interface RoutesClient {
  readonly measured: boolean;
  walkingLoop(origin: LatLng, waypoints: LatLng[]): Promise<MeasuredRoute>;
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

interface RoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    warnings?: string[];
  }[];
}

const latLng = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export function createGoogleRoutesClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): RoutesClient {
  return {
    measured: true,
    async walkingLoop(origin, waypoints) {
      const res = await fetchImpl(ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.warnings',
        },
        body: JSON.stringify({
          origin: latLng(origin),
          destination: latLng(origin),
          intermediates: waypoints.map(latLng),
          travelMode: 'WALK',
          polylineQuality: 'OVERVIEW',
          units: 'METRIC',
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Routes API ${res.status}`);
      const body = (await res.json()) as RoutesResponse;
      const route = body.routes?.[0];
      if (!route?.distanceMeters || !route.duration)
        throw new Error('Routes API returned no route');
      return {
        distanceKm: route.distanceMeters / 1000,
        durationMin: Number.parseFloat(route.duration) / 60,
        polyline: route.polyline?.encodedPolyline,
        warnings: route.warnings ?? [],
      };
    },
  };
}

/** No-network estimate: straight-line loop × typical street detour, at 5 km/h. */
export function createEstimatedRoutesClient(): RoutesClient {
  return {
    measured: false,
    async walkingLoop(origin, waypoints) {
      // The inscribed square is ~0.9 of the circle the loop was sized on; streets add ~25%.
      const distanceKm = (polygonKm([origin, ...waypoints]) / 0.9) * 1.25;
      return { distanceKm, durationMin: (distanceKm / 5) * 60, warnings: [] };
    },
  };
}

/** Mock that behaves like a measured router (for tests and MOCK_EXTERNALS demos). */
export function createMockRoutesClient(): RoutesClient {
  return {
    measured: true,
    async walkingLoop(origin, waypoints) {
      const distanceKm = polygonKm([origin, ...waypoints]) * 1.35;
      return {
        distanceKm,
        durationMin: (distanceKm / 5) * 60,
        warnings: [
          'Walking directions are in beta. Use caution – this route may be missing sidewalks or pedestrian paths.',
        ],
      };
    },
  };
}
