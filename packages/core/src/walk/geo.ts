import type { LatLng } from '../schemas/api';

/* Loop-route geometry for the walk planner (PRD §27). Pure math; no network. */

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Default ratio between street-network distance and the ideal circle. */
export const DETOUR_FACTOR = 1.25;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Point reached travelling `distanceKm` from `origin` on an initial bearing (degrees). */
export function destinationPoint(origin: LatLng, bearingDeg: number, distanceKm: number): LatLng {
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin.lat);
  const λ1 = toRad(origin.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: round5(toDeg(φ2)), lng: round5(((toDeg(λ2) + 540) % 360) - 180) };
}

function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

/**
 * Three waypoints on a circle that passes through the origin, so origin → w1 → w2 → w3 → origin
 * is a loop of roughly `targetKm` once streets add their detour.
 */
export function loopWaypoints(
  origin: LatLng,
  targetKm: number,
  bearingDeg: number,
  detour = DETOUR_FACTOR,
): LatLng[] {
  const radius = targetKm / (2 * Math.PI * detour);
  const center = destinationPoint(origin, bearingDeg, radius);
  // Origin sits at bearing+180 from the centre; walk around the circle in quarter steps.
  return [bearingDeg + 270, bearingDeg, bearingDeg + 90].map((b) =>
    destinationPoint(center, b % 360, radius),
  );
}

/** Straight-line loop length through the waypoints (used to estimate when routing is unavailable). */
export function polygonKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += haversineKm(a, b);
  }
  return total;
}

const fmt = (p: LatLng) => `${p.lat},${p.lng}`;

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Google Maps URL (free, no key) that opens walking navigation for the loop. */
export function mapsWalkingUrl(origin: LatLng, waypoints: LatLng[]): string {
  return `https://www.google.com/maps/dir/?${query({
    api: '1',
    origin: fmt(origin),
    destination: fmt(origin),
    travelmode: 'walking',
    waypoints: waypoints.slice(0, 3).map(fmt).join('|'),
  })}`;
}

/** Maps Embed API directions iframe URL (free, unlimited; needs a referrer-restricted key). */
export function mapsEmbedUrl(key: string, origin: LatLng, waypoints: LatLng[]): string {
  return `https://www.google.com/maps/embed/v1/directions?${query({
    key,
    origin: fmt(origin),
    destination: fmt(origin),
    mode: 'walking',
    waypoints: waypoints.map(fmt).join('|'),
  })}`;
}
